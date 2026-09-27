import type { IntradayHeartRatePoint, WorkoutSession } from "../types";
import { civilInZone, civilToIso, round } from "../utils";
import type { DataPoint } from "./client";

/** Map Google Health API / HealthKit exercise types to clean, user-friendly labels */
const ACTIVITY_LABELS: Record<string, string> = {
  RUNNING: "Outdoor Run",
  WALKING: "Walking",
  BIKING: "Outdoor Cycling",
  CYCLING: "Outdoor Cycling",
  OUTDOOR_BIKE: "Outdoor Cycling",
  INDOOR_BIKE: "Indoor Cycling",
  STRENGTH_TRAINING: "Strength Training",
  WEIGHT_TRAINING: "Weight Training",
  FUNCTIONAL_STRENGTH_TRAINING: "Strength Training",
  HIGH_INTENSITY_INTERVAL_TRAINING: "HIIT Workout",
  HIIT: "HIIT Workout",
  SWIMMING: "Swimming",
  POOL_SWIM: "Pool Swimming",
  OPEN_WATER_SWIM: "Open Water Swimming",
  YOGA: "Yoga Session",
  PILATES: "Pilates",
  ELLIPTICAL: "Elliptical",
  ROWING: "Rowing Machine",
  AEROBICS: "Aerobics",
  HIKING: "Hiking",
  TREADMILL: "Treadmill Run",
  STAIR_CLIMBING: "Stair Climbing",
  CORE_TRAINING: "Core Training",
  CROSS_TRAINING: "Cross Training",
  MARTIAL_ARTS: "Martial Arts",
  DANCE: "Dance Workout",
  WORKOUT: "Workout Session",
  FITNESS: "Workout Session",
  OTHER: "Workout Session",
};

export function formatActivityType(raw?: string): string {
  if (!raw) return "Workout Session";
  const upper = raw.toUpperCase().replace(/[\s-]+/g, "_");
  if (ACTIVITY_LABELS[upper]) return ACTIVITY_LABELS[upper];
  return raw
    .replace(/[_\s-]+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatClock(iso: string | undefined, timeZone?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone });
  } catch {
    return "—";
  }
}

function parseDurationMinutes(raw: string | number | undefined, startIso?: string, endIso?: string): number {
  if (typeof raw === "number") {
    return raw > 100_000 ? Math.round(raw / 60_000) : Math.round(raw / 60);
  }
  if (typeof raw === "string") {
    const sec = parseFloat(raw.replace(/[^\d.]/g, ""));
    if (!isNaN(sec) && sec > 0) return Math.round(sec / 60);
  }
  if (startIso && endIso) {
    const startMs = Date.parse(startIso);
    const endMs = Date.parse(endIso);
    if (!isNaN(startMs) && !isNaN(endMs) && endMs > startMs) {
      return Math.round((endMs - startMs) / 60_000);
    }
  }
  return 0;
}

function parseZoneSeconds(val?: string | number): number {
  if (!val) return 0;
  if (typeof val === "number") return Math.round(val / 60);
  const sec = parseFloat(val.replace(/[^\d.]/g, ""));
  return isNaN(sec) ? 0 : Math.round(sec / 60);
}

function formatPace(distanceKm: number, durationMinutes: number, paceSecPerMeter?: number): string | null {
  let secPerKm: number | null = null;
  if (typeof paceSecPerMeter === "number" && paceSecPerMeter > 0) {
    secPerKm = paceSecPerMeter * 1000;
  } else if (distanceKm > 0 && durationMinutes > 0) {
    secPerKm = (durationMinutes * 60) / distanceKm;
  }
  if (!secPerKm || secPerKm < 120 || secPerKm > 1800) return null; // 2 min/km to 30 min/km range
  const paceMin = Math.floor(secPerKm / 60);
  const paceSec = Math.round(secPerKm % 60);
  return `${paceMin}'${String(paceSec).padStart(2, "0")}" /km`;
}

/** Check if a workout's start or end timestamp belongs to the target local calendar date */
function isWorkoutOnDate(startIso: string | undefined, endIso: string | undefined, targetDate: string, timeZone?: string): boolean {
  if (startIso) {
    const d = new Date(startIso);
    if (!isNaN(d.getTime()) && civilToIso(civilInZone(d, timeZone)) === targetDate) return true;
  }
  if (endIso) {
    const d = new Date(endIso);
    if (!isNaN(d.getTime()) && civilToIso(civilInZone(d, timeZone)) === targetDate) return true;
  }
  return false;
}

/**
 * Parses raw Google Health API exercise data points and extracts rich workout sessions.
 * Accurately filters for workouts performed today, computing duration, peak heart rate,
 * active calories, zones, distance and pace.
 */
export function parseWorkouts(
  points: DataPoint[],
  todayDate: string,
  timeZone?: string,
  intradayHeartRate: IntradayHeartRatePoint[] = []
): WorkoutSession[] {
  const sessions: WorkoutSession[] = [];

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    const exercise = pt.exercise;
    const interval = exercise?.interval ?? pt.interval;
    const startIso = interval?.startTime;
    const endIso = interval?.endTime;

    if (!startIso || !endIso) continue;

    // Check if this workout session occurred on today's calendar date
    if (!isWorkoutOnDate(startIso, endIso, todayDate, timeZone)) continue;

    const summary = exercise?.metricsSummary ?? pt.metricsSummary;
    const rawType = exercise?.exerciseType ?? exercise?.activityType ?? pt.exerciseType ?? pt.activityType ?? "WORKOUT";
    const activityType = formatActivityType(rawType);

    const durationMinutes = parseDurationMinutes(summary?.activeDuration, startIso, endIso);
    const caloriesBurned = summary?.caloriesKcal ? Math.round(summary.caloriesKcal) : null;
    const averageHeartRate = summary?.averageHeartRateBeatsPerMinute ? Math.round(summary.averageHeartRateBeatsPerMinute) : null;

    // Peak Heart Rate extraction: strictly use genuine peak/max HR provided directly by the wearable session summary
    const peakHeartRate: number | null = summary?.peakHeartRateBeatsPerMinute ?? summary?.maxHeartRateBeatsPerMinute ?? null;

    const distanceMm = summary?.distanceMillimeters;
    const distanceKm = distanceMm && distanceMm > 0 ? round(distanceMm / 1_000_000, 2) : null;
    const paceFormatted = formatPace(distanceKm ?? 0, durationMinutes, summary?.averagePaceSecondsPerMeter);
    const speedKmh = summary?.averageSpeedMillimetersPerSecond
      ? round(summary.averageSpeedMillimetersPerSecond * 0.0036, 1)
      : distanceKm && durationMinutes > 0
        ? round((distanceKm / durationMinutes) * 60, 1)
        : null;
    const steps = summary?.steps && summary.steps > 0 ? summary.steps : null;
    const cadenceSpm = steps && durationMinutes > 0 ? Math.round(steps / durationMinutes) : null;
    const activeZoneMinutes = summary?.activeZoneMinutes ? Math.round(summary.activeZoneMinutes) : null;
    const elevationGainMeters = summary?.elevationGainMillimeters ? Math.round(summary.elevationGainMillimeters / 1000) : null;

    // Device identification
    const deviceName = pt.dataSource?.device?.displayName ?? pt.dataSource?.device?.model;
    const sourceDevice = deviceName
      ? deviceName.includes("Apple") || deviceName.includes("Watch")
        ? "Apple Watch via HealthKit"
        : deviceName
      : pt.dataSource?.platform
        ? `${pt.dataSource.platform} Health`
        : null;

    // Heart rate zones
    const zoneDurations = summary?.heartRateZoneDurations;
    const heartRateZones = zoneDurations
      ? {
          fatBurnMinutes: parseZoneSeconds(zoneDurations.moderateTime),
          cardioMinutes: parseZoneSeconds(zoneDurations.vigorousTime),
          peakMinutes: parseZoneSeconds(zoneDurations.peakTime),
        }
      : undefined;

    sessions.push({
      id: `workout-${startIso}-${i}`,
      activityType,
      rawType,
      startTime: formatClock(startIso, timeZone),
      endTime: formatClock(endIso, timeZone),
      startIso,
      endIso,
      durationMinutes,
      activeMinutes: durationMinutes,
      caloriesBurned,
      averageHeartRate,
      peakHeartRate,
      activeZoneMinutes,
      distanceKm,
      speedKmh,
      paceFormatted,
      steps,
      cadenceSpm,
      elevationGainMeters,
      sourceDevice,
      heartRateZones,
    });
  }

  // Sort sessions: newest start time first
  return sessions.sort((a, b) => (Date.parse(b.startIso ?? "") || 0) - (Date.parse(a.startIso ?? "") || 0));
}
