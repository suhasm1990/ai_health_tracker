export type DeviceType = "SMARTWATCH" | "FITNESS_TRACKER" | "SCALE" | "PHONE" | "OTHER";
export type BatteryStatus = "UNKNOWN" | "LOW" | "MEDIUM" | "HIGH" | "CHARGING" | "FULL";
export type DeviceIcon = "watch" | "band" | "scale" | "phone";

export interface PairedDevice {
  id: string;
  name: string;
  displayName: string;
  model: string;
  deviceType: DeviceType;
  manufacturer: string;
  hardwareVersion?: string;
  firmwareVersion?: string;
  /** 0-100 */
  batteryLevel?: number;
  batteryStatus: BatteryStatus;
  /** ISO timestamp */
  lastSyncTime: string;
  iconType: DeviceIcon;
}

export interface IntradayStepPoint {
  /** "HH:00" */
  time: string;
  steps: number;
}

export type HeartRateZone = "Resting" | "Fat Burn" | "Cardio" | "Peak";

export interface IntradayHeartRatePoint {
  time: string;
  bpm: number;
  zone: HeartRateZone;
}

export type SleepStage = "Deep" | "Light" | "REM" | "Awake";

export interface SleepStageSegment {
  stage: SleepStage;
  durationMinutes: number;
  percentage: number;
}

export interface DailyMetricSummary {
  /** ISO date, YYYY-MM-DD */
  date: string;
  /** Short display label, e.g. "Mon" or "Today" */
  label: string;
  steps: number;
  stepsGoal: number;
  activeZoneMinutes: number;
  activeZoneMinutesGoal: number;
  caloriesBurned: number;
  caloriesGoal: number;
  distanceKm: number;
  floors: number;
  restingHeartRate: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  /** RMSSD in ms */
  heartRateVariability: number | null;
  /** SpO2 % */
  oxygenSaturation: number | null;
  minOxygenSaturation?: number | null;
  maxOxygenSaturation?: number | null;
  oxygenSaturationSamples?: number;
  respiratoryRate: number | null;
  sleepDurationMinutes: number;
  sleepScore: number;
  /** Time asleep / time in bed, % */
  sleepEfficiency: number | null;
  sleepStages: SleepStageSegment[];
  sleepStartTime: string | null;
  sleepEndTime: string | null;
  weightKg: number | null;
  heightMeters?: number | null;
  bmi?: number | null;
  bodyFatPercent?: number | null;
  fatBurnMinutes: number;
  cardioPeakMinutes: number;
}

export interface DataFreshness {
  /** True when at least one activity rollup exists for today (the device has synced today). */
  syncedToday: boolean;
  /** ISO date of the most recent day that supplied a reading shown as "today"; null when nothing fell back. */
  fallbackDate: string | null;
}

export interface HealthMetricsPayload {
  today: DailyMetricSummary;
  intradaySteps: IntradayStepPoint[];
  intradayHeartRate: IntradayHeartRatePoint[];
  history7Days: DailyMetricSummary[];
  freshness: DataFreshness;
}

export interface UserProfile {
  id: string;
  displayName: string;
  email: string;
  avatarUrl?: string;
}

export interface LlmStatus {
  provider: string;
  model: string;
  hasApiKey: boolean;
}

export interface AuthStatus {
  isAuthenticated: boolean;
  isDemo: boolean;
  hasCredentials: boolean;
  user?: UserProfile;
  scopesGranted: string[];
  apiVersion: string;
  llm?: LlmStatus;
}
