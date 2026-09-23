import type { CivilDate } from "../utils";

/** API version is configurable so a future v5/v6 needs no code change. */
export const API_VERSION = process.env.GOOGLE_HEALTH_API_VERSION || "v4";
export const BASE_URL = process.env.GOOGLE_HEALTH_BASE_URL || `https://health.googleapis.com/${API_VERSION}`;

/* ---------- wire types (only the fields this app reads) ---------- */

export interface CivilTime {
  hours?: number;
  minutes?: number;
  seconds?: number;
}

export interface CivilDateTime {
  date?: CivilDate;
  time?: CivilTime;
}

export interface Interval {
  startTime?: string;
  endTime?: string;
  endUtcOffset?: string;
  civilStartTime?: CivilDateTime;
}

export interface DataSource {
  device?: {
    displayName?: string;
    manufacturer?: string;
    model?: string;
    formFactor?: string;
    hardwareVersion?: string;
    firmwareVersion?: string;
  };
  platform?: string;
  application?: { packageName?: string };
}

export interface SleepStageSummary {
  type?: string;
  minutes?: number;
}

export interface SleepSummary {
  minutesAsleep?: number;
  minutesInSleepPeriod?: number;
  minutesAwake?: number;
  stagesSummary?: SleepStageSummary[];
}

export interface DataPoint {
  dataSource?: DataSource;
  interval?: Interval;
  sampleTime?: string;
  civilStartTime?: CivilDateTime;
  civilEndTime?: CivilDateTime;
  steps?: { count?: number; interval?: Interval };
  distance?: { interval?: Interval };
  exercise?: { interval?: Interval };
  heartRate?: { sampleTime?: string };
  heartRateVariability?: { rootMeanSquareOfSuccessiveDifferencesMilliseconds?: number };
  dailyHeartRateVariability?: {
    averageHeartRateVariabilityMilliseconds?: number;
    deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds?: number;
  };
  oxygenSaturation?: { percentage?: number; sampleTime?: { civilTime?: CivilDateTime } };
  weight?: { weightGrams?: number };
  height?: { heightMillimeters?: number };
  sleep?: { interval?: Interval; summary?: SleepSummary; shortAwakenings?: unknown[] };
  summary?: SleepSummary;
  shortAwakenings?: unknown[];
}

export interface RollupPoint {
  startTime?: string;
  civilStartTime?: CivilDateTime;
  steps?: { countSum?: number };
  totalCalories?: { kcalSum?: number };
  distance?: { millimetersSum?: number };
  activeZoneMinutes?: { sumInFatBurnHeartZone?: number; sumInCardioHeartZone?: number; sumInPeakHeartZone?: number };
  heartRate?: { beatsPerMinuteAvg?: number; beatsPerMinuteMin?: number; beatsPerMinuteMax?: number };
  floors?: { countSum?: number };
}

export interface DataPointsResponse {
  dataPoints?: DataPoint[];
}

export interface RollupResponse {
  rollupDataPoints?: RollupPoint[];
}

export interface RawPairedDevice {
  name?: string;
  displayName?: string;
  deviceVersion?: string;
  model?: string;
  deviceType?: string;
  batteryStatus?: string;
  batteryLevel?: number;
  batteryPercentage?: number;
  battery?: { level?: number; percentage?: number };
  lastSyncTime?: string;
}

export interface PairedDevicesResponse {
  pairedDevices?: RawPairedDevice[];
}

/* ---------- transport ---------- */

export interface ApiResult {
  ok: boolean;
  status: number;
  data: unknown;
}

export async function request(token: string, path: string, method = "GET", body?: unknown): Promise<ApiResult> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({ status: res.status, statusText: res.statusText }));
  return { ok: res.ok, status: res.status, data };
}

/** Best-effort read: null on HTTP or network failure so one endpoint never fails the batch. */
async function read<T>(token: string, path: string, method = "GET", body?: unknown): Promise<T | null> {
  try {
    const res = await request(token, path, method, body);
    if (!res.ok) console.warn(`Google Health ${method} ${path} -> HTTP ${res.status}`);
    return res.ok ? (res.data as T) : null;
  } catch (err) {
    console.warn(`Google Health ${method} ${path} failed:`, err);
    return null;
  }
}

export const listDataPoints = (token: string, dataType: string, pageSize: number) =>
  read<DataPointsResponse>(token, `/users/me/dataTypes/${dataType}/dataPoints?pageSize=${pageSize}`);

export const listPairedDevices = (token: string) => read<PairedDevicesResponse>(token, "/users/me/pairedDevices");

const civilOf = (date: CivilDate, time: CivilTime) => ({ date, time });

/** One rollup point per civil day between `startIso` and `endIso` inclusive. */
export const dailyRollup = (token: string, dataType: string, start: CivilDate, end: CivilDate) =>
  read<RollupResponse>(token, `/users/me/dataTypes/${dataType}/dataPoints:dailyRollUp`, "POST", {
    range: { start: civilOf(start, { hours: 0, minutes: 0, seconds: 0 }), end: civilOf(end, { hours: 23, minutes: 59, seconds: 59 }) },
    windowSizeDays: 1,
  });

/** Hourly rollup points over an absolute time window. */
export const hourlyRollup = (token: string, dataType: string, start: Date, end: Date) =>
  read<RollupResponse>(token, `/users/me/dataTypes/${dataType}/dataPoints:rollUp`, "POST", {
    windowSize: "3600s",
    range: { startTime: start.toISOString(), endTime: end.toISOString() },
  });
