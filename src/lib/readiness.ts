import { GOALS } from "./constants";
import type { DailyMetricSummary } from "./types";
import { formatDuration, meanOf, restorativeMinutes } from "./utils";

export type ReadinessTheme = "emerald" | "teal" | "amber";

export interface ReadinessFactor {
  score: number;
  max: number;
  status: string;
  description: string;
  valueFormatted: string;
}

export interface ReadinessBreakdown {
  /** 0-100 */
  score: number;
  tier: { label: string; subtitle: string; theme: ReadinessTheme; guidance: string };
  factors: {
    autonomic: ReadinessFactor & { hrvMs: number | null; baselineHrvMs: number; ratio: number; isPeak: boolean };
    sleep: ReadinessFactor & { sleepScore: number; durationMinutes: number };
    cardiac: ReadinessFactor & { restingHr: number | null; baselineRestingHr: number; diffBpm: number };
    vitality: ReadinessFactor & { steps: number; strainLevel: "Low" | "Moderate" | "High" };
  };
}

export const FACTOR_MAX = { autonomic: 40, sleep: 35, cardiac: 15, vitality: 10 } as const;

/** Population adult reference RMSSD used until a personal baseline exists. */
const REFERENCE_HRV_MS = 26;
const REFERENCE_RESTING_HR = 70;

/** Autonomic tone bands: HRV / rolling-baseline ratio thresholds (Plews & Buchheit, 2014). */
const HRV_BANDS: { min: number; score: number; status: string; describe: (hrv: number, ratio: number) => string }[] = [
  { min: 1.15, score: 40, status: "Peak Recovery", describe: (h, r) => `HRV is ${h} ms (+${pctDelta(r)}% above rolling baseline), signaling parasympathetic supercompensation.` },
  { min: 1.05, score: 36, status: "Optimal", describe: (h, r) => `HRV is ${h} ms (+${pctDelta(r)}% above baseline), reflecting optimal vagal modulation.` },
  { min: 0.95, score: 31, status: "Balanced", describe: (h) => `HRV of ${h} ms matches your personal physiological baseline.` },
  { min: 0.85, score: 24, status: "Mild Suppression", describe: (h, r) => `HRV is ${h} ms (${pctDelta(r)}% below baseline), showing mild autonomic fatigue.` },
  { min: 0.7, score: 18, status: "Suppressed", describe: (h, r) => `HRV is ${h} ms (${pctDelta(r)}% below baseline), reflecting delayed autonomic recovery.` },
  { min: 0, score: 10, status: "Elevated Strain", describe: (h) => `HRV is ${h} ms, indicating heavy sympathetic stress.` },
];

const pctDelta = (ratio: number) => Math.round(Math.abs(ratio - 1) * 100);

/**
 * Four-pillar readiness score (0-100):
 *  1. Autonomic tone / HRV vs rolling 7-day baseline (40 pts)
 *  2. Sleep restoration: sleep score and Deep + REM share (35 pts)
 *  3. Cardiac rest: resting HR vs 7-day baseline (15 pts)
 *  4. Vitality & acute strain from today's movement (10 pts)
 */
export function calculateReadiness(today: DailyMetricSummary, history: DailyMetricSummary[] = []): ReadinessBreakdown {
  const hrv = today.heartRateVariability;
  const rhr = today.restingHeartRate;
  const baselineHrvMs = meanOf(history, (d) => d.heartRateVariability) ?? REFERENCE_HRV_MS;
  const baselineRestingHr = meanOf(history, (d) => d.restingHeartRate) ?? rhr ?? REFERENCE_RESTING_HR;
  const hrDiff = rhr ? baselineRestingHr - rhr : 0;

  // 1. Autonomic
  let autonomic = { score: 32, status: "Balanced", description: "Autonomic tone is aligned with physiological baseline.", ratio: 1, isPeak: false };
  if (hrv && baselineHrvMs > 0) {
    const ratio = Number((hrv / baselineHrvMs).toFixed(2));
    const band = HRV_BANDS.find((b) => ratio >= b.min)!;
    autonomic = { score: band.score, status: band.status, description: band.describe(hrv, ratio), ratio, isPeak: band.score === 40 };
  } else if (rhr) {
    autonomic = { ...autonomic, score: hrDiff >= 3 ? 38 : hrDiff >= 0 ? 35 : 28, description: "HRV not captured; autonomic tone estimated from resting cardiac recovery." };
  }

  // 2. Sleep
  const sleepMins = today.sleepDurationMinutes;
  const sleepScore = today.sleepScore || (sleepMins ? Math.min(100, Math.round((sleepMins / GOALS.sleepMinutes) * 85)) : 75);
  const restorativeShare = sleepMins > 0 ? restorativeMinutes(today.sleepStages) / sleepMins : 0;
  const basePts = Math.round((sleepScore / 100) * FACTOR_MAX.sleep);
  const sleepPts = sleepScore >= 90 ? 35 : sleepScore >= 85 || restorativeShare >= 0.35 ? Math.max(34, basePts) : basePts;
  const sleepStatus = sleepScore >= 85 ? "Optimal" : sleepScore >= 75 ? "Good" : sleepScore >= 60 ? "Moderate" : "Insufficient";

  // 3. Cardiac
  let cardiac = { score: 14, status: "Stable", description: `Resting HR logged at ${rhr || baselineRestingHr} bpm.` };
  if (rhr) {
    cardiac =
      hrDiff >= 2
        ? { score: 15, status: "Superior Rest", description: `Resting HR is ${rhr} bpm (${hrDiff} bpm lower than 7-day average), reflecting deep cardiovascular rest.` }
        : hrDiff >= -1
          ? { score: 15, status: "Optimal Homeostasis", description: `Resting HR of ${rhr} bpm aligns comfortably with your baseline (${baselineRestingHr} bpm).` }
          : hrDiff >= -3
            ? { score: 12, status: "Mild Strain", description: `Resting HR is ${rhr} bpm (+${Math.abs(hrDiff)} bpm vs baseline), indicating mild physiological workload.` }
            : { score: 8, status: "Elevated", description: `Resting HR is elevated at ${rhr} bpm (+${Math.abs(hrDiff)} bpm vs baseline).` };
  }

  // 4. Vitality
  const steps = today.steps;
  const stepsText = `${steps.toLocaleString()} steps`;
  const vitality =
    steps > 15000
      ? { score: 7, strainLevel: "High" as const, status: "Strained", description: `High physical strain accumulated today (${stepsText}).` }
      : steps > 8000
        ? { score: 9, strainLevel: "Moderate" as const, status: "Active", description: `Moderate active movement logged today (${stepsText}).` }
        : { score: 10, strainLevel: "Low" as const, status: "Fresh", description: `Fresh physical capacity with low morning strain (${stepsText}).` };

  const score = Math.min(100, Math.max(0, autonomic.score + sleepPts + cardiac.score + vitality.score));

  const tier: ReadinessBreakdown["tier"] =
    score >= 85
      ? {
          label: "Primed for Performance",
          subtitle: "High Readiness",
          theme: "emerald",
          guidance: autonomic.isPeak
            ? `Your autonomic recovery hit a peak today (HRV at ${hrv} ms). With optimal sleep restoration (${sleepScore}/100), your body has the green light to push harder, tackle challenging workouts, or maintain sustained focus.`
            : "Your cardiovascular recovery, restorative sleep, and autonomic tone are primed today. Excellent day for a high-intensity session or personal record attempt.",
        }
      : score >= 65
        ? {
            label: "Steady Recovery",
            subtitle: "Moderate Readiness",
            theme: "teal",
            guidance: "Your recovery is solid and stable around baseline. A great day for moderate cardio, routine strength training, or sustained work capacity.",
          }
        : {
            label: "Rest & Active Recovery",
            subtitle: "Recharge Needed",
            theme: "amber",
            guidance: "Physiological strain or sleep debt is elevated today. Prioritize hydration, restorative mobility, light walks, and an earlier bedtime tonight.",
          };

  return {
    score,
    tier,
    factors: {
      autonomic: { ...autonomic, max: FACTOR_MAX.autonomic, valueFormatted: hrv ? `${hrv} ms` : "Estimated", hrvMs: hrv, baselineHrvMs },
      sleep: {
        score: sleepPts,
        max: FACTOR_MAX.sleep,
        status: sleepStatus,
        description: sleepMins > 0 ? `Logged ${formatDuration(sleepMins)} with a Sleep Score of ${sleepScore}/100.` : "Sleep session not recorded; using baseline recovery assumptions.",
        valueFormatted: `${sleepScore}/100`,
        sleepScore,
        durationMinutes: sleepMins,
      },
      cardiac: { ...cardiac, max: FACTOR_MAX.cardiac, valueFormatted: rhr ? `${rhr} bpm` : "Baseline", restingHr: rhr, baselineRestingHr, diffBpm: hrDiff },
      vitality: { ...vitality, max: FACTOR_MAX.vitality, valueFormatted: stepsText, steps },
    },
  };
}
