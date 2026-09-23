import { getAllHealthMetrics, getPairedDevices } from "../health";
import { calculateReadiness } from "../readiness";
import { formatDuration, meanOf, withUnit } from "../utils";
import type { ToolDefinition, ToolExecutionSummary } from "./types";

export const HEALTH_TOOLS: ToolDefinition[] = [
  {
    name: "get_today_health_summary",
    description:
      "Get today's overall health and activity metrics including steps, distance, calories, active zone minutes, resting heart rate, average heart rate, blood oxygen (SpO2), HRV, weight/BMI and the readiness score.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_sleep_analysis",
    description:
      "Get detailed sleep analysis for the most recent night: total duration, sleep score, efficiency and the Deep / REM / Light / Awake stage breakdown.",
    parameters: {
      type: "object",
      properties: {
        includeStages: { type: "string", description: "Whether to include the full stage breakdown (default true)", enum: ["true", "false"] },
      },
      required: [],
    },
  },
  {
    name: "get_heart_rate_insights",
    description:
      "Get heart rate metrics: resting, average and peak heart rate, heart rate variability (HRV), cardio zone minutes and recent hourly intraday readings.",
    parameters: {
      type: "object",
      properties: {
        includeIntraday: { type: "string", description: "Whether to include hourly intraday readings (default true)", enum: ["true", "false"] },
      },
      required: [],
    },
  },
  {
    name: "get_weekly_trends",
    description:
      "Get the 7-day trend of daily steps, active minutes, calories, sleep duration and resting heart rate to evaluate consistency over the past week.",
    parameters: {
      type: "object",
      properties: {
        metric: { type: "string", description: "Focus metric, or 'all'", enum: ["all", "steps", "sleep", "heart_rate", "calories"] },
      },
      required: [],
    },
  },
  {
    name: "get_connected_devices",
    description:
      "Get paired trackers and smartwatches (e.g. Fitbit Air, Pixel Watch) with battery percentage, battery status and last synchronisation time.",
    parameters: { type: "object", properties: {}, required: [] },
  },
];

export interface ToolResult {
  data: unknown;
  summary: ToolExecutionSummary;
}

type ToolArgs = Record<string, unknown>;
type ToolHandler = (args: ToolArgs) => Promise<ToolResult>;

const sleepRating = (score: number) => (score >= 85 ? "Excellent" : score >= 75 ? "Good" : score >= 60 ? "Fair" : "Poor");

const handlers: Record<string, ToolHandler> = {
  async get_today_health_summary(args) {
    const { today: t, history7Days } = await getAllHealthMetrics();
    const readiness = calculateReadiness(t, history7Days);
    const factor = (f: { score: number; max: number; valueFormatted: string; status: string }) =>
      `${f.score}/${f.max} (${f.valueFormatted} - ${f.status})`;
    return {
      data: {
        date: t.date,
        steps: t.steps,
        stepsGoal: t.stepsGoal,
        stepsGoalAchievedPercent: Math.round((t.steps / t.stepsGoal) * 100),
        activeZoneMinutes: t.activeZoneMinutes,
        activeZoneMinutesGoal: t.activeZoneMinutesGoal,
        caloriesBurned: t.caloriesBurned,
        caloriesGoal: t.caloriesGoal,
        distanceKm: t.distanceKm,
        floorsClimbed: t.floors,
        restingHeartRateBpm: t.restingHeartRate,
        averageHeartRateBpm: t.avgHeartRate,
        maxHeartRateBpm: t.maxHeartRate,
        heartRateVariabilityMs: t.heartRateVariability,
        oxygenSaturationPercent: t.oxygenSaturation,
        respiratoryRateBreathsPerMin: t.respiratoryRate,
        weightKg: t.weightKg,
        bmi: t.bmi,
        sleep: { duration: formatDuration(t.sleepDurationMinutes), durationMinutes: t.sleepDurationMinutes, score: t.sleepScore },
        readiness: {
          score: readiness.score,
          tier: readiness.tier.label,
          subtitle: readiness.tier.subtitle,
          clinicalGuidance: readiness.tier.guidance,
          factors: {
            autonomicHrv: factor(readiness.factors.autonomic),
            sleepRestoration: factor(readiness.factors.sleep),
            cardiacRest: factor(readiness.factors.cardiac),
            vitalityStrain: factor(readiness.factors.vitality),
          },
        },
      },
      summary: {
        name: "get_today_health_summary",
        label: "Queried Today's Health Summary",
        args,
        resultSummary: `${readiness.score}/100 Readiness (${readiness.tier.label}), ${t.steps.toLocaleString()} steps, ${withUnit(t.restingHeartRate, "bpm")} resting HR, ${formatDuration(t.sleepDurationMinutes)} sleep (score ${t.sleepScore})`,
      },
    };
  },

  async get_sleep_analysis(args) {
    const { today: t } = await getAllHealthMetrics();
    const highlight = (stage: string) => {
      const s = t.sleepStages.find((x) => x.stage === stage);
      return s ? `${s.percentage}% (${s.durationMinutes}m)` : "N/A";
    };
    const stageHighlights = { deep: highlight("Deep"), rem: highlight("REM"), light: highlight("Light"), awake: highlight("Awake") };
    const rating = sleepRating(t.sleepScore);
    return {
      data: {
        date: t.date,
        durationFormatted: formatDuration(t.sleepDurationMinutes),
        totalDurationMinutes: t.sleepDurationMinutes,
        sleepScore: t.sleepScore,
        sleepEfficiency: t.sleepEfficiency ? `${t.sleepEfficiency}%` : undefined,
        rating,
        stages: t.sleepStages.map((s) => ({ ...s, durationFormatted: formatDuration(s.durationMinutes) })),
        stageHighlights,
        clinicalReference: {
          recommendedDurationAdult: "7 to 9 hours",
          optimalDeepSleepRange: "15% to 25% (physical restoration and immune repair)",
          optimalRemSleepRange: "20% to 25% (cognitive restoration, emotional regulation, memory consolidation)",
        },
      },
      summary: {
        name: "get_sleep_analysis",
        label: "Analyzed Sleep Quality & Stages",
        args,
        resultSummary: `${formatDuration(t.sleepDurationMinutes)} sleep, ${t.sleepScore} Sleep Score (${rating}), Deep: ${stageHighlights.deep}, REM: ${stageHighlights.rem}`,
      },
    };
  },

  async get_heart_rate_insights(args) {
    const { today: t, intradayHeartRate } = await getAllHealthMetrics();
    return {
      data: {
        restingHeartRateBpm: t.restingHeartRate,
        averageHeartRateBpm: t.avgHeartRate,
        maxHeartRateBpm: t.maxHeartRate,
        heartRateVariabilityMs: t.heartRateVariability,
        zones: { fatBurnMinutes: t.fatBurnMinutes, cardioPeakMinutes: t.cardioPeakMinutes, activeZoneMinutes: t.activeZoneMinutes },
        // Every other hour keeps the context compact for the model.
        recentReadings: intradayHeartRate.filter((_, i) => i % 2 === 0).slice(-10),
      },
      summary: {
        name: "get_heart_rate_insights",
        label: "Queried Heart Rate & Intraday Readings",
        args,
        resultSummary: `Resting: ${withUnit(t.restingHeartRate, "bpm")}, Avg: ${withUnit(t.avgHeartRate, "bpm")}, Max: ${withUnit(t.maxHeartRate, "bpm")}, HRV: ${withUnit(t.heartRateVariability, "ms")}`,
      },
    };
  },

  async get_weekly_trends(args) {
    const { history7Days: history } = await getAllHealthMetrics();
    const avgSteps = meanOf(history, (d) => d.steps) ?? 0;
    const avgSleep = meanOf(history, (d) => d.sleepDurationMinutes) ?? 0;
    const avgRestingHr = meanOf(history, (d) => d.restingHeartRate);
    return {
      data: {
        days: history.map((d) => ({
          date: d.date,
          label: d.label,
          steps: d.steps,
          sleepHours: (d.sleepDurationMinutes / 60).toFixed(1),
          sleepScore: d.sleepScore,
          restingHeartRate: d.restingHeartRate,
          calories: d.caloriesBurned,
          activeZoneMinutes: d.activeZoneMinutes,
        })),
        weeklyAverages: { averageDailySteps: avgSteps, averageDailySleep: formatDuration(avgSleep), averageRestingHeartRate: avgRestingHr },
      },
      summary: {
        name: "get_weekly_trends",
        label: "Evaluated 7-Day Health Trends",
        args,
        resultSummary: `7-day averages: ${avgSteps.toLocaleString()} steps/day, ${(avgSleep / 60).toFixed(1)}h sleep/day, ${withUnit(avgRestingHr, "bpm")} resting HR`,
      },
    };
  },

  async get_connected_devices(args) {
    const devices = await getPairedDevices();
    const first = devices[0];
    return {
      data: {
        devices: devices.map((d) => ({
          id: d.id,
          displayName: d.displayName,
          model: d.model,
          manufacturer: d.manufacturer,
          batteryLevel: d.batteryLevel !== undefined ? `${d.batteryLevel}%` : "N/A",
          batteryStatus: d.batteryStatus,
          lastSyncTime: d.lastSyncTime,
        })),
      },
      summary: {
        name: "get_connected_devices",
        label: "Checked Connected Wearable Devices",
        args,
        resultSummary: first
          ? `${first.displayName}: ${first.batteryLevel !== undefined ? `${first.batteryLevel}%` : "battery n/a"} (${first.batteryStatus})`
          : "No devices connected",
      },
    };
  },
};

export async function executeHealthTool(name: string, args: ToolArgs = {}): Promise<ToolResult> {
  const handler = handlers[name];
  if (!handler) throw new Error(`Unknown health tool: ${name}`);
  return handler(args);
}
