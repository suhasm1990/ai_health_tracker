import { gte, sql } from "drizzle-orm";
import { BASELINE_WINDOW_DAYS, MIN_STORED_BASELINE_DAYS } from "./baseline";
import { dailyMetrics, users, type Db } from "./db";
import type { UserSession } from "./session";
import { DRIFT_WINDOW_DAYS, wellnessSignals } from "./signals";
import { isPositive, meanOf, shiftIso, todayIso } from "./utils";

export type HealthStatus = "attention" | "watch" | "ok" | "limited" | "unknown";
export type SyncStatus = "ok" | "stale" | "reconnect" | "pending";

/** Daily cron, so a gap past a day plus slack for a late run means at least one run was missed. */
const STALE_SYNC_MS = 36 * 60 * 60 * 1000;
/** Only completed days are stored, so yesterday is the newest date a healthy account has. */
const NO_DATA_AFTER_DAYS = 3;
/** Days compared against the baseline; a short window so one bad night never raises a flag. */
const RECENT_DAYS = 3;
/** Recent days must be this close to today, otherwise they describe the past. */
const RECENT_MAX_AGE_DAYS = 5;
const MIN_RECENT_READINGS = 2;

const RHR_RISE_BPM = { watch: 5, attention: 10 };
const HRV_RATIO = { watch: 0.8, attention: 0.7 };
const SLEEP_MINUTES = { watch: 360, attention: 240 };
/** Recent sleep within this of a user's own short usual is their normal, not a new change. */
const SLEEP_HABIT_MARGIN_MINUTES = 45;
const LOW_READINESS = 50;
/** Share of a usual day's steps below which movement counts as a marked drop. */
const STEPS_RATIO = 0.5;
/** Days looked at to tell which readings a user's device actually sends. */
const COVERAGE_DAYS = 14;
/** Days averaged for the per-user metric summary. */
const SUMMARY_DAYS = 7;
/** Data this recent counts a user as active. */
const ACTIVE_WITHIN_DAYS = 2;

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

/**
 * Body system a flag reads. Flags in one domain are one piece of evidence, so only flags
 * from different domains escalate together. "recovery" is the readiness score, which is
 * itself built from sleep, HRV and heart rate, so it never counts as separate evidence.
 */
export type FlagDomain = "sleep" | "heart" | "activity" | "recovery";

export interface AdminFlag {
  severity: "attention" | "watch";
  message: string;
  domain: FlagDomain;
  /** A slow or habitual pattern (3-month change, usual short sleep): worth a conversation, never urgent on its own. */
  longTerm?: boolean;
}

/** Last 7 days with data against the user's own 30 days before them. */
export interface AdminMetric {
  recent: number | null;
  usual: number | null;
}

export interface AdminMetrics {
  sleepMinutes: AdminMetric;
  restingHeartRate: AdminMetric;
  heartRateVariability: AdminMetric;
  steps: AdminMetric;
  /** Latest readiness score. */
  readiness: number | null;
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
  metrics: AdminMetrics;
  /** The last 14 completed days, oldest first, and whether each one has device data. */
  recentDays: { date: string; hasData: boolean }[];
}

export interface AdminOverview {
  users: AdminUserRow[];
  attention: number;
  watch: number;
  ok: number;
  /** Limited or no assessment: missing data, or baselines still building. */
  notAssessed: number;
  syncIssues: number;
  /** Users with device data in the last two days. */
  active: number;
  /** Newest successful sync across all users, a proxy for the nightly job running. */
  lastSyncAt: Date | null;
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

const hours = (minutes: number) => `${(minutes / 60).toFixed(1)}h`;

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

const ILLNESS_PREFIX = "Possible illness pattern: ";

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
      domain: "heart",
      message: `${ILLNESS_PREFIX}${signals.illness.markers.map((m) => `${m.metric} ${m.detail}`).join("; ")}`,
    });
  }
  for (const m of signals.drift) {
    flags.push({ severity: "watch", domain: m.metric === "steps" ? "activity" : "heart", longTerm: true, message: `3-month change: ${m.metric} ${m.detail}` });
  }
  return { flags, checked };
}

/** Compares a user's last few days with their own earlier baseline. */
function assessHealth(recent: AdminDay[], baseline: AdminDay[]): Assessment {
  const result: Assessment = { flags: [], checked: [], building: [] };
  const { flags, checked, building } = result;

  const sleep = sustained(recent, (d) => d.sleepMinutes, lowestFirst);
  const baseSleep = metricBaseline(baseline, (d) => d.sleepMinutes);
  if (sleep !== null) {
    checked.push("sleep");
    if (sleep < SLEEP_MINUTES.watch) {
      // Someone who always sleeps this little has a habit worth raising, not a new change.
      const habitual = baseSleep !== null && baseSleep < SLEEP_MINUTES.watch && sleep >= baseSleep - SLEEP_HABIT_MARGIN_MINUTES;
      flags.push(
        habitual
          ? { severity: "watch", domain: "sleep", longTerm: true, message: `Usually sleeps under 6h: ${hours(baseSleep)} a night over the last month` }
          : {
              severity: sleep < SLEEP_MINUTES.attention ? "attention" : "watch",
              domain: "sleep",
              message: `Short sleep: ${hours(sleep)} or less on ${MIN_RECENT_READINGS} of the last ${RECENT_DAYS} nights${baseSleep ? ` (usual ${hours(baseSleep)})` : ""}`,
            }
      );
    }
  }

  if (recent.length === RECENT_DAYS && recent.every((d) => d.readinessScore !== null && d.readinessScore < LOW_READINESS)) {
    flags.push({ severity: "watch", domain: "recovery", message: `Readiness below ${LOW_READINESS} for ${RECENT_DAYS} days in a row` });
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
        domain: "heart",
        message: `Resting heart rate +${rise} bpm above usual ${baseRhr} bpm on ${MIN_RECENT_READINGS} of the last ${RECENT_DAYS} days`,
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
        domain: "heart",
        message: `HRV ${Math.round((1 - ratio) * 100)}% below usual ${baseHrv} ms on ${MIN_RECENT_READINGS} of the last ${RECENT_DAYS} days`,
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
        domain: "activity",
        message: `Steps ${Math.round((1 - steps / baseSteps) * 100)}% below usual ${baseSteps.toLocaleString("en-US")} on ${MIN_RECENT_READINGS} of the last ${RECENT_DAYS} days`,
      });
    }
  }

  return result;
}

/** Last 7 days ending at the newest data against the 30 days before them, for the per-user summary. */
function metricsOf(withData: AdminDay[], lastDataDate: string | null): AdminMetrics {
  const recentFrom = lastDataDate ? shiftIso(lastDataDate, -(SUMMARY_DAYS - 1)) : "";
  const recent = lastDataDate ? withData.filter((d) => d.date >= recentFrom) : [];
  const usual = lastDataDate ? withData.filter((d) => d.date < recentFrom && d.date >= shiftIso(recentFrom, -BASELINE_WINDOW_DAYS)) : [];
  const metric = (pick: (d: AdminDay) => number | null): AdminMetric => ({ recent: meanOf(recent, pick), usual: metricBaseline(usual, pick) });
  return {
    sleepMinutes: metric((d) => d.sleepMinutes),
    restingHeartRate: metric((d) => d.restingHeartRate),
    heartRateVariability: metric((d) => d.heartRateVariability),
    steps: metric((d) => d.steps),
    readiness: [...recent].reverse().find((d) => d.readinessScore !== null)?.readinessScore ?? null,
  };
}

/** Every completed day in the coverage window, so gaps show at a glance. */
function recentDaysOf(withData: AdminDay[], today: string) {
  const dates = new Set(withData.map((d) => d.date));
  return Array.from({ length: COVERAGE_DAYS }, (_, i) => {
    const date = shiftIso(today, i - COVERAGE_DAYS);
    return { date, hasData: dates.has(date) };
  });
}

/**
 * Attention when any single flag is severe, or when short-term changes show up in two
 * independent body systems (say sleep and heart). Several flags from one system, such as
 * resting heart rate, HRV and the illness pattern that combines them, are one piece of
 * evidence; readiness is built from those same readings and never counts on its own.
 */
function statusOf(flags: AdminFlag[]): "attention" | "watch" {
  if (flags.some((f) => f.severity === "attention")) return "attention";
  const domains = new Set(flags.filter((f) => !f.longTerm && f.domain !== "recovery").map((f) => f.domain));
  return domains.size >= 2 ? "attention" : "watch";
}

const SEVERITY_ORDER = { attention: 0, watch: 1 } as const;

/** The illness pattern already names the heart rate and HRV changes, so separate flags for them only add noise unless they are more severe. */
function withoutRepeats(flags: AdminFlag[]): AdminFlag[] {
  const illness = flags.find((f) => f.message.startsWith(ILLNESS_PREFIX));
  if (!illness) return flags;
  return flags.filter((f) => f === illness || f.longTerm || f.domain !== "heart" || SEVERITY_ORDER[f.severity] < SEVERITY_ORDER[illness.severity]);
}

export function assessUser(user: AdminUserInput, days: AdminDay[], now = Date.now()): AdminUserRow {
  const today = todayIso(user.timeZone ?? undefined);
  const withData = days.filter(hasData);
  const lastDataDate = withData.at(-1)?.date ?? null;
  const base = {
    ...user,
    syncStatus: syncStatusOf(user, now),
    lastDataDate,
    flags: [],
    checked: [],
    dataStopped: false,
    ...coverageOf(withData, today),
    metrics: metricsOf(withData, lastDataDate),
    recentDays: recentDaysOf(withData, today),
  };

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
  // Most severe and most recent first, so the first line is the reason for the status.
  const flags = withoutRepeats([...health.flags, ...signals.flags]).sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || Number(Boolean(a.longTerm)) - Number(Boolean(b.longTerm))
  );
  const checked = [...health.checked, ...signals.checked];
  const row = { ...base, dataStopped, flags, checked };
  const buildingNote = building.length ? `Baseline still building: ${building.join(", ")}` : null;

  if (flags.length) return { ...row, healthStatus: statusOf(flags), note: noDataNote ?? buildingNote };
  // Clear only counts when current heart or sleep data was actually compared.
  if (dataStopped) return { ...row, healthStatus: "unknown", note: noDataNote };
  if (!checked.some((metric) => !ACTIVITY_ONLY.has(metric))) {
    return { ...row, healthStatus: "limited", note: buildingNote ?? "No recent heart rate or sleep readings" };
  }
  return { ...row, healthStatus: "ok", note: buildingNote };
}

/** Sync overdue, signed out, or the device stopped sending data. */
export const hasSyncIssue = (u: Pick<AdminUserRow, "syncStatus" | "dataStopped">) => u.syncStatus === "stale" || u.syncStatus === "reconnect" || u.dataStopped;

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

  const count = (match: (u: AdminUserRow) => boolean) => rows.filter(match).length;
  const syncTimes = rows.map((u) => u.lastSyncedAt?.getTime() ?? 0).filter(Boolean);
  const nowIso = todayIso();
  return {
    users: rows,
    attention: count((u) => u.healthStatus === "attention"),
    watch: count((u) => u.healthStatus === "watch"),
    ok: count((u) => u.healthStatus === "ok"),
    notAssessed: count((u) => u.healthStatus === "limited" || u.healthStatus === "unknown"),
    syncIssues: count(hasSyncIssue),
    active: count((u) => u.lastDataDate !== null && daysBetween(u.lastDataDate, nowIso) <= ACTIVE_WITHIN_DAYS),
    lastSyncAt: syncTimes.length ? new Date(Math.max(...syncTimes)) : null,
  };
}
