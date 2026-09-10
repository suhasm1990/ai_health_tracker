export type DeviceType = "SMARTWATCH" | "FITNESS_TRACKER" | "SCALE" | "PHONE" | "OTHER";

export type BatteryStatus = "UNKNOWN" | "LOW" | "MEDIUM" | "HIGH" | "CHARGING" | "FULL";

export interface PairedDevice {
  id: string;
  name: string;
  displayName: string;
  model: string;
  deviceType: DeviceType;
  manufacturer: string;
  hardwareVersion?: string;
  firmwareVersion?: string;
  batteryLevel?: number; // 0-100
  batteryStatus: BatteryStatus;
  lastSyncTime: string; // ISO date
  iconType: "watch" | "band" | "scale" | "phone";
}

export interface IntradayStepPoint {
  time: string; // e.g. "09:00"
  steps: number;
}

export interface IntradayHeartRatePoint {
  time: string; // e.g. "09:00"
  bpm: number;
  zone: "Resting" | "Fat Burn" | "Cardio" | "Peak";
}

export interface SleepStageSegment {
  stage: "Deep" | "Light" | "REM" | "Awake";
  durationMinutes: number;
  percentage: number;
  color: string;
}

export interface DailyMetricSummary {
  date: string; // YYYY-MM-DD
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
  heartRateVariability: number | null; // ms (HRV)
  oxygenSaturation: number | null; // % (SpO2)
  respiratoryRate: number | null; // breaths/min
  sleepDurationMinutes: number;
  sleepScore: number;
  sleepEfficiency?: number; // % (Clinical: Time Asleep / Time In Bed)
  sleepStages: SleepStageSegment[];
  weightKg?: number | null;
  bodyFatPercent?: number | null;
  fatBurnMinutes?: number;
  cardioPeakMinutes?: number;
  minOxygenSaturation?: number | null;
  maxOxygenSaturation?: number | null;
  oxygenSaturationSamples?: number;
  heightMeters?: number | null;
  bmi?: number | null;
}

export interface UserProfile {
  id: string;
  displayName: string;
  email: string;
  avatarUrl?: string;
  unitSystem: "METRIC" | "IMPERIAL";
}

export interface AuthStatus {
  isAuthenticated: boolean;
  isDemo: boolean;
  user?: UserProfile;
  scopesGranted: string[];
  hasCredentials: boolean;
  activeDeviceId?: string;
  apiVersion?: string;
}

export interface GoogleHealthApiRawResponse {
  endpoint: string;
  status: number;
  data: unknown;
}
