import { GOALS, HR_ZONE_THRESHOLDS } from "./constants";
import type { DailyMetricSummary, HeartRateZone, SleepStage, SleepStageSegment } from "./types";

/* ---------- numbers ---------- */

export const isPositive = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

/** Rounded mean of the positive values picked from `items`, or null when there are none. */
export function meanOf<T>(items: T[], pick: (item: T) => number | null | undefined): number | null {
  const values = items.map(pick).filter(isPositive);
  return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
}

/** Percentage of `value` against `total`, clamped to 0-100. */
export const pct = (value: number, total: number): number =>
  total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;

export const round = (value: number, decimals = 0): number => Number(value.toFixed(decimals));

/* ---------- dates ---------- */

export interface CivilDate {
  year: number;
  month: number;
  day: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

export const civilToIso = ({ year, month, day }: CivilDate): string => `${year}-${pad(month)}-${pad(day)}`;

export function isoToCivil(iso: string): CivilDate {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month, day };
}

export const isValidIsoDate = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));

/** Shift an ISO date by whole days (calendar arithmetic, timezone-free). */
export function shiftIso(iso: string, days: number): string {
  const { year, month, day } = isoToCivil(iso);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return civilToIso({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() });
}

/** Calendar date and hour of `date` as observed in `timeZone` (falls back to the runtime zone). */
export function civilInZone(date: Date, timeZone?: string): CivilDate & { hour: number } {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
    }).formatToParts(date);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") };
  } catch {
    return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(), hour: date.getHours() };
  }
}

export const todayIso = (timeZone?: string): string => civilToIso(civilInZone(new Date(), timeZone));

/** The browser's calendar date and IANA timezone, sent with requests so the server works with the user's "today". */
export function clientLocale(): { clientDate: string; tz?: string } {
  let tz: string | undefined;
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    /* timezone unavailable; the server falls back to its own clock */
  }
  return { clientDate: todayIso(), tz };
}

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** "Today" for the current date, otherwise the short weekday name. */
export function dayLabel(iso: string, today: string): string {
  if (iso === today) return "Today";
  const { year, month, day } = isoToCivil(iso);
  return WEEKDAY_SHORT[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

/** "Sep 21" style label for an ISO date. */
export function formatShortDate(iso: string): string {
  const { year, month, day } = isoToCivil(iso);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** ISO dates for the last `count` days ending at `endIso`, oldest first. */
export const lastDays = (endIso: string, count: number): string[] =>
  Array.from({ length: count }, (_, i) => shiftIso(endIso, i - (count - 1)));

/* ---------- formatting ---------- */

export const formatDuration = (minutes: number): string => `${Math.floor(minutes / 60)}h ${minutes % 60}m`;

/** "HH:00" label for an hour of the day. */
export const hourLabel = (hour: number): string => `${String(hour).padStart(2, "0")}:00`;

export const formatClock = (date = new Date()): string =>
  date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function formatRelativeTime(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (!Number.isFinite(seconds)) return "Recently";
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Renders a nullable metric with its unit, or a dash. */
export const withUnit = (value: number | null | undefined, unit: string): string =>
  isPositive(value) ? `${value.toLocaleString()} ${unit}` : "—";

/* ---------- domain helpers ---------- */

export function zoneForBpm(bpm: number): HeartRateZone {
  return HR_ZONE_THRESHOLDS.find(([, min]) => bpm >= min)?.[0] ?? "Resting";
}

export const stageMinutes = (stages: SleepStageSegment[], stage: SleepStage): number =>
  stages.find((s) => s.stage === stage)?.durationMinutes ?? 0;

export const restorativeMinutes = (stages: SleepStageSegment[]): number =>
  stageMinutes(stages, "Deep") + stageMinutes(stages, "REM");

/** A day with no recorded data; spread real values over it. */
export const emptyDay = (date: string, label: string): DailyMetricSummary => ({
  date,
  label,
  steps: 0,
  stepsGoal: GOALS.steps,
  activeZoneMinutes: 0,
  activeZoneMinutesGoal: GOALS.activeZoneMinutes,
  caloriesBurned: 0,
  caloriesGoal: GOALS.calories,
  distanceKm: 0,
  floors: 0,
  restingHeartRate: null,
  avgHeartRate: null,
  maxHeartRate: null,
  heartRateVariability: null,
  oxygenSaturation: null,
  respiratoryRate: null,
  sleepDurationMinutes: 0,
  sleepScore: 0,
  sleepEfficiency: null,
  sleepStages: [],
  sleepStartTime: null,
  sleepEndTime: null,
  weightKg: null,
  fatBurnMinutes: 0,
  cardioPeakMinutes: 0,
});
