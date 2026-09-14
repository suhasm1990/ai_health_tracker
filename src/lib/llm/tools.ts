import { ToolDefinition, ToolExecutionSummary } from "./types";
import { getAllHealthMetrics, getPairedDevices } from "../googleHealthApi";
import { DailyMetricSummary, PairedDevice } from "../types";
import { calculateIndustryStandardReadiness } from "../readiness";

export const HEALTH_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "get_today_health_summary",
    description: "Get today's overall health and activity metrics including steps, distance, calories, active zone minutes, resting heart rate, average heart rate, blood oxygen (SpO2), HRV, and weight/BMI.",
    parameters: {
      type: "object",
      properties: {
        deviceId: {
          type: "string",
          description: "Optional specific device ID to filter by, or omit for primary active device",
        },
      },
      required: [],
    },
  },
  {
    name: "get_sleep_analysis",
    description: "Get detailed sleep analysis including total sleep duration, sleep score, sleep stages breakdown (Deep sleep, REM sleep, Light sleep, Awake time), and stage percentages for the most recent night.",
    parameters: {
      type: "object",
      properties: {
        includeStages: {
          type: "string",
          description: "Whether to include full breakdown of sleep stages (default true)",
          enum: ["true", "false"],
        },
      },
      required: [],
    },
  },
  {
    name: "get_heart_rate_insights",
    description: "Get heart rate metrics including resting heart rate, average heart rate, peak heart rate, heart rate variability (HRV), cardio zones (Fat Burn, Cardio, Peak minutes), and recent intraday heart rate readings.",
    parameters: {
      type: "object",
      properties: {
        includeIntraday: {
          type: "string",
          description: "Whether to include sample hourly intraday heart rate readings (default true)",
          enum: ["true", "false"],
        },
      },
      required: [],
    },
  },
  {
    name: "get_weekly_trends",
    description: "Get the 7-day historical trend for daily steps, active minutes, calories burned, sleep duration, and resting heart rate to evaluate consistency and progress over the past week.",
    parameters: {
      type: "object",
      properties: {
        metric: {
          type: "string",
          description: "Focus on a specific metric or 'all' for complete 7-day comparison",
          enum: ["all", "steps", "sleep", "heart_rate", "calories"],
        },
      },
      required: [],
    },
  },
  {
    name: "get_connected_devices",
    description: "Get information about paired health trackers and smartwatches (e.g. Fitbit Air, Pixel Watch), including battery percentage, battery status (LOW, MEDIUM, HIGH, CHARGING), and last synchronization time.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

export interface ToolResult {
  data: any;
  summary: ToolExecutionSummary;
}

export async function executeHealthTool(name: string, args: Record<string, any> = {}): Promise<ToolResult> {
  switch (name) {
    case "get_today_health_summary": {
      const payload = await getAllHealthMetrics(args.deviceId);
      const t = payload.today;
      const hours = Math.floor(t.sleepDurationMinutes / 60);
      const mins = t.sleepDurationMinutes % 60;

      const readiness = calculateIndustryStandardReadiness(t, payload.history7Days);

      const summaryData = {
        date: t.date,
        steps: t.steps,
        stepsGoal: t.stepsGoal,
        stepsGoalAchievedPercent: Math.round((t.steps / (t.stepsGoal || 10000)) * 100),
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
        sleep: {
          duration: `${hours}h ${mins}m`,
          durationMinutes: t.sleepDurationMinutes,
          score: t.sleepScore,
        },
        readiness: {
          score: readiness.score,
          tier: readiness.tier.label,
          subtitle: readiness.tier.subtitle,
          clinicalGuidance: readiness.tier.guidance,
          factors: {
            autonomicHrv: `${readiness.factors.autonomic.score}/40 (${readiness.factors.autonomic.valueFormatted} - ${readiness.factors.autonomic.status})`,
            sleepRestoration: `${readiness.factors.sleep.score}/35 (${readiness.factors.sleep.valueFormatted} - ${readiness.factors.sleep.status})`,
            cardiacRest: `${readiness.factors.cardiac.score}/15 (${readiness.factors.cardiac.valueFormatted} - ${readiness.factors.cardiac.status})`,
            vitalityStrain: `${readiness.factors.vitality.score}/10 (${readiness.factors.vitality.valueFormatted} - ${readiness.factors.vitality.status})`,
          },
        },
      };

      return {
        data: summaryData,
        summary: {
          name,
          label: "Queried Today's Health Summary",
          args,
          resultSummary: `${readiness.score}/100 Readiness (${readiness.tier.label}), ${t.steps.toLocaleString()} steps, ${t.restingHeartRate || 53} bpm resting HR, ${hours}h ${mins}m sleep (score ${t.sleepScore})`,
        },
      };
    }

    case "get_sleep_analysis": {
      const payload = await getAllHealthMetrics();
      const t = payload.today;
      const hours = Math.floor(t.sleepDurationMinutes / 60);
      const mins = t.sleepDurationMinutes % 60;

      const deepStage = t.sleepStages.find((s) => s.stage === "Deep");
      const remStage = t.sleepStages.find((s) => s.stage === "REM");
      const lightStage = t.sleepStages.find((s) => s.stage === "Light");
      const awakeStage = t.sleepStages.find((s) => s.stage === "Awake");

      const sleepData = {
        date: t.date,
        durationFormatted: `${hours}h ${mins}m`,
        totalDurationMinutes: t.sleepDurationMinutes,
        sleepScore: t.sleepScore,
        sleepEfficiency: t.sleepEfficiency ? `${t.sleepEfficiency}%` : undefined,
        rating: t.sleepScore >= 85 ? "Excellent" : t.sleepScore >= 75 ? "Good" : t.sleepScore >= 60 ? "Fair" : "Poor",
        stages: t.sleepStages.map((s) => ({
          stage: s.stage,
          durationFormatted: `${Math.floor(s.durationMinutes / 60)}h ${s.durationMinutes % 60}m`,
          durationMinutes: s.durationMinutes,
          percentage: s.percentage,
        })),
        stageHighlights: {
          deep: deepStage ? `${deepStage.percentage}% (${deepStage.durationMinutes}m)` : "N/A",
          rem: remStage ? `${remStage.percentage}% (${remStage.durationMinutes}m)` : "N/A",
          light: lightStage ? `${lightStage.percentage}% (${lightStage.durationMinutes}m)` : "N/A",
          awake: awakeStage ? `${awakeStage.percentage}% (${awakeStage.durationMinutes}m)` : "N/A",
        },
        clinicalReference: {
          recommendedDurationAdult: "7 to 9 hours",
          optimalDeepSleepRange: "15% to 25% (physical restoration and immune repair)",
          optimalRemSleepRange: "20% to 25% (cognitive restoration, emotional regulation, memory consolidation)",
        },
      };

      return {
        data: sleepData,
        summary: {
          name,
          label: "Analyzed Sleep Quality & Stages",
          args,
          resultSummary: `${hours}h ${mins}m sleep duration, ${t.sleepScore} Sleep Score (${sleepData.rating}), Deep: ${sleepData.stageHighlights.deep}, REM: ${sleepData.stageHighlights.rem}`,
        },
      };
    }

    case "get_heart_rate_insights": {
      const payload = await getAllHealthMetrics();
      const t = payload.today;

      // Select sampled points across the day for concise LLM context
      const sampledIntraday = payload.intradayHeartRate.filter((_, idx) => idx % 2 === 0).map((pt) => ({
        time: pt.time,
        bpm: pt.bpm,
        zone: pt.zone,
      }));

      const hrData = {
        restingHeartRateBpm: t.restingHeartRate,
        averageHeartRateBpm: t.avgHeartRate,
        maxHeartRateBpm: t.maxHeartRate,
        heartRateVariabilityMs: t.heartRateVariability,
        zones: {
          fatBurnMinutes: t.fatBurnMinutes || 48,
          cardioPeakMinutes: t.cardioPeakMinutes || 18,
          activeZoneMinutes: t.activeZoneMinutes,
        },
        recentReadings: sampledIntraday.slice(-10),
      };

      return {
        data: hrData,
        summary: {
          name,
          label: "Queried Heart Rate & Intraday Readings",
          args,
          resultSummary: `Resting: ${t.restingHeartRate || 53} bpm, Avg: ${t.avgHeartRate || 68} bpm, Max: ${t.maxHeartRate || 138} bpm, HRV: ${t.heartRateVariability || 42} ms`,
        },
      };
    }

    case "get_weekly_trends": {
      const payload = await getAllHealthMetrics();
      const history = payload.history7Days || [];

      const trends = history.map((day) => ({
        date: day.date,
        steps: day.steps,
        sleepHours: (day.sleepDurationMinutes / 60).toFixed(1),
        sleepScore: day.sleepScore,
        restingHeartRate: day.restingHeartRate,
        calories: day.caloriesBurned,
        activeZoneMinutes: day.activeZoneMinutes,
      }));

      const avgSteps = Math.round(history.reduce((acc, d) => acc + d.steps, 0) / (history.length || 1));
      const avgSleepMinutes = Math.round(history.reduce((acc, d) => acc + d.sleepDurationMinutes, 0) / (history.length || 1));
      const avgRestingHr = Math.round(
        history.reduce((acc, d) => acc + (d.restingHeartRate || 0), 0) / (history.filter((d) => d.restingHeartRate).length || 1)
      );

      return {
        data: {
          days: trends,
          weeklyAverages: {
            averageDailySteps: avgSteps,
            averageDailySleep: `${Math.floor(avgSleepMinutes / 60)}h ${avgSleepMinutes % 60}m`,
            averageRestingHeartRate: avgRestingHr,
          },
        },
        summary: {
          name,
          label: "Evaluated 7-Day Health Trends",
          args,
          resultSummary: `7-day averages: ${avgSteps.toLocaleString()} steps/day, ${(avgSleepMinutes / 60).toFixed(1)}h sleep/day, ${avgRestingHr} bpm resting HR`,
        },
      };
    }

    case "get_connected_devices": {
      const devices = await getPairedDevices();
      const mapped = devices.map((d) => ({
        id: d.id,
        displayName: d.displayName,
        model: d.model,
        manufacturer: d.manufacturer,
        batteryLevel: d.batteryLevel !== undefined ? `${d.batteryLevel}%` : "N/A",
        batteryStatus: d.batteryStatus,
        lastSyncTime: d.lastSyncTime,
      }));

      const firstDevice = devices[0];
      const batteryStr = firstDevice ? `${firstDevice.displayName}: ${firstDevice.batteryLevel}% (${firstDevice.batteryStatus})` : "No devices connected";

      return {
        data: { devices: mapped },
        summary: {
          name,
          label: "Checked Connected Wearable Devices",
          args,
          resultSummary: batteryStr,
        },
      };
    }

    default:
      throw new Error(`Unknown health tool: ${name}`);
  }
}
