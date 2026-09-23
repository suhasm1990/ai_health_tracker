import { AuthError, getAuthState, getValidAccessToken, type AuthState } from "../auth";
import { cached } from "../cache";
import { HISTORY_DAYS } from "../constants";
import { getMockMetrics } from "../mockData";
import type { DailyMetricSummary, HealthMetricsPayload, IntradayHeartRatePoint, IntradayStepPoint } from "../types";
import {
  civilInZone,
  civilToIso,
  dayLabel,
  emptyDay,
  hourLabel,
  isPositive,
  isValidIsoDate,
  isoToCivil,
  lastDays,
  round,
  shiftIso,
  todayIso,
  zoneForBpm,
  type CivilDate,
} from "../utils";
import * as api from "./client";
import { parseSleepRecords } from "./sleep";

export interface MetricsQuery {
  forceRefresh?: boolean;
  /** The user's local calendar date (YYYY-MM-DD); the server clock may be on a different day. */
  clientDate?: string;
  /** IANA timezone of the user, used to bucket intraday data and format sleep times. */
  clientTz?: string;
}

const METRICS_TTL_MS = 60_000;
const ROLLUP_TYPES = ["steps", "total-calories", "distance", "active-zone-minutes", "heart-rate", "floors"] as const;
const KM_PER_STEP = 0.00075;

/**
 * Unified health payload: today's summary, intraday series and 7-day history.
 * Cached for 60s per user and date; concurrent callers share one upstream batch.
 */
export async function getAllHealthMetrics(query: MetricsQuery = {}): Promise<HealthMetricsPayload> {
  const state = await getAuthState();
  const today = isValidIsoDate(query.clientDate) ? query.clientDate : todayIso(query.clientTz);
  if (state.isDemo) return getMockMetrics(today);
  return cached(`${state.scope}:metrics:${today}`, METRICS_TTL_MS, () => loadLiveMetrics(state, today, query.clientTz), {
    force: query.forceRefresh,
  });
}

type DateIndex = Map<string, api.RollupPoint>;

const civilIso = (date?: CivilDate) => (date ? civilToIso(date) : null);

/** Index rollup points by their civil date so metrics are joined by day, never by array position. */
function indexByDate(res: api.RollupResponse | null): DateIndex {
  const index: DateIndex = new Map();
  for (const pt of res?.rollupDataPoints ?? []) {
    const key = civilIso(pt.civilStartTime?.date);
    if (key) index.set(key, pt);
  }
  return index;
}

/** Most recent entry by ISO key (ISO dates sort lexicographically). */
function latest<T>(index: Map<string, T>): [string, T] | undefined {
  const key = Array.from(index.keys()).sort().pop();
  return key === undefined ? undefined : [key, index.get(key)!];
}

const numOrNull = (v: unknown): number | null => (isPositive(v) ? v : null);

function activeZones(pt?: api.RollupPoint) {
  const z = pt?.activeZoneMinutes;
  const fatBurn = Number(z?.sumInFatBurnHeartZone ?? 0);
  const cardioPeak = Number(z?.sumInCardioHeartZone ?? 0) + Number(z?.sumInPeakHeartZone ?? 0);
  // Fitbit credits cardio/peak minutes double toward the Active Zone Minutes goal.
  return { fatBurn, cardioPeak, total: fatBurn + cardioPeak * 2 };
}

function indexDailyHrv(points: api.DataPoint[]): Map<string, number> {
  const index = new Map<string, number>();
  for (const pt of points) {
    const key = civilIso(pt.civilStartTime?.date ?? pt.civilEndTime?.date);
    const v = pt.dailyHeartRateVariability;
    const ms = v?.averageHeartRateVariabilityMilliseconds ?? v?.deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds;
    if (key && isPositive(ms)) index.set(key, Math.round(ms));
  }
  return index;
}

function latestRawHrv(points: api.DataPoint[]): number | null {
  const timestamp = (pt: api.DataPoint) => Date.parse(pt.sampleTime ?? pt.interval?.endTime ?? "") || 0;
  const newest = [...points].sort((a, b) => timestamp(b) - timestamp(a))[0];
  return numOrNull(newest?.heartRateVariability?.rootMeanSquareOfSuccessiveDifferencesMilliseconds);
}

function oxygenStats(points: api.DataPoint[], today: string) {
  const todays = points.filter((p) => civilIso(p.oxygenSaturation?.sampleTime?.civilTime?.date) === today);
  const sample = (todays.length ? todays : points.slice(0, 50)).map((p) => Number(p.oxygenSaturation?.percentage)).filter(isPositive);
  if (!sample.length) return { oxygenSaturation: null, minOxygenSaturation: null, maxOxygenSaturation: null, oxygenSaturationSamples: 0 };
  return {
    oxygenSaturation: round(sample.reduce((a, b) => a + b, 0) / sample.length, 1),
    minOxygenSaturation: round(Math.min(...sample), 1),
    maxOxygenSaturation: round(Math.max(...sample), 1),
    oxygenSaturationSamples: sample.length,
  };
}

function bodyStats(weight: api.DataPoint[], height: api.DataPoint[]) {
  const grams = weight[0]?.weight?.weightGrams;
  const mm = height[0]?.height?.heightMillimeters;
  const weightKg = isPositive(grams) ? round(grams / 1000, 1) : null;
  const heightMeters = isPositive(mm) ? round(mm / 1000, 3) : null;
  const bmi = weightKg && heightMeters ? round(weightKg / (heightMeters * heightMeters), 1) : null;
  return { weightKg, heightMeters, bmi };
}

async function loadLiveMetrics(state: AuthState, today: string, timeZone?: string): Promise<HealthMetricsPayload> {
  const token = await getValidAccessToken(state.session);
  if (!token) throw new AuthError();

  // A 15-day civil window (12 back, 2 ahead) covers the 7-day history plus UTC/civil skew at either end.
  const rangeStart = isoToCivil(shiftIso(today, -12));
  const rangeEnd = isoToCivil(shiftIso(today, 2));
  const intradayWindow = { start: new Date(`${shiftIso(today, -1)}T00:00:00Z`), end: new Date(`${shiftIso(today, 1)}T23:59:59Z`) };

  const [rollups, sleep, hrv, dailyHrv, spo2, weight, height, intradaySteps, intradayHeartRate] = await Promise.all([
    Promise.all(ROLLUP_TYPES.map((type) => api.dailyRollup(token, type, rangeStart, rangeEnd).then(indexByDate))),
    api.listDataPoints(token, "sleep", 20),
    api.listDataPoints(token, "heart-rate-variability", 20),
    api.listDataPoints(token, "daily-heart-rate-variability", 10),
    api.listDataPoints(token, "oxygen-saturation", 20),
    api.listDataPoints(token, "weight", 1),
    api.listDataPoints(token, "height", 1),
    fetchIntradaySteps(token, intradayWindow, today, timeZone),
    fetchIntradayHeartRate(token, intradayWindow, today, timeZone),
  ]);
  const [steps, calories, distance, azm, heartRate, floors] = rollups;
  const sleepByDate = parseSleepRecords(sleep?.dataPoints ?? [], timeZone);
  const hrvByDate = indexDailyHrv(dailyHrv?.dataPoints ?? []);

  /**
   * Readings (heart rate, sleep, HRV) may fall back to the most recent recorded day
   * when today has none yet; the dates used are collected so the UI can say so.
   * Daily accumulators (steps, calories, distance, floors, active minutes) never
   * fall back: before a sync, today's true value is zero.
   */
  const fallbackDates: string[] = [];
  const reading = <T,>(index: Map<string, T>, iso: string, allowFallback: boolean): T | undefined => {
    const exact = index.get(iso);
    if (exact !== undefined || !allowFallback) return exact;
    const recent = latest(index);
    if (recent) fallbackDates.push(recent[0]);
    return recent?.[1];
  };

  const buildDay = (iso: string, fallbackToLatest = false): DailyMetricSummary => {
    const hr = reading(heartRate, iso, fallbackToLatest)?.heartRate;
    const zones = activeZones(azm.get(iso));
    const daySteps = Number(steps.get(iso)?.steps?.countSum ?? 0);
    const mm = Number(distance.get(iso)?.distance?.millimetersSum ?? 0);
    const night = reading(sleepByDate, iso, fallbackToLatest);
    return {
      ...emptyDay(iso, dayLabel(iso, today)),
      steps: daySteps,
      caloriesBurned: Math.round(Number(calories.get(iso)?.totalCalories?.kcalSum ?? 0)),
      distanceKm: mm > 0 ? round(mm / 1_000_000, 2) : round(daySteps * KM_PER_STEP, 1),
      floors: Number(floors.get(iso)?.floors?.countSum ?? 0),
      restingHeartRate: numOrNull(hr?.beatsPerMinuteMin),
      avgHeartRate: isPositive(hr?.beatsPerMinuteAvg) ? Math.round(hr.beatsPerMinuteAvg) : null,
      maxHeartRate: numOrNull(hr?.beatsPerMinuteMax),
      heartRateVariability: hrvByDate.get(iso) ?? null,
      activeZoneMinutes: zones.total,
      fatBurnMinutes: zones.fatBurn,
      cardioPeakMinutes: zones.cardioPeak,
      sleepDurationMinutes: night?.minutesAsleep ?? 0,
      sleepScore: night?.score ?? 0,
      sleepEfficiency: night?.efficiency ?? null,
      sleepStages: night?.stages ?? [],
      sleepStartTime: night?.startTime ?? null,
      sleepEndTime: night?.endTime ?? null,
    };
  };

  const todayRow: DailyMetricSummary = {
    ...buildDay(today, true),
    heartRateVariability: reading(hrvByDate, today, true) ?? latestRawHrv(hrv?.dataPoints ?? []),
    ...oxygenStats(spo2?.dataPoints ?? [], today),
    ...bodyStats(weight?.dataPoints ?? [], height?.dataPoints ?? []),
  };
  const history7Days = lastDays(today, HISTORY_DAYS).map((iso) => (iso === today ? todayRow : buildDay(iso)));

  const freshness = {
    syncedToday: rollups.some((index) => index.has(today)),
    fallbackDate: fallbackDates.sort().pop() ?? null,
  };

  return { today: todayRow, intradaySteps, intradayHeartRate, history7Days, freshness };
}

/* ---------- intraday series ---------- */

/** Civil date and hour of a rollup point, preferring the API's civil time over the server clock. */
function rollupCivil(pt: api.RollupPoint, timeZone?: string): { iso: string | null; hour: number } {
  const civil = pt.civilStartTime;
  if (civil?.date && typeof civil.time?.hours === "number") return { iso: civilToIso(civil.date), hour: civil.time.hours };
  const local = civilInZone(new Date(pt.startTime ?? 0), timeZone);
  return { iso: pt.startTime ? civilToIso(local) : null, hour: local.hour };
}

/** 24 hourly buckets, summing values that land in the same hour. */
function bucketHours<T>(points: T[], hourOf: (pt: T) => number, valueOf: (pt: T) => number): number[] {
  const hours = new Array<number>(24).fill(0);
  for (const pt of points) {
    const h = hourOf(pt);
    if (h >= 0 && h < 24) hours[h] += valueOf(pt);
  }
  return hours;
}

async function fetchIntradaySteps(
  token: string,
  window: { start: Date; end: Date },
  today: string,
  timeZone?: string
): Promise<IntradayStepPoint[]> {
  const rollup = await api.hourlyRollup(token, "steps", window.start, window.end);
  const todays = (rollup?.rollupDataPoints ?? []).map((pt) => ({ pt, ...rollupCivil(pt, timeZone) })).filter((p) => p.iso === today);
  let hours = bucketHours(todays, (p) => p.hour, (p) => Number(p.pt.steps?.countSum ?? 0));

  if (!hours.some((v) => v > 0)) {
    // Sources without rollup support (e.g. Health Connect imports): aggregate raw step intervals.
    const points = (await api.listDataPoints(token, "steps", 1000))?.dataPoints ?? [];
    const dateOf = (pt: api.DataPoint) => civilIso(pt.steps?.interval?.civilStartTime?.date);
    hours = bucketHours(
      points.filter((pt) => dateOf(pt) === today),
      (pt) => pt.steps?.interval?.civilStartTime?.time?.hours ?? 0,
      (pt) => Number(pt.steps?.count ?? 0)
    );
  }
  return hours.map((steps, h) => ({ time: hourLabel(h), steps }));
}

async function fetchIntradayHeartRate(
  token: string,
  window: { start: Date; end: Date },
  today: string,
  timeZone?: string
): Promise<IntradayHeartRatePoint[]> {
  const rollup = await api.hourlyRollup(token, "heart-rate", window.start, window.end);
  const todays = (rollup?.rollupDataPoints ?? []).map((pt) => ({ pt, ...rollupCivil(pt, timeZone) })).filter((p) => p.iso === today);
  const hours = bucketHours(todays, (p) => p.hour, (p) => Math.round(Number(p.pt.heartRate?.beatsPerMinuteAvg ?? 0)));
  if (!hours.some((v) => v > 0)) return [];
  return hours.map((bpm, h) => ({ time: hourLabel(h), bpm, zone: zoneForBpm(bpm) }));
}
