import { BASELINE_WINDOW_DAYS, MIN_STORED_BASELINE_DAYS } from "./baseline";
import type { WellnessMarker, WellnessSignals } from "./types";
import { isPositive, round, shiftIso } from "./utils";

/**
 * Multi-day wellness patterns from a user's own history. These are prompts to rest or
 * get a checkup, never a diagnosis: the same changes follow stress, alcohol, travel or training.
 */
export interface SignalDay {
  date: string;
  steps: number;
  restingHeartRate: number | null;
  heartRateVariability: number | null;
  respiratoryRate?: number | null;
  skinTemperatureCelsius?: number | null;
  skinTemperatureDeviationCelsius?: number | null;
}

/** Nights judged for the illness pattern, ending at the newest night with a reading. */
const ILLNESS_RECENT_DAYS = 3;
/** A marker must show on this many of those nights, so one odd night never counts. */
const ILLNESS_MIN_NIGHTS = 2;
/** The newest reading must be this recent, otherwise the pattern describes the past. */
const ILLNESS_MAX_AGE_DAYS = 3;
const ILLNESS = { rhrRiseBpm: 3, hrvRatio: 0.85, breathsRise: 1, skinTempRiseC: 0.5 };
/** Markers needed together for each level; a single metric shifting alone is too common to flag. */
const ILLNESS_LEVELS = { watch: 2, attention: 3 };

/** The last 30 completed days compared with the 60 before them. */
export const DRIFT_WINDOW_DAYS = 90;
const DRIFT_RECENT_DAYS = 30;
const DRIFT_MIN_RECENT = 20;
const DRIFT_MIN_PRIOR = 30;
const DRIFT = { rhrRiseBpm: 4, hrvRatio: 0.85, stepsRatio: 0.7 };

type Metric = (d: SignalDay) => number | null | undefined;

function mean(days: SignalDay[], pick: Metric): number | null {
  const values = days.map(pick).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

const count = (days: SignalDay[], pick: Metric) => days.filter((d) => isPositive(pick(d))).length;

/** Personal average, or null until enough days carry the metric. */
const baselineOf = (days: SignalDay[], pick: Metric) => (count(days, pick) >= MIN_STORED_BASELINE_DAYS ? mean(days, pick) : null);

const daysBetween = (fromIso: string, toIso: string) => Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000);

/** Skin temperature against the device's own baseline, or against the user's stored nights when the device gives none. */
function skinTempDeviation(baseline: SignalDay[]): Metric {
  const own = baselineOf(baseline, (d) => d.skinTemperatureCelsius);
  return (d) => {
    if (typeof d.skinTemperatureDeviationCelsius === "number") return d.skinTemperatureDeviationCelsius;
    return isPositive(d.skinTemperatureCelsius) && own !== null ? d.skinTemperatureCelsius - own : null;
  };
}

/**
 * Infection or heavy strain often shows as several of these together for a few nights:
 * resting heart rate up, HRV down, breathing rate up, skin temperature up.
 */
function illnessPattern(days: SignalDay[], today: string): Pick<WellnessSignals, "illness" | "illnessChecked"> {
  const none = { illness: null, illnessChecked: [] };
  const hasNightReading = (d: SignalDay) =>
    d.restingHeartRate !== null || d.heartRateVariability !== null || isPositive(d.respiratoryRate) || isPositive(d.skinTemperatureCelsius);
  const end = days.filter(hasNightReading).at(-1)?.date;
  if (!end || daysBetween(end, today) > ILLNESS_MAX_AGE_DAYS) return none;

  const recentFrom = shiftIso(end, -(ILLNESS_RECENT_DAYS - 1));
  const recent = days.filter((d) => d.date >= recentFrom && d.date <= end);
  const baseline = days.filter((d) => d.date < recentFrom && d.date >= shiftIso(recentFrom, -BASELINE_WINDOW_DAYS));

  const markers: WellnessMarker[] = [];
  const checked: string[] = [];
  /** Second-worst recent value, so the level was reached on at least two nights. */
  const sustained = (pick: Metric, worstFirst: (a: number, b: number) => number) => {
    const values = recent.map(pick).filter((v): v is number => typeof v === "number" && Number.isFinite(v)).sort(worstFirst);
    return values[ILLNESS_MIN_NIGHTS - 1] ?? null;
  };
  const highest = (a: number, b: number) => b - a;
  const lowest = (a: number, b: number) => a - b;

  const baseRhr = baselineOf(baseline, (d) => d.restingHeartRate);
  const rhr = sustained((d) => d.restingHeartRate, highest);
  if (baseRhr !== null && rhr !== null) {
    checked.push("resting heart rate");
    const rise = rhr - baseRhr;
    if (rise >= ILLNESS.rhrRiseBpm) markers.push({ metric: "resting heart rate", detail: `+${round(rise)} bpm vs your usual ${round(baseRhr)} bpm` });
  }

  const baseHrv = baselineOf(baseline, (d) => d.heartRateVariability);
  const hrv = sustained((d) => d.heartRateVariability, lowest);
  if (baseHrv !== null && hrv !== null) {
    checked.push("HRV");
    if (hrv / baseHrv <= ILLNESS.hrvRatio) markers.push({ metric: "HRV", detail: `${round((1 - hrv / baseHrv) * 100)}% below your usual ${round(baseHrv)} ms` });
  }

  const baseBreaths = baselineOf(baseline, (d) => d.respiratoryRate);
  const breaths = sustained((d) => d.respiratoryRate, highest);
  if (baseBreaths !== null && breaths !== null) {
    checked.push("breathing rate");
    const rise = breaths - baseBreaths;
    if (rise >= ILLNESS.breathsRise) markers.push({ metric: "breathing rate", detail: `+${round(rise, 1)} breaths/min vs your usual ${round(baseBreaths, 1)}` });
  }

  const deviation = skinTempDeviation(baseline);
  const temp = sustained(deviation, highest);
  if (temp !== null) {
    checked.push("skin temperature");
    if (temp >= ILLNESS.skinTempRiseC) markers.push({ metric: "skin temperature", detail: `+${round(temp, 1)} °C above your usual` });
  }

  const level = markers.length >= ILLNESS_LEVELS.attention ? "attention" : markers.length >= ILLNESS_LEVELS.watch ? "watch" : null;
  return { illness: level ? { level, markers } : null, illnessChecked: checked };
}

/** Slow changes: the last 30 completed days against the 60 before them. */
function longTermDrift(days: SignalDay[], today: string): Pick<WellnessSignals, "drift" | "driftReady"> {
  const split = shiftIso(today, -DRIFT_RECENT_DAYS);
  const recent = days.filter((d) => d.date >= split && d.date < today);
  const prior = days.filter((d) => d.date < split && d.date >= shiftIso(today, -DRIFT_WINDOW_DAYS));
  const drift: WellnessMarker[] = [];
  let compared = 0;

  const compare = (pick: Metric, judge: (now: number, before: number) => WellnessMarker | null) => {
    if (count(recent, pick) < DRIFT_MIN_RECENT || count(prior, pick) < DRIFT_MIN_PRIOR) return;
    const [now, before] = [mean(recent.filter((d) => isPositive(pick(d))), pick), mean(prior.filter((d) => isPositive(pick(d))), pick)];
    if (now === null || before === null) return;
    compared++;
    const marker = judge(now, before);
    if (marker) drift.push(marker);
  };

  compare(
    (d) => d.restingHeartRate,
    (now, before) =>
      now - before >= DRIFT.rhrRiseBpm
        ? { metric: "resting heart rate", detail: `averaging ${round(now)} bpm over the last 30 days, up from ${round(before)} bpm in the 2 months before` }
        : null
  );
  compare(
    (d) => d.heartRateVariability,
    (now, before) =>
      now / before <= DRIFT.hrvRatio
        ? { metric: "HRV", detail: `averaging ${round(now)} ms over the last 30 days, down from ${round(before)} ms in the 2 months before` }
        : null
  );
  compare(
    (d) => d.steps,
    (now, before) =>
      now / before <= DRIFT.stepsRatio
        ? { metric: "steps", detail: `averaging ${round(now).toLocaleString()} a day over the last 30 days, down from ${round(before).toLocaleString()} in the 2 months before` }
        : null
  );
  return { drift, driftReady: compared > 0 };
}

/** Both patterns for one user. `days` are oldest first; `today` itself is ignored by the long-term comparison. */
export function wellnessSignals(days: SignalDay[], today: string): WellnessSignals {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  return { ...illnessPattern(sorted, today), ...longTermDrift(sorted, today) };
}
