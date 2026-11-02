import type { AuthState } from "../auth";
import { getAllHealthMetrics, getPairedDevices } from "../health";
import { baselineLabel, hasData } from "../baseline";
import { getDb } from "../db";
import { loadTrendData, type TrendDay } from "../history";
import { calculateReadiness } from "../readiness";
import type { HealthMetricsPayload } from "../types";
import { civilInZone, formatDuration, formatShortDate, meanOf, shiftIso, todayIso, withUnit } from "../utils";
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
    name: "get_long_term_trends",
    description:
      "Get the last 4 weeks, week by week: average steps, sleep, resting heart rate, HRV and readiness score, plus workout count and minutes, with the change from the first to the last week. Use for overall health, how someone has been doing lately, or monthly trends.",
    parameters: { type: "object", properties: {}, required: [] },
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

/** Per-request context so every tool shares one auth read and the user's own calendar date. */
export interface ToolContext {
  state: AuthState;
  clientDate?: string;
  clientTz?: string;
}

type ToolHandler = (args: ToolArgs, ctx: ToolContext) => Promise<ToolResult>;

const metricsFor = (ctx: ToolContext) => getAllHealthMetrics({ clientDate: ctx.clientDate, clientTz: ctx.clientTz }, ctx.state);

/**
 * When the data is from and how complete it is, so the model never treats an unsynced or
 * half-finished day as a full one, or an earlier night's reading as today's.
 */
function dataContext(payload: HealthMetricsPayload, ctx: ToolContext) {
  const { hour } = civilInZone(new Date(), ctx.clientTz);
  return {
    localHour: hour,
    dayInProgress: "Steps, calories, distance and active minutes are running totals for today so far, not a full day.",
    syncedToday: payload.freshness.syncedToday,
    readingsFromEarlierDay: payload.freshness.fallbackDate
      ? `No sleep/heart/HRV reading for today yet; those values are from ${payload.freshness.fallbackDate}.`
      : null,
  };
}

const TREND_WEEKS = 4;

/** Averages for one week of stored days; changes are computed here so the model never does the arithmetic. */
function weekSummary(days: TrendDay[], workouts: { date: string; minutes: number }[], startIso: string, endIso: string) {
  const inWeek = days.filter(({ day }) => day.date >= startIso && day.date < endIso && hasData(day)).map(({ day, readinessScore }) => ({ ...day, readinessScore }));
  const sessions = workouts.filter((w) => w.date >= startIso && w.date < endIso);
  const sleep = meanOf(inWeek, (d) => d.sleepDurationMinutes);
  return {
    week: `${formatShortDate(startIso)} – ${formatShortDate(shiftIso(endIso, -1))}`,
    daysWithData: inWeek.length,
    avgDailySteps: meanOf(inWeek, (d) => d.steps),
    avgSleepMinutes: sleep,
    avgSleep: sleep === null ? null : formatDuration(sleep),
    avgRestingHeartRateBpm: meanOf(inWeek, (d) => d.restingHeartRate),
    avgHeartRateVariabilityMs: meanOf(inWeek, (d) => d.heartRateVariability),
    avgReadinessScore: meanOf(inWeek, (d) => d.readinessScore),
    workouts: sessions.length,
    workoutMinutes: sessions.reduce((sum, w) => sum + w.minutes, 0),
  };
}

const sleepRating = (score: number) => (score >= 85 ? "Excellent" : score >= 75 ? "Good" : score >= 60 ? "Fair" : "Poor");

const handlers: Record<string, ToolHandler> = {
  async get_today_health_summary(args, ctx) {
    const payload = await metricsFor(ctx);
    const { today: t, history7Days, baseline, todayWorkouts = [] } = payload;
    const readiness = calculateReadiness(t, history7Days, baseline);
    const factor = (f: { score: number; max: number; valueFormatted: string; status: string }) =>
      `${f.score}/${f.max} (${f.valueFormatted} - ${f.status})`;
    return {
      data: {
        date: t.date,
        dataContext: dataContext(payload, ctx),
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
        baseline: {
          window: baselineLabel(baseline),
          daysOfHistory: baseline.days,
          restingHeartRateBpm: baseline.restingHeartRate,
          heartRateVariabilityMs: baseline.heartRateVariability,
          sleepMinutes: baseline.sleepMinutes,
          steps: baseline.steps,
        },
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
        workouts: todayWorkouts.map((w) => ({
          activity: w.activityType,
          duration: formatDuration(w.durationMinutes),
          peakHeartRateBpm: w.peakHeartRate,
          averageHeartRateBpm: w.averageHeartRate,
          caloriesBurned: w.caloriesBurned,
          activeZoneMinutes: w.activeZoneMinutes,
          distanceKm: w.distanceKm,
          pace: w.paceFormatted,
          time: `${w.startTime} – ${w.endTime}`,
          device: w.sourceDevice,
        })),
      },
      summary: {
        name: "get_today_health_summary",
        label: "Queried Today's Health Summary",
        args,
        resultSummary: `${readiness.score}/100 Readiness (${readiness.tier.label}), ${t.steps.toLocaleString()} steps, ${withUnit(t.restingHeartRate, "bpm")} resting HR, ${formatDuration(t.sleepDurationMinutes)} sleep${todayWorkouts.length ? `, workout: ${todayWorkouts[0].activityType} (${formatDuration(todayWorkouts[0].durationMinutes)}, peak ${todayWorkouts[0].peakHeartRate} bpm)` : ""}`,
      },
    };
  },

  async get_sleep_analysis(args, ctx) {
    const payload = await metricsFor(ctx);
    const { today: t } = payload;
    const highlight = (stage: string) => {
      const s = t.sleepStages.find((x) => x.stage === stage);
      return s ? `${s.percentage}% (${s.durationMinutes}m)` : "N/A";
    };
    const stageHighlights = { deep: highlight("Deep"), rem: highlight("REM"), light: highlight("Light"), awake: highlight("Awake") };
    const rating = sleepRating(t.sleepScore);
    return {
      data: {
        date: t.date,
        nightFrom: payload.freshness.fallbackDate ?? t.date,
        bedtime: t.sleepStartTime,
        wakeTime: t.sleepEndTime,
        durationFormatted: formatDuration(t.sleepDurationMinutes),
        totalDurationMinutes: t.sleepDurationMinutes,
        sleepScore: t.sleepScore,
        sleepScoreNote: "Computed by this app from duration, Deep/REM share and efficiency; not the device's own sleep score.",
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

  async get_heart_rate_insights(args, ctx) {
    const payload = await metricsFor(ctx);
    const { today: t, intradayHeartRate, baseline } = payload;
    return {
      data: {
        dataContext: dataContext(payload, ctx),
        restingHeartRateBpm: t.restingHeartRate,
        baselineRestingHeartRateBpm: baseline.restingHeartRate,
        baselineHeartRateVariabilityMs: baseline.heartRateVariability,
        baselineWindow: baselineLabel(baseline),
        averageHeartRateBpm: t.avgHeartRate,
        maxHeartRateBpm: t.maxHeartRate,
        heartRateVariabilityMs: t.heartRateVariability,
        // Active Zone Minutes count cardio/peak minutes double, so they exceed the zone minutes' sum.
        zones: { fatBurnMinutes: t.fatBurnMinutes, cardioPeakMinutes: t.cardioPeakMinutes, activeZoneMinutesCredited: t.activeZoneMinutes },
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

  async get_weekly_trends(args, ctx) {
    const { history7Days: history, today, baseline } = await metricsFor(ctx);
    // Today is still in progress, so averages cover completed days only.
    const completed = history.filter((d) => d.date < today.date);
    const avgSteps = meanOf(completed, (d) => d.steps) ?? 0;
    const avgSleep = meanOf(completed, (d) => d.sleepDurationMinutes) ?? 0;
    const avgRestingHr = meanOf(completed, (d) => d.restingHeartRate);
    const avgHrv = meanOf(completed, (d) => d.heartRateVariability);
    return {
      data: {
        days: history.map((d) => ({
          date: d.date,
          label: d.label,
          steps: d.steps,
          sleepHours: (d.sleepDurationMinutes / 60).toFixed(1),
          sleepScore: d.sleepScore,
          restingHeartRate: d.restingHeartRate,
          heartRateVariabilityMs: d.heartRateVariability,
          inProgress: d.date === today.date,
          calories: d.caloriesBurned,
          activeZoneMinutes: d.activeZoneMinutes,
        })),
        weeklyAverages: {
          completedDays: completed.length,
          averageDailySteps: avgSteps,
          averageDailySleep: formatDuration(avgSleep),
          averageRestingHeartRate: avgRestingHr,
          averageHeartRateVariabilityMs: avgHrv,
        },
        personalBaseline: {
          window: baselineLabel(baseline),
          restingHeartRateBpm: baseline.restingHeartRate,
          heartRateVariabilityMs: baseline.heartRateVariability,
          sleepMinutes: baseline.sleepMinutes,
          steps: baseline.steps,
        },
      },
      summary: {
        name: "get_weekly_trends",
        label: "Evaluated 7-Day Health Trends",
        args,
        resultSummary: `7-day averages: ${avgSteps.toLocaleString()} steps/day, ${(avgSleep / 60).toFixed(1)}h sleep/day, ${withUnit(avgRestingHr, "bpm")} resting HR`,
      },
    };
  },

  async get_long_term_trends(args, ctx) {
    const db = getDb();
    const userId = ctx.state.session?.user?.id;
    const summary = (resultSummary: string) => ({ name: "get_long_term_trends", label: "Reviewed 4-Week Trends", args, resultSummary });
    if (!db || !userId || ctx.state.isDemo) {
      return {
        data: { available: false, note: "Long-term history is only stored for connected accounts. Use get_weekly_trends for the last 7 days." },
        summary: summary("Long-term history unavailable"),
      };
    }

    // Completed days only: today is still in progress.
    const today = ctx.clientDate ?? todayIso(ctx.clientTz);
    const { days, workouts } = await loadTrendData(db, userId, shiftIso(today, -7 * TREND_WEEKS), today);
    const weeks = Array.from({ length: TREND_WEEKS }, (_, i) => {
      const weeksAgo = TREND_WEEKS - i;
      return weekSummary(days, workouts, shiftIso(today, -7 * weeksAgo), shiftIso(today, -7 * (weeksAgo - 1)));
    });
    const [first, last] = [weeks[0], weeks[weeks.length - 1]];
    const change = (pick: (w: (typeof weeks)[number]) => number | null) => {
      const [a, b] = [pick(first), pick(last)];
      return a === null || b === null ? null : b - a;
    };
    const covered = weeks.reduce((sum, w) => sum + w.daysWithData, 0);
    return {
      data: {
        period: `${weeks[0].week.split(" – ")[0]} – ${last.week.split(" – ")[1]} (${TREND_WEEKS} completed weeks, oldest first)`,
        daysWithData: `${covered} of ${7 * TREND_WEEKS}`,
        weeks,
        changeFirstToLastWeek: {
          avgDailySteps: change((w) => w.avgDailySteps),
          sleepMinutes: change((w) => w.avgSleepMinutes),
          restingHeartRateBpm: change((w) => w.avgRestingHeartRateBpm),
          heartRateVariabilityMs: change((w) => w.avgHeartRateVariabilityMs),
          readinessScore: change((w) => w.avgReadinessScore),
          workoutsPerWeek: last.workouts - first.workouts,
        },
      },
      summary: summary(`${covered}/${7 * TREND_WEEKS} days; readiness ${first.avgReadinessScore ?? "n/a"} → ${last.avgReadinessScore ?? "n/a"}, resting HR ${withUnit(first.avgRestingHeartRateBpm, "bpm")} → ${withUnit(last.avgRestingHeartRateBpm, "bpm")}`),
    };
  },

  async get_connected_devices(args, ctx) {
    const devices = await getPairedDevices(false, ctx.state);
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

export async function executeHealthTool(name: string, args: ToolArgs, ctx: ToolContext): Promise<ToolResult> {
  const handler = handlers[name];
  if (!handler) throw new Error(`Unknown health tool: ${name}`);
  return handler(args, ctx);
}
