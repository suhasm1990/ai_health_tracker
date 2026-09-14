import { DailyMetricSummary } from "./types";

export interface ReadinessFactor {
  score: number;
  max: number;
  status: string;
  description: string;
  valueFormatted: string;
}

export interface ReadinessBreakdown {
  score: number; // 0 - 100
  tier: {
    label: string;
    subtitle: string;
    theme: "emerald" | "teal" | "amber";
    ringColor: string;
    glow: string;
    badgeBg: string;
    guidance: string;
  };
  factors: {
    autonomic: ReadinessFactor & {
      hrvMs: number | null;
      baselineHrvMs: number;
      ratio: number;
      isPeak: boolean;
    };
    sleep: ReadinessFactor & {
      sleepScore: number;
      durationMinutes: number;
    };
    cardiac: ReadinessFactor & {
      restingHr: number | null;
      baselineRestingHr: number;
      diffBpm: number;
    };
    vitality: ReadinessFactor & {
      steps: number;
      strainLevel: "Low" | "Moderate" | "High";
    };
  };
}

/**
 * Industry-Standard Clinical Readiness & Recovery Algorithm:
 * Decomposes physiological readiness across 4 clinical pillars:
 * 1. Autonomic Tone / HRV (0 - 40 pts, ~40% weight): RMSSD vs rolling personal baseline
 * 2. Sleep Restoration (0 - 35 pts, ~35% weight): Sleep Score, Restorative Stages (Deep/REM), Duration
 * 3. Cardiac Rest (0 - 15 pts, ~15% weight): Resting HR vs 7-day rolling baseline
 * 4. Vitality & Acute Strain (0 - 10 pts, ~10% weight): Morning uncompromised capacity & fatigue
 */
export function calculateIndustryStandardReadiness(
  today: DailyMetricSummary,
  history7Days: DailyMetricSummary[] = []
): ReadinessBreakdown {
  // 1. Calculate 7-day HRV Baseline
  const validHrvHistory = history7Days
    .map((h) => h.heartRateVariability)
    .filter((v): v is number => typeof v === "number" && v > 0);

  const todayHrv = today.heartRateVariability;
  
  // Benchmark baseline: rolling 7-day average, or population adult reference (26 ms)
  const baselineHrvMs = validHrvHistory.length
    ? Math.round(validHrvHistory.reduce((sum, v) => sum + v, 0) / validHrvHistory.length)
    : 26;

  // 2. Calculate 7-day Resting HR Baseline
  const validHrHistory = history7Days
    .map((h) => h.restingHeartRate)
    .filter((v): v is number => typeof v === "number" && v > 0);

  const todayRhr = today.restingHeartRate;
  const baselineRestingHr = validHrHistory.length
    ? Math.round(validHrHistory.reduce((sum, v) => sum + v, 0) / validHrHistory.length)
    : todayRhr || 70;

  // --- PILLAR 1: AUTONOMIC TONE / HRV (0 - 40 PTS) ---
  // Grounded in Plews et al. & Buchheit (2014) sports science standards (RMSSD vs rolling baseline ratio)
  let autonomicScore = 32; // Default healthy baseline
  let autonomicStatus = "Balanced";
  let autonomicDesc = "Autonomic tone is aligned with physiological baseline.";
  let hrvRatio = 1.0;
  let isHrvPeak = false;

  if (todayHrv && baselineHrvMs > 0) {
    hrvRatio = Number((todayHrv / baselineHrvMs).toFixed(2));
    if (hrvRatio >= 1.15) {
      // Parasympathetic Peak: >15% above personal rolling baseline
      autonomicScore = 40;
      autonomicStatus = "Peak Recovery";
      isHrvPeak = true;
      autonomicDesc = `HRV is ${todayHrv} ms (+${Math.round((hrvRatio - 1) * 100)}% above rolling baseline), signaling parasympathetic supercompensation.`;
    } else if (hrvRatio >= 1.05) {
      autonomicScore = 36;
      autonomicStatus = "Optimal";
      autonomicDesc = `HRV is ${todayHrv} ms (+${Math.round((hrvRatio - 1) * 100)}% above baseline), reflecting optimal vagal modulation.`;
    } else if (hrvRatio >= 0.95) {
      autonomicScore = 31;
      autonomicStatus = "Balanced";
      autonomicDesc = `HRV of ${todayHrv} ms matches your personal physiological baseline.`;
    } else if (hrvRatio >= 0.85) {
      autonomicScore = 24;
      autonomicStatus = "Mild Suppression";
      autonomicDesc = `HRV is ${todayHrv} ms (${Math.round((1 - hrvRatio) * 100)}% below baseline), showing mild autonomic fatigue.`;
    } else if (hrvRatio >= 0.70) {
      autonomicScore = 18;
      autonomicStatus = "Suppressed";
      autonomicDesc = `HRV is ${todayHrv} ms (${Math.round((1 - hrvRatio) * 100)}% below baseline), reflecting delayed autonomic recovery.`;
    } else {
      autonomicScore = 10;
      autonomicStatus = "Elevated Strain";
      autonomicDesc = `HRV is ${todayHrv} ms, indicating heavy sympathetic stress.`;
    }
  } else if (todayRhr && baselineRestingHr) {
    // Graceful fallback when HRV sensor data is unavailable: infer from RHR delta
    const diff = baselineRestingHr - todayRhr;
    if (diff >= 3) autonomicScore = 38;
    else if (diff >= 0) autonomicScore = 35;
    else autonomicScore = 28;
    autonomicDesc = "HRV not captured; autonomic tone estimated from resting cardiac recovery.";
  }

  // --- PILLAR 2: SLEEP RESTORATION (0 - 35 PTS) ---
  const sleepMins = today.sleepDurationMinutes || 0;
  const sleepHrs = Math.floor(sleepMins / 60);
  const sleepRemMins = sleepMins % 60;
  const sleepScore = today.sleepScore || (sleepMins ? Math.min(100, Math.round((sleepMins / 480) * 85)) : 75);

  let sleepPts = Math.round((sleepScore / 100) * 35);

  // Bonus for high restorative stages (Deep + REM >= 35%) or high sleep score
  const deepMins = today.sleepStages?.find((s) => s.stage === "Deep")?.durationMinutes || 0;
  const remMins = today.sleepStages?.find((s) => s.stage === "REM")?.durationMinutes || 0;
  const restorativeRatio = sleepMins > 0 ? (deepMins + remMins) / sleepMins : 0;

  if (sleepScore >= 85 || restorativeRatio >= 0.35) {
    sleepPts = Math.min(35, Math.max(34, sleepPts)); // Excellent restoration (e.g. 85 score -> 34 pts, 90+ -> 35 pts)
  }
  if (sleepScore >= 90) {
    sleepPts = 35;
  }

  const sleepStatus = sleepScore >= 85 ? "Optimal" : sleepScore >= 75 ? "Good" : sleepScore >= 60 ? "Moderate" : "Insufficient";
  const sleepDesc = sleepMins > 0
    ? `Logged ${sleepHrs}h ${sleepRemMins}m with a Sleep Score of ${sleepScore}/100.`
    : "Sleep session not recorded; using baseline recovery assumptions.";

  // --- PILLAR 3: CARDIAC REST / RHR (0 - 15 PTS) ---
  let cardiacPts = 14;
  let cardiacStatus = "Stable";
  let cardiacDesc = `Resting HR logged at ${todayRhr || baselineRestingHr} bpm.`;
  const hrDiff = todayRhr ? baselineRestingHr - todayRhr : 0;

  if (todayRhr && baselineRestingHr) {
    if (hrDiff >= 2) {
      cardiacPts = 15;
      cardiacStatus = "Superior Rest";
      cardiacDesc = `Resting HR is ${todayRhr} bpm (${hrDiff} bpm lower than 7-day average), reflecting deep cardiovascular rest.`;
    } else if (hrDiff >= -1) {
      cardiacPts = 15;
      cardiacStatus = "Optimal Homeostasis";
      cardiacDesc = `Resting HR of ${todayRhr} bpm aligns comfortably with your baseline (${baselineRestingHr} bpm).`;
    } else if (hrDiff >= -3) {
      cardiacPts = 12;
      cardiacStatus = "Mild Strain";
      cardiacDesc = `Resting HR is ${todayRhr} bpm (+${Math.abs(hrDiff)} bpm vs baseline), indicating mild physiological workload.`;
    } else {
      cardiacPts = 8;
      cardiacStatus = "Elevated";
      cardiacDesc = `Resting HR is elevated at ${todayRhr} bpm (+${Math.abs(hrDiff)} bpm vs baseline).`;
    }
  }

  // --- PILLAR 4: VITALITY & STRAIN BALANCE (0 - 10 PTS) ---
  // Upon waking / early in day (e.g. < 2,000 steps), strain fatigue is low, so physical capacity is uncompromised (10/10)
  const steps = today.steps || 0;
  let vitalityPts = 10;
  let strainLevel: "Low" | "Moderate" | "High" = "Low";
  let vitalityDesc = `Fresh physical capacity with low morning strain (${steps.toLocaleString()} steps).`;

  if (steps > 15000) {
    vitalityPts = 7;
    strainLevel = "High";
    vitalityDesc = `High physical strain accumulated today (${steps.toLocaleString()} steps).`;
  } else if (steps > 8000) {
    vitalityPts = 9;
    strainLevel = "Moderate";
    vitalityDesc = `Moderate active movement logged today (${steps.toLocaleString()} steps).`;
  }

  // Total Clinical Score (0 - 100)
  const rawScore = autonomicScore + sleepPts + cardiacPts + vitalityPts;
  const score = Math.min(100, Math.max(0, rawScore));

  // Determine Tier & Clinical Guidance
  let tier: ReadinessBreakdown["tier"];
  if (score >= 85) {
    tier = {
      label: "Primed for Performance",
      subtitle: "High Readiness",
      theme: "emerald",
      badgeBg: "bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
      glow: "from-emerald-500/20 via-teal-500/10 to-transparent",
      ringColor: "#10B981",
      guidance: isHrvPeak
        ? `Your autonomic recovery hit a peak today (HRV at ${todayHrv} ms). With optimal sleep restoration (${sleepScore}/100), your body has the green light to push harder, tackle challenging workouts, or maintain sustained focus.`
        : "Your cardiovascular recovery, restorative sleep, and autonomic tone are primed today. Excellent day for a high-intensity session or personal record attempt.",
    };
  } else if (score >= 65) {
    tier = {
      label: "Steady Recovery",
      subtitle: "Moderate Readiness",
      theme: "teal",
      badgeBg: "bg-teal-500/10 dark:bg-teal-500/20 text-teal-600 dark:text-teal-400 border-teal-500/30",
      glow: "from-teal-500/20 via-cyan-500/10 to-transparent",
      ringColor: "#06B6D4",
      guidance: "Your recovery is solid and stable around baseline. A great day for moderate cardio, routine strength training, or sustained work capacity.",
    };
  } else {
    tier = {
      label: "Rest & Active Recovery",
      subtitle: "Recharge Needed",
      theme: "amber",
      badgeBg: "bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30",
      glow: "from-amber-500/20 via-orange-500/10 to-transparent",
      ringColor: "#F59E0B",
      guidance: "Physiological strain or sleep debt is elevated today. Prioritize hydration, restorative mobility, light walks, and an earlier bedtime tonight.",
    };
  }

  return {
    score,
    tier,
    factors: {
      autonomic: {
        score: autonomicScore,
        max: 40,
        status: autonomicStatus,
        description: autonomicDesc,
        valueFormatted: todayHrv ? `${todayHrv} ms` : "Estimated",
        hrvMs: todayHrv,
        baselineHrvMs,
        ratio: hrvRatio,
        isPeak: isHrvPeak,
      },
      sleep: {
        score: sleepPts,
        max: 35,
        status: sleepStatus,
        description: sleepDesc,
        valueFormatted: `${sleepScore}/100`,
        sleepScore,
        durationMinutes: sleepMins,
      },
      cardiac: {
        score: cardiacPts,
        max: 15,
        status: cardiacStatus,
        description: cardiacDesc,
        valueFormatted: todayRhr ? `${todayRhr} bpm` : "Baseline",
        restingHr: todayRhr,
        baselineRestingHr,
        diffBpm: hrDiff,
      },
      vitality: {
        score: vitalityPts,
        max: 10,
        status: strainLevel === "Low" ? "Fresh" : strainLevel === "Moderate" ? "Active" : "Strained",
        description: vitalityDesc,
        valueFormatted: `${steps.toLocaleString()} steps`,
        steps,
        strainLevel,
      },
    },
  };
}
