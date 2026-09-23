import type { HeartRateZone, SleepStage } from "./types";

/** Daily targets used for goal rings, progress bars and readiness scoring. */
export const GOALS = {
  steps: 10_000,
  activeZoneMinutes: 30,
  calories: 2_400,
  sleepMinutes: 480,
} as const;

/** Minimum daily values that keep a habit streak alive. */
export const STREAK_THRESHOLDS = {
  steps: 8_000,
  sleepScore: 75,
  sleepMinutes: 420,
  activeZoneMinutes: 20,
} as const;

/** Heart-rate zone lower bounds in bpm, highest first. */
export const HR_ZONE_THRESHOLDS: ReadonlyArray<[HeartRateZone, number]> = [
  ["Peak", 135],
  ["Cardio", 115],
  ["Fat Burn", 85],
];

export const SLEEP_STAGE_COLORS: Record<SleepStage, string> = {
  Deep: "#3B82F6",
  Light: "#60A5FA",
  REM: "#8B5CF6",
  Awake: "#F59E0B",
};

export const HISTORY_DAYS = 7;

export const THEME_STORAGE_KEY = "health-app-theme";
export const PWA_DISMISS_KEY = "pwa_banner_dismissed";
