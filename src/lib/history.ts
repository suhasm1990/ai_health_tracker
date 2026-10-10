import { and, eq, gte, isNotNull, lt, sql } from "drizzle-orm";
import { after } from "next/server";
import { getValidAccessToken, refreshAccessToken, type AuthState } from "./auth";
import { BASELINE_WINDOW_DAYS, MIN_STORED_BASELINE_DAYS, baselineFromDays } from "./baseline";
import { dailyMetrics, getDb, liveSnapshots, users, workouts, type Db } from "./db";
import { fetchDailyRange, type StoredWorkout } from "./health/metrics";
import { calculateReadiness } from "./readiness";
import { decryptString, encryptString } from "./session";
import type { DailyMetricSummary, HealthMetricsPayload } from "./types";
import { shiftIso, todayIso } from "./utils";

/** Days fetched for a newly connected user. */
export const BACKFILL_DAYS = 30;
/** The nightly sync re-reads a few days so late device syncs still land. */
const SYNC_LOOKBACK_DAYS = 3;
const SYNC_CONCURRENCY = 4;
const DAY_MS = 86_400_000;
/** A live payload this recent is served to every instance and the AI coach without calling Google. */
const SNAPSHOT_TTL_MS = 5 * 60 * 1000;

// One backfill per user per process, however many dashboard loads arrive meanwhile.
const backfilling = new Set<string>();

/** Stored days in [fromIso, toIso), oldest first. */
export async function loadDays(db: Db, userId: string, fromIso: string, toIso: string): Promise<DailyMetricSummary[]> {
  const rows = await db
    .select({ data: dailyMetrics.data })
    .from(dailyMetrics)
    .where(and(eq(dailyMetrics.userId, userId), gte(dailyMetrics.date, fromIso), lt(dailyMetrics.date, toIso)))
    .orderBy(dailyMetrics.date);
  return rows.map((r) => r.data);
}

/**
 * Upserts days and their workouts. Each day's readiness is scored against the
 * 30 days before it, drawn from `context` (already stored days) and the batch itself.
 */
export async function saveDays(db: Db, userId: string, days: DailyMetricSummary[], dayWorkouts: StoredWorkout[] = [], context: DailyMetricSummary[] = []) {
  if (!days.length) return;
  const byDate = new Map(context.map((d) => [d.date, d]));
  for (const d of days) byDate.set(d.date, d);
  const timeline = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));

  const rows = days.map((d) => {
    const prior = timeline.filter((p) => p.date < d.date && p.date >= shiftIso(d.date, -BASELINE_WINDOW_DAYS));
    const hasData = d.steps > 0 || d.sleepDurationMinutes > 0 || d.restingHeartRate !== null;
    const readiness = hasData ? calculateReadiness(d, prior.slice(-7), baselineFromDays(prior, d.date, BASELINE_WINDOW_DAYS, "stored")) : null;
    return {
      userId,
      date: d.date,
      steps: d.steps,
      activeZoneMinutes: d.activeZoneMinutes,
      caloriesBurned: d.caloriesBurned,
      distanceKm: d.distanceKm,
      restingHeartRate: d.restingHeartRate,
      heartRateVariability: d.heartRateVariability,
      sleepMinutes: d.sleepDurationMinutes,
      sleepScore: d.sleepScore,
      readinessScore: readiness?.score ?? null,
      data: d,
      updatedAt: new Date(),
    };
  });
  const excluded = (column: string) => sql.raw(`excluded.${column}`);
  await db
    .insert(dailyMetrics)
    .values(rows)
    .onConflictDoUpdate({
      target: [dailyMetrics.userId, dailyMetrics.date],
      set: {
        steps: excluded("steps"),
        activeZoneMinutes: excluded("active_zone_minutes"),
        caloriesBurned: excluded("calories_burned"),
        distanceKm: excluded("distance_km"),
        restingHeartRate: excluded("resting_heart_rate"),
        heartRateVariability: excluded("heart_rate_variability"),
        sleepMinutes: excluded("sleep_minutes"),
        sleepScore: excluded("sleep_score"),
        readinessScore: excluded("readiness_score"),
        data: excluded("data"),
        updatedAt: excluded("updated_at"),
      },
    });

  if (!dayWorkouts.length) return;
  await db
    .insert(workouts)
    .values(
      dayWorkouts.map(({ date, session }) => ({
        userId,
        id: session.id,
        date,
        activityType: session.activityType,
        durationMinutes: session.durationMinutes,
        data: session,
        updatedAt: new Date(),
      }))
    )
    .onConflictDoUpdate({
      target: [workouts.userId, workouts.id],
      set: {
        date: excluded("date"),
        activityType: excluded("activity_type"),
        durationMinutes: excluded("duration_minutes"),
        data: excluded("data"),
        updatedAt: excluded("updated_at"),
      },
    });
}

/** Creates or refreshes the user row; stores the refresh token encrypted so the nightly sync can run without a session. */
export async function ensureUser(db: Db, state: AuthState, timeZone?: string) {
  const { session } = state;
  const id = session!.user!.id!;
  const refreshTokenEnc = session?.refresh_token ? encryptString(session.refresh_token) : undefined;
  const profile = {
    email: session?.user?.email ?? "",
    displayName: session?.user?.displayName ?? null,
    ...(timeZone ? { timeZone } : {}),
    ...(refreshTokenEnc ? { refreshTokenEnc } : {}),
  };
  const [row] = await db
    .insert(users)
    .values({ id, ...profile })
    .onConflictDoUpdate({ target: users.id, set: { ...profile, updatedAt: new Date() } })
    .returning({ backfilledAt: users.backfilledAt });
  return row;
}

async function backfill(db: Db, userId: string, token: string, timeZone?: string, days = BACKFILL_DAYS) {
  if (backfilling.has(userId)) return;
  backfilling.add(userId);
  try {
    const today = todayIso(timeZone);
    const range = await fetchDailyRange(token, shiftIso(today, -days), shiftIso(today, -1), timeZone);
    await saveDays(db, userId, range.days, range.workouts);
    await db.update(users).set({ backfilledAt: new Date(), lastSyncedAt: new Date() }).where(eq(users.id, userId));
  } finally {
    backfilling.delete(userId);
  }
}

export interface StoredHistory {
  db: Db;
  userId: string;
  /** Stored days in the 30 days before today, oldest first. */
  days: DailyMetricSummary[];
  /** A live payload for today fetched within SNAPSHOT_TTL_MS, if any. */
  snapshot: HealthMetricsPayload | null;
}

/** Stored history for a live user, or null without a database. Errors degrade to null so the dashboard never fails on storage. */
export async function readStoredHistory(state: AuthState, today: string): Promise<StoredHistory | null> {
  const db = getDb();
  const userId = state.session?.user?.id;
  if (!db || !userId || state.isDemo) return null;
  try {
    const [days, snapshots] = await Promise.all([
      loadDays(db, userId, shiftIso(today, -BASELINE_WINDOW_DAYS), today),
      db
        .select({ payload: liveSnapshots.payload })
        .from(liveSnapshots)
        .where(
          and(
            eq(liveSnapshots.userId, userId),
            eq(liveSnapshots.date, today),
            gte(liveSnapshots.fetchedAt, new Date(Date.now() - SNAPSHOT_TTL_MS))
          )
        ),
    ]);
    return { db, userId, days, snapshot: snapshots[0]?.payload ?? null };
  } catch (err) {
    console.error("Loading stored history failed:", err);
    return null;
  }
}

/**
 * Completes a freshly fetched payload: swaps in the 30-day baseline once enough days
 * are stored, and after the response saves the days that came from Google, the
 * shared snapshot, and (on first sight) a 30-day backfill.
 */
export function finishLiveLoad(
  state: AuthState,
  stored: StoredHistory | null,
  payload: HealthMetricsPayload,
  fetchedDays: DailyMetricSummary[],
  timeZone?: string
): HealthMetricsPayload {
  if (!stored) return payload;
  const { db, userId, days } = stored;
  const today = payload.today.date;
  const baseline = baselineFromDays(days, today, BASELINE_WINDOW_DAYS, "stored");
  const result = baseline.days >= MIN_STORED_BASELINE_DAYS ? { ...payload, baseline } : payload;

  try {
    after(async () => {
      try {
        const user = await ensureUser(db, state, timeZone);
        await Promise.all([
          // Today is still in progress and may hold fallback readings, so only completed days are stored.
          saveDays(db, userId, fetchedDays.filter((d) => d.date < today), [], days),
          db
            .insert(liveSnapshots)
            .values({ userId, date: today, payload: result, fetchedAt: new Date() })
            .onConflictDoUpdate({
              target: [liveSnapshots.userId, liveSnapshots.date],
              set: { payload: sql.raw("excluded.payload"), fetchedAt: sql.raw("excluded.fetched_at") },
            }),
        ]);
        if (!user?.backfilledAt) {
          const token = await getValidAccessToken(state.session);
          if (token) await backfill(db, userId, token, timeZone);
        }
      } catch (err) {
        console.error("Saving health history failed:", err);
      }
    });
  } catch (err) {
    // after() is only available inside a request; nothing to persist otherwise.
    console.warn("Skipping history persistence outside a request:", err);
  }
  return result;
}

type SyncOutcome = "synced" | "failed";

async function syncUser(db: Db, user: typeof users.$inferSelect): Promise<SyncOutcome> {
  const refreshToken = decryptString(user.refreshTokenEnc ?? undefined);
  const token = refreshToken ? await refreshAccessToken(refreshToken) : null;
  if (!token) return "failed";

  const timeZone = user.timeZone ?? undefined;
  if (!user.backfilledAt) {
    await backfill(db, user.id, token, timeZone);
    return "synced";
  }
  // Cover any nights the cron missed, plus a few days for late device syncs.
  const missedDays = user.lastSyncedAt ? Math.ceil((Date.now() - user.lastSyncedAt.getTime()) / DAY_MS) : BACKFILL_DAYS;
  const lookback = Math.min(BACKFILL_DAYS, Math.max(SYNC_LOOKBACK_DAYS, missedDays + 1));
  const today = todayIso(timeZone);
  const start = shiftIso(today, -lookback);
  const [range, context] = await Promise.all([
    fetchDailyRange(token, start, shiftIso(today, -1), timeZone),
    loadDays(db, user.id, shiftIso(start, -BASELINE_WINDOW_DAYS), start),
  ]);
  await saveDays(db, user.id, range.days, range.workouts, context);
  await Promise.all([
    db.update(users).set({ lastSyncedAt: new Date() }).where(eq(users.id, user.id)),
    // Snapshots only matter for the current day.
    db.delete(liveSnapshots).where(and(eq(liveSnapshots.userId, user.id), lt(liveSnapshots.date, shiftIso(today, -1)))),
  ]);
  return "synced";
}

/** Nightly job: refreshes every user with a stored refresh token and saves their recent days. */
export async function syncAllUsers(): Promise<{ users: number; synced: number; failed: number; skipped: boolean }> {
  const db = getDb();
  if (!db) return { users: 0, synced: 0, failed: 0, skipped: true };

  const queue = await db.select().from(users).where(isNotNull(users.refreshTokenEnc));
  const total = queue.length;
  let synced = 0;
  let failed = 0;
  const worker = async () => {
    for (let user = queue.shift(); user; user = queue.shift()) {
      const outcome = await syncUser(db, user).catch((err): SyncOutcome => {
        console.error(`Sync failed for user ${user!.id}:`, err);
        return "failed";
      });
      if (outcome === "synced") synced++;
      else failed++;
    }
  };
  await Promise.all(Array.from({ length: SYNC_CONCURRENCY }, worker));
  return { users: total, synced, failed, skipped: false };
}
