import { GOALS } from "./constants";
import { dayLabel, emptyDay, lastDays, todayIso, zoneForBpm } from "./utils";
import type {
  DailyMetricSummary,
  HealthMetricsPayload,
  IntradayHeartRatePoint,
  IntradayStepPoint,
  PairedDevice,
  SleepStageSegment,
} from "./types";

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

/** Demo devices; sync times are relative to "now" so they never go stale. */
export const getMockDevices = (): PairedDevice[] => [
  {
    id: "fitbit-air-01",
    name: "users/me/pairedDevices/fitbit-air-01",
    displayName: "Fitbit Air",
    model: "Google Fitbit Air",
    deviceType: "FITNESS_TRACKER",
    manufacturer: "Fitbit / Google",
    hardwareVersion: "rev_2.1",
    firmwareVersion: "68.9.14",
    batteryLevel: 86,
    batteryStatus: "HIGH",
    lastSyncTime: minutesAgo(4),
    iconType: "band",
  },
  {
    id: "pixel-watch-03",
    name: "users/me/pairedDevices/pixel-watch-03",
    displayName: "Pixel Watch 3",
    model: "Google Pixel Watch 3 (45mm)",
    deviceType: "SMARTWATCH",
    manufacturer: "Google",
    hardwareVersion: "watch_3_cellular",
    firmwareVersion: "WearOS 5.1",
    batteryLevel: 62,
    batteryStatus: "MEDIUM",
    lastSyncTime: minutesAgo(18),
    iconType: "watch",
  },
  {
    id: "aria-air-01",
    name: "users/me/pairedDevices/aria-air-01",
    displayName: "Fitbit Aria Air",
    model: "Fitbit Aria Air Smart Scale",
    deviceType: "SCALE",
    manufacturer: "Fitbit / Google",
    hardwareVersion: "scale_1.0",
    firmwareVersion: "12.0.4",
    batteryLevel: 94,
    batteryStatus: "FULL",
    lastSyncTime: minutesAgo(14 * 60),
    iconType: "scale",
  },
];

const HOURLY_STEPS = [0, 0, 0, 0, 0, 0, 120, 840, 1450, 680, 520, 410, 1230, 780, 390, 460, 610, 940, 1850, 810, 350, 102, 0, 0];
const HOURLY_BPM = [58, 56, 54, 55, 57, 60, 68, 85, 115, 78, 72, 76, 92, 75, 71, 74, 82, 95, 142, 98, 76, 68, 62, 59];

const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;

export const MOCK_INTRADAY_STEPS: IntradayStepPoint[] = HOURLY_STEPS.map((steps, h) => ({ time: hourLabel(h), steps }));
export const MOCK_INTRADAY_HEART_RATE: IntradayHeartRatePoint[] = HOURLY_BPM.map((bpm, h) => ({
  time: hourLabel(h),
  bpm,
  zone: zoneForBpm(bpm),
}));

/** Typical adult stage distribution (Deep 19%, REM 21%, Awake 8%, remainder Light). */
function mockStages(totalMinutes: number, variance = 0): SleepStageSegment[] {
  const deep = Math.round(totalMinutes * (0.19 + variance));
  const rem = Math.round(totalMinutes * (0.21 - variance));
  const awake = Math.round(totalMinutes * 0.08);
  const light = totalMinutes - deep - rem - awake;
  const seg = (stage: SleepStageSegment["stage"], m: number): SleepStageSegment => ({
    stage,
    durationMinutes: m,
    percentage: Math.round((m / totalMinutes) * 100),
  });
  return [seg("Deep", deep), seg("Light", light), seg("REM", rem), seg("Awake", awake)];
}

type DayOverrides = Partial<Omit<DailyMetricSummary, "date" | "label">>;

/** Oldest first; the last entry is today. */
const HISTORY: DayOverrides[] = [
  { steps: 10420, activeZoneMinutes: 52, caloriesBurned: 2450, distanceKm: 7.8, floors: 16, restingHeartRate: 60, avgHeartRate: 75, maxHeartRate: 154, heartRateVariability: 58, oxygenSaturation: 98, respiratoryRate: 14.4, sleepDurationMinutes: 480, sleepScore: 88, sleepEfficiency: 94, sleepStartTime: "11:10 PM", sleepEndTime: "07:10 AM", weightKg: 74.4 },
  { steps: 7850, activeZoneMinutes: 28, caloriesBurned: 2150, distanceKm: 5.6, floors: 11, restingHeartRate: 62, avgHeartRate: 72, maxHeartRate: 135, heartRateVariability: 50, oxygenSaturation: 97, respiratoryRate: 14.9, sleepDurationMinutes: 410, sleepScore: 78, sleepEfficiency: 89, sleepStartTime: "11:45 PM", sleepEndTime: "06:35 AM", weightKg: 74.3 },
  { steps: 11300, activeZoneMinutes: 64, caloriesBurned: 2580, distanceKm: 8.5, floors: 19, restingHeartRate: 59, avgHeartRate: 78, maxHeartRate: 162, heartRateVariability: 61, oxygenSaturation: 99, respiratoryRate: 14.1, sleepDurationMinutes: 505, sleepScore: 91, sleepEfficiency: 96, sleepStartTime: "10:55 PM", sleepEndTime: "07:20 AM", weightKg: 74.1 },
  { steps: 9240, activeZoneMinutes: 40, caloriesBurned: 2310, distanceKm: 6.9, floors: 13, restingHeartRate: 61, avgHeartRate: 74, maxHeartRate: 144, heartRateVariability: 53, oxygenSaturation: 98, respiratoryRate: 14.6, sleepDurationMinutes: 445, sleepScore: 82, sleepEfficiency: 91, sleepStartTime: "11:30 PM", sleepEndTime: "06:55 AM", weightKg: 74.2 },
  { steps: 12650, activeZoneMinutes: 72, caloriesBurned: 2710, distanceKm: 9.4, floors: 22, restingHeartRate: 60, avgHeartRate: 79, maxHeartRate: 168, heartRateVariability: 56, oxygenSaturation: 98, respiratoryRate: 14.3, sleepDurationMinutes: 460, sleepScore: 84, sleepEfficiency: 92, sleepStartTime: "11:20 PM", sleepEndTime: "07:00 AM", weightKg: 74.0 },
  { steps: 6450, activeZoneMinutes: 20, caloriesBurned: 2020, distanceKm: 4.8, floors: 8, restingHeartRate: 63, avgHeartRate: 70, maxHeartRate: 128, heartRateVariability: 49, oxygenSaturation: 97, respiratoryRate: 15.0, sleepDurationMinutes: 520, sleepScore: 89, sleepEfficiency: 95, sleepStartTime: "11:50 PM", sleepEndTime: "08:30 AM", weightKg: 74.3 },
  { steps: 8742, activeZoneMinutes: 46, caloriesBurned: 2240, distanceKm: 6.4, floors: 14, restingHeartRate: 61, avgHeartRate: 74, maxHeartRate: 148, heartRateVariability: 54, oxygenSaturation: 98, respiratoryRate: 14.8, sleepDurationMinutes: 462, sleepScore: 85, sleepEfficiency: 93, sleepStartTime: "11:14 PM", sleepEndTime: "07:22 AM", weightKg: 74.3, bodyFatPercent: 18.2, fatBurnMinutes: 28, cardioPeakMinutes: 9 },
];

/** Demo metrics stamped with real calendar dates ending at `today`. */
export function getMockMetrics(today: string = todayIso()): HealthMetricsPayload {
  const history7Days = lastDays(today, HISTORY.length).map((date, i) => ({
    ...emptyDay(date, dayLabel(date, today)),
    ...HISTORY[i],
    sleepStages: mockStages(HISTORY[i].sleepDurationMinutes ?? GOALS.sleepMinutes, (i % 3) * 0.01),
  }));
  return {
    today: history7Days[history7Days.length - 1],
    intradaySteps: MOCK_INTRADAY_STEPS,
    intradayHeartRate: MOCK_INTRADAY_HEART_RATE,
    history7Days,
    freshness: { syncedToday: true, fallbackDate: null },
  };
}
