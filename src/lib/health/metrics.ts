import { AuthError, getAuthState, getValidAccessToken, type AuthState } from "../auth";
import { recentBaseline } from "../baseline";
import { cached } from "../cache";
import { finishLiveLoad, readStoredHistory } from "../history";
import { HISTORY_DAYS } from "../constants";
import { getMockMetrics } from "../mockData";
import type { DailyMetricSummary, HealthMetricsPayload, IntradayHeartRatePoint, IntradayStepPoint, WorkoutSession } from "../types";
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
import { parseSleepRecords, type SleepRecord } from "./sleep";
import { parseWorkouts } from "./workouts";

export interface MetricsQuery {
  forceRefresh?: boolean;
  /** The user's local calendar date (YYYY-MM-DD); the server clock may be on a different day. */
  clientDate?: string;
  /** IANA timezone of the user, used to bucket intraday data and format sleep times. */
  clientTz?: string;
}

const METRICS_TTL_MS = 60_000;
const BODY_TTL_MS = 60 * 60 * 1000;
const ROLLUP_TYPES = ["steps", "total-calories", "distance", "active-zone-minutes", "heart-rate", "floors"] as const;
const KM_PER_STEP = 0.00075;
const ROLLUP_CHUNK_DAYS = 30;
/** Days requested from Google when older days come from storage. */
const LIVE_LOOKBACK_DAYS = 4;

/**
 * Unified health payload: today's summary, intraday series, 7-day history and personal baseline.
 * Cached for 60s per user and date; concurrent callers share one upstream batch.
 * With a database configured, completed days are stored and the baseline spans 30 days.
 */
export async function getAllHealthMetrics(query: MetricsQuery = {}, auth?: AuthState): Promise<HealthMetricsPayload> {
  const state = auth ?? (await getAuthState());
  const today = isValidIsoDate(query.clientDate) ? query.clientDate : todayIso(query.clientTz);
  if (state.isDemo) return getMockMetrics(today);
  return cached(`${state.scope}:metrics:${today}`, METRICS_TTL_MS, () => loadMetrics(state, today, query), {
    force: query.forceRefresh,
  });
}

/**
 * Serves a shared snapshot fetched in the last few minutes when one exists. Otherwise
 * fetches from Google, taking settled days (before yesterday) from storage when all
 * are present so only the recent window is requested.
 */
async function loadMetrics(state: AuthState, today: string, query: MetricsQuery): Promise<HealthMetricsPayload> {
  const stored = await readStoredHistory(state, today);
  if (stored?.snapshot && !query.forceRefresh) return stored.snapshot;

  const settledBefore = shiftIso(today, -1);
  const settled = new Map((stored?.days ?? []).filter((d) => d.date < settledBefore).map((d) => [d.date, d]));
  const useStored = lastDays(today, HISTORY_DAYS).every((iso) => iso >= settledBefore || settled.has(iso));
  const payload = await loadLiveMetrics(state, today, query.clientTz, useStored ? settled : new Map());
  const fetchedDays = payload.history7Days.filter((d) => !(useStored && settled.has(d.date)));
  return finishLiveLoad(state, stored, payload, fetchedDays, query.clientTz);
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

async function fetchBodyStats(token: string) {
  const [weight, height] = await Promise.all([api.listDataPoints(token, "weight", 1), api.listDataPoints(token, "height", 1)]);
  const grams = weight?.dataPoints?.[0]?.weight?.weightGrams;
  const mm = height?.dataPoints?.[0]?.height?.heightMillimeters;
  const weightKg = isPositive(grams) ? round(grams / 1000, 1) : null;
  const heightMeters = isPositive(mm) ? round(mm / 1000, 3) : null;
  const bmi = weightKg && heightMeters ? round(weightKg / (heightMeters * heightMeters), 1) : null;
  return { weightKg, heightMeters, bmi };
}

/** Per-day indexes for every source a daily summary is built from. */
interface DaySources {
  steps: DateIndex;
  calories: DateIndex;
  distance: DateIndex;
  azm: DateIndex;
  heartRate: DateIndex;
  floors: DateIndex;
  sleepByDate: Map<string, SleepRecord>;
  hrvByDate: Map<string, number>;
}

/** Looks up a day's value in an index; the live "today" row may substitute the most recent day. */
type Lookup = <T>(index: Map<string, T>, iso: string) => T | undefined;
const exact: Lookup = (index, iso) => index.get(iso);

function buildDay(src: DaySources, iso: string, today: string, lookup: Lookup = exact): DailyMetricSummary {
  const hr = lookup(src.heartRate, iso)?.heartRate;
  const zones = activeZones(src.azm.get(iso));
  const daySteps = Number(src.steps.get(iso)?.steps?.countSum ?? 0);
  const mm = Number(src.distance.get(iso)?.distance?.millimetersSum ?? 0);
  const night = lookup(src.sleepByDate, iso);
  return {
    ...emptyDay(iso, dayLabel(iso, today)),
    steps: daySteps,
    caloriesBurned: Math.round(Number(src.calories.get(iso)?.totalCalories?.kcalSum ?? 0)),
    distanceKm: mm > 0 ? round(mm / 1_000_000, 2) : round(daySteps * KM_PER_STEP, 1),
    floors: Number(src.floors.get(iso)?.floors?.countSum ?? 0),
    restingHeartRate: numOrNull(hr?.beatsPerMinuteMin),
    avgHeartRate: isPositive(hr?.beatsPerMinuteAvg) ? Math.round(hr.beatsPerMinuteAvg) : null,
    maxHeartRate: numOrNull(hr?.beatsPerMinuteMax),
    heartRateVariability: src.hrvByDate.get(iso) ?? null,
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
}

/** Daily rollups of every type over an ISO range, requested in chunks so long backfills stay within API window limits. */
async function fetchRollups(token: string, startIso: string, endIso: string) {
  const chunks: [string, string][] = [];
  for (let from = startIso; from <= endIso; from = shiftIso(from, ROLLUP_CHUNK_DAYS)) {
    const to = shiftIso(from, ROLLUP_CHUNK_DAYS - 1);
    chunks.push([from, to < endIso ? to : endIso]);
  }
  return Promise.all(
    ROLLUP_TYPES.map(async (type) => {
      const merged: DateIndex = new Map();
      for (const [from, to] of chunks) {
        for (const [iso, pt] of indexByDate(await api.dailyRollup(token, type, isoToCivil(from), isoToCivil(to)))) merged.set(iso, pt);
      }
      return merged;
    })
  );
}

export interface StoredWorkout {
  date: string;
  session: WorkoutSession;
}

/**
 * Completed days from `startIso` to `endIso` inclusive, for long-term history.
 * Unlike the live payload, no reading falls back to another day.
 */
export async function fetchDailyRange(
  token: string,
  startIso: string,
  endIso: string,
  timeZone?: string
): Promise<{ days: DailyMetricSummary[]; workouts: StoredWorkout[] }> {
  const dates: string[] = [];
  for (let iso = startIso; iso <= endIso; iso = shiftIso(iso, 1)) dates.push(iso);

  // Lists are newest first, so the item caps reach back roughly as far as the range does.
  const [rollups, sleep, dailyHrv, exercise] = await Promise.all([
    fetchRollups(token, shiftIso(startIso, -1), shiftIso(endIso, 1)),
    api.listDataPointsPaged(token, "sleep", 25, dates.length * 2 + 10),
    api.listDataPointsPaged(token, "daily-heart-rate-variability", 25, dates.length + 10),
    api.listDataPointsPaged(token, "exercise", 25, dates.length * 2),
  ]);
  const [steps, calories, distance, azm, heartRate, floors] = rollups;
  const src: DaySources = {
    steps, calories, distance, azm, heartRate, floors,
    sleepByDate: parseSleepRecords(sleep, timeZone),
    hrvByDate: indexDailyHrv(dailyHrv),
  };
  return {
    days: dates.map((iso) => buildDay(src, iso, shiftIso(endIso, 1))),
    workouts: dates.flatMap((iso) => parseWorkouts(exercise, iso, timeZone).map((session) => ({ date: iso, session }))),
  };
}

/** Fetches today's payload; days found in `settled` are reused instead of requested. */
async function loadLiveMetrics(
  state: AuthState,
  today: string,
  timeZone: string | undefined,
  settled: Map<string, DailyMetricSummary>
): Promise<HealthMetricsPayload> {
  const token = await getValidAccessToken(state.session);
  if (!token) throw new AuthError();
  const narrow = settled.size > 0;

  const intradayWindow = { start: new Date(`${shiftIso(today, -1)}T00:00:00Z`), end: new Date(`${shiftIso(today, 1)}T23:59:59Z`) };

  const [rollups, sleep, dailyHrv, spo2, body, exercise, intradaySteps, intradayHeartRate] = await Promise.all([
    // The full window (12 back, 2 ahead) covers the 7-day history plus UTC/civil skew at either end;
    // with settled days stored, a few days back still covers yesterday and today's fallback readings.
    fetchRollups(token, shiftIso(today, narrow ? -LIVE_LOOKBACK_DAYS : -12), shiftIso(today, 2)),
    api.listDataPoints(token, "sleep", narrow ? 6 : 20),
    api.listDataPoints(token, "daily-heart-rate-variability", narrow ? 4 : 10),
    api.listDataPoints(token, "oxygen-saturation", 20),
    // Weight and height change rarely: keep them for an hour instead of refetching every load.
    cached(`${state.scope}:body`, BODY_TTL_MS, () => fetchBodyStats(token)),
    api.listDataPoints(token, "exercise", 25),
    fetchIntradaySteps(token, intradayWindow, today, timeZone),
    fetchIntradayHeartRate(token, intradayWindow, today, timeZone),
  ]);
  const [steps, calories, distance, azm, heartRate, floors] = rollups;
  const src: DaySources = {
    steps, calories, distance, azm, heartRate, floors,
    sleepByDate: parseSleepRecords(sleep?.dataPoints ?? [], timeZone),
    hrvByDate: indexDailyHrv(dailyHrv?.dataPoints ?? []),
  };
  const todayWorkouts = parseWorkouts(exercise?.dataPoints ?? [], today, timeZone, intradayHeartRate);

  /**
   * Readings (heart rate, sleep, HRV) may fall back to the most recent recorded day
   * when today has none yet; the dates used are collected so the UI can say so.
   * Daily accumulators (steps, calories, distance, floors, active minutes) never
   * fall back: before a sync, today's true value is zero.
   */
  const fallbackDates: string[] = [];
  const withFallback: Lookup = (index, iso) => {
    const value = index.get(iso);
    if (value !== undefined) return value;
    const recent = latest(index);
    if (recent) fallbackDates.push(recent[0]);
    return recent?.[1];
  };

  // Raw HRV samples are only requested when no daily summary covers today.
  const heartRateVariability =
    withFallback(src.hrvByDate, today) ?? latestRawHrv((await api.listDataPoints(token, "heart-rate-variability", 20))?.dataPoints ?? []);
  const todayRow: DailyMetricSummary = {
    ...buildDay(src, today, today, withFallback),
    heartRateVariability,
    ...oxygenStats(spo2?.dataPoints ?? [], today),
    ...body,
  };
  const history7Days = lastDays(today, HISTORY_DAYS).map((iso) => {
    if (iso === today) return todayRow;
    const stored = settled.get(iso);
    return stored ? { ...stored, label: dayLabel(iso, today) } : buildDay(src, iso, today);
  });

  const freshness = {
    syncedToday: rollups.some((index) => index.has(today)),
    fallbackDate: fallbackDates.sort().pop() ?? null,
  };

  return { today: todayRow, intradaySteps, intradayHeartRate, history7Days, freshness, todayWorkouts, baseline: recentBaseline(history7Days, today) };
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
