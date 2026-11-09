import { isoToCivil, shiftIso } from "../utils";
import type { DistanceUnit, GoalMetric, RaceDistance } from "./types";

export const KM_PER_MI = 1.609344;

export const RACE_KM: Record<RaceDistance, number> = { "5k": 5, "10k": 10, half: 21.0975, marathon: 42.195 };
export const RACE_LABEL: Record<RaceDistance, string> = { "5k": "5K", "10k": "10K", half: "half marathon", marathon: "marathon" };

export const toUnit = (km: number, unit: DistanceUnit): number => (unit === "mi" ? km / KM_PER_MI : km);
export const fromUnit = (value: number, unit: DistanceUnit): number => (unit === "mi" ? value * KM_PER_MI : value);

/** Rounds a km distance to the nearest half unit in the display unit, returned in km. */
export const roundToHalfUnit = (km: number, unit: DistanceUnit): number => fromUnit(Math.round(toUnit(km, unit) * 2) / 2, unit);

const trim = (n: number, digits: number) => String(Number(n.toFixed(digits)));

/** "5 mi", "12.5 km"; one decimal below 100. */
export function formatDistance(km: number, unit: DistanceUnit, digits = 1): string {
  const value = toUnit(km, unit);
  return `${trim(value, value >= 100 ? 0 : digits)} ${unit}`;
}

/** "11:27 /mi" */
export function formatPace(secPerKm: number, unit: DistanceUnit): string {
  const sec = Math.round(unit === "mi" ? secPerKm * KM_PER_MI : secPerKm);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")} /${unit}`;
}

/** "4:59:00", "24:30" */
export function formatTime(totalSec: number): string {
  const s = Math.round(totalSec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

/**
 * Parses "4:30:00", "4:30" or "25:00". Two parts read as h:mm for a half or longer
 * (nobody runs a half in 2 minutes), and as mm:ss for shorter races.
 */
export function parseTime(raw: unknown, distanceKm: number): number | null {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return Math.round(raw);
  if (typeof raw !== "string") return null;
  const parts = raw.trim().replace(/[^\d:]/g, "").split(":").filter(Boolean).map(Number);
  if (!parts.length || parts.some((p) => !Number.isFinite(p))) return null;
  let sec: number;
  if (parts.length === 3) sec = parts[0] * 3600 + parts[1] * 60 + parts[2];
  else if (parts.length === 2) sec = distanceKm >= 21 ? parts[0] * 3600 + parts[1] * 60 : parts[0] * 60 + parts[1];
  else sec = parts[0] * 60; // a bare number is minutes
  // Sanity bounds: faster than world-record-ish pace or slower than 20 min/km is a typo.
  const pace = sec / distanceKm;
  return pace >= 150 && pace <= 1200 ? sec : null;
}

/** Riegel race-time prediction: T2 = T1 x (D2/D1)^1.06. */
export const predictTime = (sec: number, fromKm: number, toKm: number): number => sec * Math.pow(toKm / fromKm, 1.06);

/* ---------- calendar ---------- */

const weekday = (iso: string) => {
  const { year, month, day } = isoToCivil(iso);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
};

/** Monday on or before the date. */
export const mondayOf = (iso: string): string => shiftIso(iso, -((weekday(iso) + 6) % 7));

export function daysBetween(fromIso: string, toIso: string): number {
  const a = isoToCivil(fromIso);
  const b = isoToCivil(toIso);
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000);
}

export const formatLongDate = (iso: string): string => {
  const { year, month, day } = isoToCivil(iso);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
};

/* ---------- activity goal metrics ---------- */

export const METRIC_INFO: Record<GoalMetric, { label: string; isDistance: boolean; unitLabel: string; verb: string }> = {
  steps: { label: "Steps", isDistance: false, unitLabel: "steps", verb: "Walk" },
  distance: { label: "Distance", isDistance: true, unitLabel: "", verb: "Cover" },
  walk_distance: { label: "Walking distance", isDistance: true, unitLabel: "", verb: "Walk" },
  run_distance: { label: "Running distance", isDistance: true, unitLabel: "", verb: "Run" },
  active_minutes: { label: "Active zone minutes", isDistance: false, unitLabel: "min", verb: "Earn" },
  workouts: { label: "Workouts", isDistance: false, unitLabel: "workouts", verb: "Log" },
  runs: { label: "Runs", isDistance: false, unitLabel: "runs", verb: "Log" },
};

/** A metric value in its display form: "300,000 steps", "50 mi". */
export function formatMetric(value: number, metric: GoalMetric, unit: DistanceUnit): string {
  const info = METRIC_INFO[metric];
  if (info.isDistance) return formatDistance(value, unit);
  return `${Math.round(value).toLocaleString("en-US")} ${info.unitLabel}`;
}

/** Value in the unit the user sees (distance converted, everything else as is). */
export const displayValue = (value: number, metric: GoalMetric, unit: DistanceUnit): number =>
  METRIC_INFO[metric].isDistance ? toUnit(value, unit) : value;
