import { gte, sql } from "drizzle-orm";
import { BASELINE_WINDOW_DAYS, MIN_STORED_BASELINE_DAYS } from "./baseline";
import { dailyMetrics, users, type Db } from "./db";
import type { UserSession } from "./session";
import { DRIFT_WINDOW_DAYS, wellnessSignals } from "./signals";
import { isPositive, meanOf, shiftIso, todayIso } from "./utils";

export type HealthStatus = "attention" | "watch" | "ok" | "limited" | "unknown";
export type SyncStatus = "ok" | "stale" | "reconnect" | "pending";

/** Nightly cron, so anything older than this has missed at least one run. */
const STALE_SYNC_MS = 48 * 60 * 60 * 1000;
/** Only completed days are stored, so yesterday is the newest date a healthy account has. */
const NO_DATA_AFTER_DAYS = 3;
/** Days compared against the baseline; a short window so one bad night never raises a flag. */
const RECENT_DAYS = 3;
/** Recent days must be this close to today, otherwise they describe the past. */
const RECENT_MAX_AGE_DAYS = 5;
const MIN_RECENT_READINGS = 2;

const RHR_RISE_BPM = { watch: 5, attention: 10 };
const HRV_RATIO = { watch: 0.8, attention: 0.7 };
const SLEEP_MINUTES = { watch: 360, attention: 300 };
const LOW_READINESS = 50;
/** Share of a usual day's steps below which movement counts as a marked drop. */
const STEPS_RATIO = 0.5;
/** Days looked at to tell which readings a user's device actually sends. */
const COVERAGE_DAYS = 14;

export interface AdminDay {
  date: string;
  steps: number;
  restingHeartRate: number | null;
  heartRateVariability: number | null;
  sleepMinutes: number;
  readinessScore: number | null;
  respiratoryRate: number | null;
  skinTemperatureCelsius: number | null;
  skinTemperatureDeviationCelsius: number | null;
  /** The night had Deep or REM stages, not just "asleep". */
  sleepStaged: boolean;
}

export interface AdminUserInput {
  id: string;
  email: string;
  displayName: string | null;
  timeZone: string | null;
  createdAt: Date;
  lastSyncedAt: Date | null;
  hasRefreshToken: boolean;
}

export interface AdminFlag {
  severity: "attention" | "watch";
  message: string;
  /** A 3-month change: worth a checkup, but never urgent on its own. */
  longTerm?: boolean;
}

export interface AdminUserRow extends AdminUserInput {
  syncStatus: SyncStatus;
  lastDataDate: string | null;
  healthStatus: HealthStatus;
  flags: AdminFlag[];
  /** What was actually compared, so a clear status is never read as more than it covers. */
  checked: string[];
  /** Had data before, but the device has gone quiet. */
  dataStopped: boolean;
  /** Why there is no assessment, or why it is partial. */
  note: string | null;
  /** Readings that arrived in the last two weeks, and the ones that never did. */
  receives: string[];
  notReceived: string[];
}

export interface AdminOverview {
  users: AdminUserRow[];
  attention: number;
  watch: number;
  syncIssues: number;
}

const adminEmails = () =>
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

/** Allowlist check against the encrypted session; an unset ADMIN_EMAILS means nobody is an admin. */
export function isAdmin(session: UserSession | null): boolean {
  const email = session?.user?.email?.toLowerCase();
  return Boolean(email && !session?.is_demo_mode && adminEmails().includes(email));
}

const daysBetween = (fromIso: string, toIso: string) => Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000);

const hasData = (d: AdminDay) => d.steps > 0 || d.sleepMinutes > 0 || d.restingHeartRate !== null;

function syncStatusOf(user: AdminUserInput, now: number): SyncStatus {
  if (!user.hasRefreshToken) return "reconnect";
  // A first sync that never finishes is overdue too, so it cannot stay "pending" forever.
  const overdue = now - (user.lastSyncedAt ?? user.createdAt).getTime() > STALE_SYNC_MS;
  if (overdue) return "stale";
  return user.lastSyncedAt ? "ok" : "pending";
}

/** The level reached on at least two days, so a single outlier never decides a flag. `worst` sorts the worst value first. */
function sustained(recent: AdminDay[], pick: (d: AdminDay) => number | null, worst: (a: number, b: number) => number): number | null {
  const values = recent.map(pick).filter(isPositive).sort(worst);
  return values[MIN_RECENT_READINGS - 1] ?? null;
}

const lowestFirst = (a: number, b: number) => a - b;
const highestFirst = (a: number, b: number) => b - a;

/** Personal average of a metric, or null until enough days carry that metric itself. */
function metricBaseline(days: AdminDay[], pick: (d: AdminDay) => number | null): number | null {
  return days.filter((d) => isPositive(pick(d))).length >= MIN_STORED_BASELINE_DAYS ? meanOf(days, pick) : null;
}

interface Assessment {
  flags: AdminFlag[];
  checked: string[];
  /** Metrics with recent readings but no usable baseline yet. */
  building: string[];
}

const COVERAGE: [label: string, has: (d: AdminDay) => boolean][] = [
  ["steps", (d) => d.steps > 0],
  ["sleep", (d) => d.sleepMinutes > 0],
  ["sleep stages", (d) => d.sleepStaged],
  ["resting heart rate", (d) => d.restingHeartRate !== null],
  ["HRV", (d) => d.heartRateVariability !== null],
  ["breathing rate", (d) => isPositive(d.respiratoryRate)],
  ["skin temperature", (d) => isPositive(d.skinTemperatureCelsius)],
];

/** Which kinds of reading the device sent recently, so "limited data" says what is missing. */
function coverageOf(days: AdminDay[], today: string) {
  const recent = days.filter((d) => d.date >= shiftIso(today, -COVERAGE_DAYS));
  if (!recent.length) return { receives: [], notReceived: [] };
  const receives = COVERAGE.filter(([, has]) => recent.some(has)).map(([label]) => label);
  return { receives, notReceived: COVERAGE.map(([label]) => label).filter((label) => !receives.includes(label)) };
}

/** Checks that say nothing about heart or sleep, so they cannot make a status clear. */
const ACTIVITY_ONLY = new Set(["activity", "3-month trend"]);

/** Illness pattern and 3-month changes from the shared signal rules. */
function signalFlags(days: AdminDay[], today: string): { flags: AdminFlag[]; checked: string[] } {
  const signals = wellnessSignals(days, today);
  const flags: AdminFlag[] = [];
  const checked: string[] = [];
  if (signals.illnessChecked.length >= 2) checked.push("illness pattern");
  if (signals.driftReady) checked.push("3-month trend");
  if (signals.illness) {
    flags.push({
      severity: signals.illness.level,
      message: `Possible illness pattern: ${signals.illness.markers.map((m) => `${m.metric} ${m.detail}`).join("; ")}`,
    });
  }
  for (const m of signals.drift) flags.push({ severity: "watch", longTerm: true, message: `3-month change: ${m.metric} ${m.detail}` });
  return { flags, checked };
}

/** Compares a user's last few days with their own earlier baseline. */
function assessHealth(recent: AdminDay[], baseline: AdminDay[]): Assessment {
  const result: Assessment = { flags: [], checked: [], building: [] };
  const { flags, checked, building } = result;

  const sleep = sustained(recent, (d) => d.sleepMinutes, lowestFirst);
  if (sleep !== null) {
    checked.push("sleep");
    if (sleep < SLEEP_MINUTES.watch) {
      flags.push({
        severity: sleep < SLEEP_MINUTES.attention ? "attention" : "watch",
        message: `Short sleep: ${(sleep / 60).toFixed(1)}h or less on ${MIN_RECENT_READINGS}+ recent nights`,
      });
    }
  }

  if (recent.length === RECENT_DAYS && recent.every((d) => d.readinessScore !== null && d.readinessScore < LOW_READINESS)) {
    flags.push({ severity: "watch", message: `Readiness below ${LOW_READINESS} for ${RECENT_DAYS} days` });
  }

  const rhr = sustained(recent, (d) => d.restingHeartRate, highestFirst);
  const baseRhr = metricBaseline(baseline, (d) => d.restingHeartRate);
  if (rhr !== null && baseRhr === null) building.push("heart rate");
  if (rhr !== null && baseRhr !== null) {
    checked.push("heart rate");
    const rise = rhr - baseRhr;
    if (rise >= RHR_RISE_BPM.watch) {
      flags.push({
        severity: rise >= RHR_RISE_BPM.attention ? "attention" : "watch",
        message: `Resting heart rate +${rise} bpm vs baseline on ${MIN_RECENT_READINGS}+ recent days`,
      });
    }
  }

  const hrv = sustained(recent, (d) => d.heartRateVariability, lowestFirst);
  const baseHrv = metricBaseline(baseline, (d) => d.heartRateVariability);
  if (hrv !== null && baseHrv === null) building.push("HRV");
  if (hrv !== null && baseHrv !== null) {
    checked.push("HRV");
    const ratio = hrv / baseHrv;
    if (ratio <= HRV_RATIO.watch) {
      flags.push({
        severity: ratio <= HRV_RATIO.attention ? "attention" : "watch",
        message: `HRV ${Math.round((1 - ratio) * 100)}% below baseline on ${MIN_RECENT_READINGS}+ recent days`,
      });
    }
  }

  const steps = sustained(recent, (d) => d.steps, lowestFirst);
  const baseSteps = metricBaseline(baseline, (d) => d.steps);
  if (steps !== null && baseSteps !== null) {
    checked.push("activity");
    if (steps / baseSteps <= STEPS_RATIO) {
      flags.push({
        severity: "watch",
        message: `Steps ${Math.round((1 - steps / baseSteps) * 100)}% below usual on ${MIN_RECENT_READINGS}+ recent days`,
      });
    }
  }

  return result;
}

export function assessUser(user: AdminUserInput, days: AdminDay[], now = Date.now()): AdminUserRow {
  const today = todayIso(user.timeZone ?? undefined);
  const withData = days.filter(hasData);
  const lastDataDate = withData.at(-1)?.date ?? null;
  const base = { ...user, syncStatus: syncStatusOf(user, now), lastDataDate, flags: [], checked: [], dataStopped: false, ...coverageOf(withData, today) };

  if (!lastDataDate) return { ...base, healthStatus: "unknown", note: "No device data yet" };

  const age = daysBetween(lastDataDate, today);
  const dataStopped = age >= NO_DATA_AFTER_DAYS;
  const noDataNote = dataStopped ? `No device data for ${age} days` : null;
  if (age > RECENT_MAX_AGE_DAYS) return { ...base, dataStopped, healthStatus: "unknown", note: noDataNote };

  // By calendar date, so sparse data cannot stretch "recent" across weeks.
  const recentFrom = shiftIso(lastDataDate, -(RECENT_DAYS - 1));
  const recent = withData.filter((d) => d.date >= recentFrom);
  const baseline = withData.filter((d) => d.date < recentFrom && d.date >= shiftIso(today, -BASELINE_WINDOW_DAYS));
  const health = assessHealth(recent, baseline);
  const signals = signalFlags(withData, today);
  const { building } = health;
  const flags = [...health.flags, ...signals.flags];
  const checked = [...health.checked, ...signals.checked];
  const row = { ...base, dataStopped, flags, checked };
  const buildingNote = building.length ? `Baseline still building: ${building.join(", ")}` : null;

  if (flags.length) {
    // Several short-term flags together are urgent; slow 3-month changes never escalate on their own.
    const shortTerm = flags.filter((f) => !f.longTerm);
    const healthStatus = flags.some((f) => f.severity === "attention") || shortTerm.length >= 2 ? "attention" : "watch";
    return { ...row, healthStatus, note: noDataNote ?? buildingNote };
  }
  // Clear only counts when current heart or sleep data was actually compared.
  if (dataStopped) return { ...row, healthStatus: "unknown", note: noDataNote };
  if (!checked.some((metric) => !ACTIVITY_ONLY.has(metric))) {
    return { ...row, healthStatus: "limited", note: buildingNote ?? "No recent heart rate or sleep readings" };
  }
  return { ...row, healthStatus: "ok", note: buildingNote };
}

const STATUS_ORDER: Record<HealthStatus, number> = { attention: 0, watch: 1, unknown: 2, limited: 3, ok: 4 };

/** Every registered user with sync state and a status, most concerning first. */
export async function loadAdminOverview(db: Db): Promise<AdminOverview> {
  // One spare day so every time zone's window is fully covered.
  const from = shiftIso(todayIso(), -(DRIFT_WINDOW_DAYS + 1));
  const [userRows, dayRows] = await Promise.all([
    db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        timeZone: users.timeZone,
        createdAt: users.createdAt,
        lastSyncedAt: users.lastSyncedAt,
        hasRefreshToken: sql<boolean>`${users.refreshTokenEnc} is not null`,
      })
      .from(users),
    db
      .select({
        userId: dailyMetrics.userId,
        date: dailyMetrics.date,
        steps: dailyMetrics.steps,
        restingHeartRate: dailyMetrics.restingHeartRate,
        heartRateVariability: dailyMetrics.heartRateVariability,
        sleepMinutes: dailyMetrics.sleepMinutes,
        readinessScore: dailyMetrics.readinessScore,
        // Stored inside the day's JSON only, so older rows simply read as null.
        respiratoryRate: sql<number | null>`(${dailyMetrics.data}->>'respiratoryRate')::real`,
        skinTemperatureCelsius: sql<number | null>`(${dailyMetrics.data}->>'skinTemperatureCelsius')::real`,
        skinTemperatureDeviationCelsius: sql<number | null>`(${dailyMetrics.data}->>'skinTemperatureDeviationCelsius')::real`,
        sleepStaged: sql<boolean>`coalesce(${dailyMetrics.data}->'sleepStages' @> '[{"stage":"Deep"}]' or ${dailyMetrics.data}->'sleepStages' @> '[{"stage":"REM"}]', false)`,
      })
      .from(dailyMetrics)
      .where(gte(dailyMetrics.date, from))
      .orderBy(dailyMetrics.date),
  ]);

  const byUser = new Map<string, AdminDay[]>();
  for (const day of dayRows) byUser.set(day.userId, [...(byUser.get(day.userId) ?? []), day]);
  const rows = userRows
    .map((user) => assessUser(user, byUser.get(user.id) ?? []))
    .sort((a, b) => STATUS_ORDER[a.healthStatus] - STATUS_ORDER[b.healthStatus] || a.email.localeCompare(b.email));

  return {
    users: rows,
    attention: rows.filter((u) => u.healthStatus === "attention").length,
    watch: rows.filter((u) => u.healthStatus === "watch").length,
    syncIssues: rows.filter((u) => u.syncStatus === "stale" || u.syncStatus === "reconnect" || u.dataStopped).length,
  };
}
