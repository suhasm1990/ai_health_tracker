import type { DailyMetricSummary, PersonalBaseline } from "./types";
import { meanOf } from "./utils";

/** Long-term window used when stored history is available. */
export const BASELINE_WINDOW_DAYS = 30;
/** Fewer stored days than this and the baseline is too noisy to prefer over the 7-day window. */
export const MIN_STORED_BASELINE_DAYS = 10;

const hasData = (d: DailyMetricSummary) =>
  d.steps > 0 || d.sleepDurationMinutes > 0 || d.restingHeartRate !== null || d.heartRateVariability !== null;

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
    source,
  };
}

/** Baseline from the 7-day window alone, used when no database is configured or history is still short. */
export const recentBaseline = (history: DailyMetricSummary[], today: string) =>
  baselineFromDays(history, today, history.length, "recent");

/** Human label for UI copy, e.g. "30-day" or "7-day". */
export const baselineLabel = (b: PersonalBaseline) => `${b.source === "stored" ? b.windowDays : Math.max(b.days, 1)}-day`;
