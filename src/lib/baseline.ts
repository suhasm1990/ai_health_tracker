import { dailyLoad } from "./effort";
import type { DailyMetricSummary, PersonalBaseline, VitalKey, VitalStats } from "./types";
import { meanOf } from "./utils";

/** Long-term window used when stored history is available. */
export const BASELINE_WINDOW_DAYS = 30;
/** Fewer stored days than this and the baseline is too noisy to prefer over the 7-day window. */
export const MIN_STORED_BASELINE_DAYS = 10;

export const hasData = (d: DailyMetricSummary) =>
  d.steps > 0 || d.sleepDurationMinutes > 0 || d.restingHeartRate !== null || d.heartRateVariability !== null;

export const VITAL_KEYS: VitalKey[] = ["restingHeartRate", "heartRateVariability", "respiratoryRate", "oxygenSaturation", "skinTemperatureDeviationCelsius"];

/** Mean and sample standard deviation of the recorded values; null with fewer than 2. Zero counts only for skin temperature deviation. */
export function statsOf(values: (number | null | undefined)[], allowZeroOrNegative = false): VitalStats | null {
  const xs = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v) && (allowZeroOrNegative || v > 0));
  if (xs.length < 2) return null;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1));
  return { mean: Number(mean.toFixed(2)), sd: Number(sd.toFixed(2)), n: xs.length };
}

/** Averages over `days`, excluding `today` so the reference never includes the day being judged. */
export function baselineFromDays(
  days: DailyMetricSummary[],
  today: string,
  windowDays: number,
  source: PersonalBaseline["source"]
): PersonalBaseline {
  const past = days.filter((d) => d.date < today && hasData(d));
  return {
    windowDays,
    days: past.length,
    restingHeartRate: meanOf(past, (d) => d.restingHeartRate),
    heartRateVariability: meanOf(past, (d) => d.heartRateVariability),
    sleepMinutes: meanOf(past, (d) => d.sleepDurationMinutes),
    steps: meanOf(past, (d) => d.steps),
    effortLoad: past.length ? Number((past.reduce((sum, d) => sum + dailyLoad(d), 0) / past.length).toFixed(1)) : null,
    vitals: Object.fromEntries(
      VITAL_KEYS.map((key) => [key, statsOf(past.map((d) => d[key]), key === "skinTemperatureDeviationCelsius")]).filter(([, stats]) => stats !== null)
    ),
    source,
  };
}

/** Baseline from the 7-day window alone, used when no database is configured or history is still short. */
export const recentBaseline = (history: DailyMetricSummary[], today: string) =>
  baselineFromDays(history, today, history.length, "recent");

/** Human label for UI copy, e.g. "30-day" or "7-day". */
export const baselineLabel = (b: PersonalBaseline) => `${b.source === "stored" ? b.windowDays : Math.max(b.days, 1)}-day`;
