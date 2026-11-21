import { statsOf, VITAL_KEYS } from "./baseline";
import type { DailyMetricSummary, PersonalBaseline, VitalKey, VitalStats } from "./types";

/**
 * Overnight vitals against the user's own normal range: mean ± 1 standard deviation
 * of their recent nights, never narrower than a sensible floor so normal noise does
 * not read as a change.
 */

export interface VitalInfo {
  key: VitalKey;
  label: string;
  unit: string;
  decimals: number;
  /** Narrowest half-width of the normal range, in the vital's unit. */
  minHalfWidth: number;
  /** Which direction is the usual warning sign. */
  concern: "high" | "low" | "both";
}

export const VITALS: Record<VitalKey, VitalInfo> = {
  restingHeartRate: { key: "restingHeartRate", label: "Resting heart rate", unit: "bpm", decimals: 0, minHalfWidth: 2, concern: "high" },
  heartRateVariability: { key: "heartRateVariability", label: "Heart rate variability", unit: "ms", decimals: 0, minHalfWidth: 4, concern: "low" },
  respiratoryRate: { key: "respiratoryRate", label: "Breathing rate", unit: "br/min", decimals: 1, minHalfWidth: 0.5, concern: "high" },
  oxygenSaturation: { key: "oxygenSaturation", label: "Blood oxygen", unit: "%", decimals: 0, minHalfWidth: 1, concern: "low" },
  skinTemperatureDeviationCelsius: { key: "skinTemperatureDeviationCelsius", label: "Skin temperature", unit: "°C vs usual", decimals: 1, minHalfWidth: 0.3, concern: "high" },
};

/** Nights needed before a range is shown. */
export const MIN_RANGE_NIGHTS = 5;

export interface VitalReading {
  info: VitalInfo;
  value: number | null;
  range: { low: number; high: number; mean: number } | null;
  /** Nights the range is built from */
  nights: number;
  status: "within" | "above" | "below" | "no_reading" | "learning";
  /** Outside the range in the direction that usually matters. */
  flagged: boolean;
}

function rangeOf(stats: VitalStats, info: VitalInfo) {
  const half = Math.max(stats.sd, info.minHalfWidth);
  return { low: stats.mean - half, high: stats.mean + half, mean: stats.mean };
}

/**
 * Today's vitals with ranges. Uses the baseline's spread when it carries one,
 * otherwise works it out from the recent window (excluding today).
 */
export function vitalReadings(today: DailyMetricSummary, history: DailyMetricSummary[], baseline: PersonalBaseline): VitalReading[] {
  const prior = history.filter((d) => d.date < today.date);
  return VITAL_KEYS.map((key) => {
    const info = VITALS[key];
    const stats = baseline.vitals?.[key] ?? statsOf(prior.map((d) => d[key]), key === "skinTemperatureDeviationCelsius");
    const raw = today[key];
    const value = typeof raw === "number" && Number.isFinite(raw) && (raw !== 0 || key === "skinTemperatureDeviationCelsius") ? raw : null;
    const nights = stats?.n ?? 0;
    if (!stats || nights < MIN_RANGE_NIGHTS) return { info, value, range: null, nights, status: value === null ? "no_reading" : "learning", flagged: false };
    const range = rangeOf(stats, info);
    if (value === null) return { info, value, range, nights, status: "no_reading", flagged: false };
    const status = value > range.high ? "above" : value < range.low ? "below" : "within";
    const flagged = (status === "above" && info.concern !== "low") || (status === "below" && info.concern !== "high");
    return { info, value, range, nights, status, flagged };
  });
}

export const formatVital = (value: number, info: VitalInfo): string => {
  const text = value.toFixed(info.decimals);
  return info.key === "skinTemperatureDeviationCelsius" && value > 0 ? `+${text}` : text;
};
