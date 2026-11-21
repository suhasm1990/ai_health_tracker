import { GOALS } from "./constants";
import { formatClockMinutes, parseClock } from "./coach/dayPlan";
import type { DailyMetricSummary } from "./types";

/** Sleep regularity and running debt over the recent nights. */
export interface SleepHabits {
  /** 0-100; higher means steadier bed and wake times. Null with fewer than 4 nights of times. */
  consistency: number | null;
  /** Typical spread of bedtime and wake time, minutes (standard deviation). */
  bedtimeSpreadMin: number | null;
  wakeSpreadMin: number | null;
  /** Median times, e.g. "11:20 PM" */
  typicalBedtime: string | null;
  typicalWake: string | null;
  /** Shortfall against 8h summed over the nights shown, minutes. */
  debtMinutes: number;
  nights: { date: string; label: string; minutes: number; shortfall: number }[];
}

const MIN_NIGHTS = 4;

/** Bedtimes run past midnight, so measure them from 6 PM to keep 11 PM and 1 AM close together. */
const fromSixPm = (minutes: number) => (minutes - 18 * 60 + 1440) % 1440;

function spread(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
}

const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export function sleepHabits(days: DailyMetricSummary[]): SleepHabits {
  const recent = days.filter((d) => d.sleepDurationMinutes > 0).slice(-7);
  const beds = recent.map((d) => parseClock(d.sleepStartTime)).filter((m): m is number => m !== null).map(fromSixPm);
  const wakes = recent.map((d) => parseClock(d.sleepEndTime)).filter((m): m is number => m !== null);
  const enough = beds.length >= MIN_NIGHTS && wakes.length >= MIN_NIGHTS;
  const bedSpread = enough ? spread(beds) : null;
  const wakeSpread = enough ? spread(wakes) : null;
  // 15 min of typical variation scores about 95; an hour scores about 45.
  const consistency = bedSpread !== null && wakeSpread !== null ? Math.max(0, Math.min(100, Math.round(100 - ((bedSpread + wakeSpread) / 2 - 10) * 1.1))) : null;
  const nights = recent.map((d) => ({ date: d.date, label: d.label, minutes: d.sleepDurationMinutes, shortfall: Math.max(0, GOALS.sleepMinutes - d.sleepDurationMinutes) }));
  return {
    consistency,
    bedtimeSpreadMin: bedSpread === null ? null : Math.round(bedSpread),
    wakeSpreadMin: wakeSpread === null ? null : Math.round(wakeSpread),
    typicalBedtime: beds.length ? formatClockMinutes(median(beds) + 18 * 60) : null,
    typicalWake: wakes.length ? formatClockMinutes(median(wakes)) : null,
    debtMinutes: nights.reduce((sum, n) => sum + n.shortfall, 0),
    nights,
  };
}
