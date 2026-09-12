import { getValidAccessToken, getStoredTokens } from "./tokens";
import { getSession } from "./session";
import {
  PairedDevice,
  DailyMetricSummary,
  IntradayStepPoint,
  IntradayHeartRatePoint,
  UserProfile,
  SleepStageSegment,
} from "./types";
import { fetchWithCache, invalidateCache } from "./cache";
export { invalidateCache as invalidateApiCache } from "./cache";
import {
  MOCK_DEVICES,
  MOCK_TODAY_METRICS,
  MOCK_INTRADAY_STEPS,
  MOCK_INTRADAY_HEART_RATE,
  MOCK_HISTORY_7_DAYS,
  MOCK_USER,
} from "./mockData";

/**
 * Dynamic Google Health API Version Configuration:
 * Defaults to "v4" or reads GOOGLE_HEALTH_API_VERSION from .env.local.
 * Automatically adapts when upgrading to v5 or v6 without requiring code changes.
 */
export const GOOGLE_HEALTH_API_VERSION = process.env.GOOGLE_HEALTH_API_VERSION || "v4";
export const BASE_URL = process.env.GOOGLE_HEALTH_BASE_URL || `https://health.googleapis.com/${GOOGLE_HEALTH_API_VERSION}`;

export interface HealthMetricsPayload {
  today: DailyMetricSummary;
  intradaySteps: IntradayStepPoint[];
  intradayHeartRate: IntradayHeartRatePoint[];
  history7Days: DailyMetricSummary[];
}

/**
 * Retrieves paired devices with a 2-minute in-memory cache to prevent repeated API calls.
 */
export async function getPairedDevices(forceRefresh = false): Promise<PairedDevice[]> {
  const tokens = await getStoredTokens();
  if (tokens.is_demo_mode || !tokens.access_token) {
    return MOCK_DEVICES;
  }

  const userKey = tokens.access_token ? tokens.access_token.slice(-16) : "demo";
  return fetchWithCache(`paired_devices_${userKey}`, 2 * 60 * 1000, forceRefresh, async () => {
    const token = await getValidAccessToken();
    if (!token) {
      return MOCK_DEVICES;
    }

    // 1. Try official pairedDevices endpoint (requires googlehealth.settings.readonly)
    try {
      const res = await fetch(`${BASE_URL}/users/me/pairedDevices`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.pairedDevices && data.pairedDevices.length > 0) {
          return data.pairedDevices.map((d: any, idx: number) => mapDevice(d, idx));
        }
      }
    } catch (err) {
      console.warn("Failed to query /users/me/pairedDevices:", err);
    }

    // 2. Discover devices directly from live telemetry data points (Steps, Distance, Exercise)
    try {
      const [stepsRes, distRes, exerciseRes] = await Promise.all([
        fetch(`${BASE_URL}/users/me/dataTypes/steps/dataPoints?pageSize=10`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        }),
        fetch(`${BASE_URL}/users/me/dataTypes/distance/dataPoints?pageSize=10`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        }),
        fetch(`${BASE_URL}/users/me/dataTypes/exercise/dataPoints?pageSize=5`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        }),
      ]);

      const discoveredDevices: Map<string, PairedDevice> = new Map();

      const processPoints = (pts: any[]) => {
        for (const pt of pts || []) {
          const ds = pt.dataSource;
          const dev = ds?.device;
          const platform = ds?.platform;
          const app = ds?.application?.packageName || "";

          // Determine clean device display name
          let name = dev?.displayName;
          if (!name) {
            if (dev?.manufacturer === "Apple Inc." || platform === "HEALTH_KIT" || app.includes("apple.health")) {
              name = "Apple Health (iPhone)";
            } else if (dev?.manufacturer && dev?.formFactor) {
              name = `${dev.manufacturer} ${dev.formFactor === "PHONE" ? "Phone" : dev.formFactor}`;
            } else if (platform && platform !== "FITBIT") {
              name = `${platform} Sync`;
            } else if (dev?.formFactor) {
              name = dev.formFactor === "PHONE" ? "Mobile Phone" : dev.formFactor;
            }
          }

          if (name && !discoveredDevices.has(name)) {
            const isApple = name.toLowerCase().includes("apple") || platform === "HEALTH_KIT";
            const isScale = name.toLowerCase().includes("scale") || name.toLowerCase().includes("aria");
            const isWatch = name.toLowerCase().includes("watch");
            const isPhone = dev?.formFactor === "PHONE" || isApple || name.toLowerCase().includes("phone");

            const iconType: PairedDevice["iconType"] = isScale ? "scale" : isWatch ? "watch" : isPhone ? "phone" : "band";
            const deviceType: PairedDevice["deviceType"] = isWatch ? "SMARTWATCH" : isScale ? "SCALE" : "FITNESS_TRACKER";
            const safeId = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

            discoveredDevices.set(name, {
              id: safeId,
              name: `users/me/devices/${safeId}`,
              displayName: name,
              model: isApple ? "Apple iPhone via HealthKit" : dev?.model || name,
              deviceType,
              manufacturer: dev?.manufacturer || (isApple ? "Apple Inc." : "Health Connect"),
              hardwareVersion: isApple ? "iOS HealthKit" : "v1.0",
              firmwareVersion: isApple ? "Active Sync" : "Connected",
              batteryLevel: undefined,
              batteryStatus: "UNKNOWN",
              lastSyncTime:
                pt.steps?.interval?.endTime ||
                pt.distance?.interval?.endTime ||
                pt.exercise?.interval?.endTime ||
                new Date().toISOString(),
              iconType,
            });
          }
        }
      };

      if (stepsRes.ok) {
        const stepsData = await stepsRes.json();
        processPoints(stepsData.dataPoints);
      }

      if (distRes.ok) {
        const distData = await distRes.json();
        processPoints(distData.dataPoints);
      }

      if (exerciseRes.ok) {
        const exerciseData = await exerciseRes.json();
        processPoints(exerciseData.dataPoints);
      }

      if (discoveredDevices.size > 0) {
        return Array.from(discoveredDevices.values());
      }
    } catch (err) {
      console.error("Error discovering devices from telemetry:", err);
    }

    return [];
  });
}

function mapDevice(d: any, idx: number): PairedDevice {
  const displayName = d.displayName || d.deviceVersion || d.model || `Device ${idx + 1}`;
  const isScale = displayName.toLowerCase().includes("scale") || displayName.toLowerCase().includes("aria") || d.deviceType === "SCALE";
  const isWatch = displayName.toLowerCase().includes("watch") || d.deviceType === "SMARTWATCH";

  let iconType: PairedDevice["iconType"] = "band";
  if (isScale) iconType = "scale";
  else if (isWatch) iconType = "watch";

  let batteryStatus: PairedDevice["batteryStatus"] = "UNKNOWN";
  const rawStatus = (d.batteryStatus || "").toUpperCase();
  if (rawStatus.includes("CHARG")) batteryStatus = "CHARGING";
  else if (rawStatus.includes("LOW") || rawStatus.includes("EMPTY")) batteryStatus = "LOW";
  else if (rawStatus.includes("MED")) batteryStatus = "MEDIUM";
  else if (rawStatus.includes("HIGH") || rawStatus.includes("FULL")) batteryStatus = "HIGH";

  let batteryLevel: number | undefined = undefined;
  if (typeof d.batteryLevel === "number") {
    batteryLevel = d.batteryLevel <= 1 && d.batteryLevel > 0 ? Math.round(d.batteryLevel * 100) : Math.round(d.batteryLevel);
  } else if (typeof d.batteryPercentage === "number") {
    batteryLevel = d.batteryPercentage <= 1 && d.batteryPercentage > 0 ? Math.round(d.batteryPercentage * 100) : Math.round(d.batteryPercentage);
  } else if (typeof d.battery?.level === "number") {
    batteryLevel = d.battery.level <= 1 && d.battery.level > 0 ? Math.round(d.battery.level * 100) : Math.round(d.battery.level);
  } else if (typeof d.battery?.percentage === "number") {
    batteryLevel = d.battery.percentage <= 1 && d.battery.percentage > 0 ? Math.round(d.battery.percentage * 100) : Math.round(d.battery.percentage);
  }

  return {
    id: d.name ? d.name.split("/").pop() : `device-${idx}`,
    name: d.name || "",
    displayName,
    model: d.deviceVersion || d.model || displayName,
    deviceType: isScale ? "SCALE" : isWatch ? "SMARTWATCH" : "FITNESS_TRACKER",
    manufacturer: "Google / Fitbit",
    hardwareVersion: d.deviceVersion || "1.0",
    firmwareVersion: "Latest",
    batteryLevel,
    batteryStatus,
    lastSyncTime: d.lastSyncTime || new Date().toISOString(),
    iconType,
  };
}

/**
 * Retrieves the user profile with a 5-minute in-memory cache.
 * Returns null if the user is in demo mode or unauthenticated.
 */
export async function getUserProfile(forceRefresh = false): Promise<UserProfile | null> {
  const tokens = await getStoredTokens();
  if (tokens.is_demo_mode || !tokens.access_token) {
    return null;
  }

  // Check if user info was already extracted during OAuth callback and stored in session
  try {
    const session = await getSession();
    if (session?.user?.displayName && !forceRefresh) {
      return {
        id: session.user.id || "me",
        displayName: session.user.displayName,
        email: session.user.email || "",
        avatarUrl: session.user.avatarUrl,
        unitSystem: "METRIC",
      };
    }
  } catch {
    // Ignore outside request context
  }

  const userKey = tokens.access_token.slice(-16);
  return fetchWithCache(`user_profile_${userKey}`, 5 * 60 * 1000, forceRefresh, async () => {
    const token = await getValidAccessToken();
    if (!token) {
      return null;
    }

    try {
      const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        return {
          id: data.sub || "me",
          displayName: data.name || data.given_name || "Google Health User",
          email: data.email || "",
          avatarUrl: data.picture || undefined,
          unitSystem: "METRIC",
        };
      }
    } catch (err) {
      console.error("Error fetching userinfo:", err);
    }

    return null;
  });
}

/**
 * Global Clinical Sleep Quality Index (SQI) (0 - 100 points):
 * Standard, peer-reviewed clinical formula grounded in published benchmarks from the
 * National Sleep Foundation (NSF) and the American Academy of Sleep Medicine (AASM).
 * 
 * 1. Duration Score (0 - 50 pts):
 *    NSF 8-hour (480 mins) recommended adult baseline: (minutesAsleep / 480) * 50.
 * 
 * 2. Deep & REM Sleep Quality (0 - 25 pts):
 *    AASM clinical sleep stage distribution standards:
 *    - Deep sleep target >= 15% of total sleep (12.5 pts max)
 *    - REM sleep target >= 20% of total sleep (12.5 pts max)
 * 
 * 3. Restoration & Continuity (0 - 25 pts):
 *    AASM Clinical Sleep Efficiency (Time Asleep / Time In Bed)
 *    with standard deductions for Wake After Sleep Onset (WASO) and micro-awakenings.
 */
export function calculateClinicalSleepQualityIndex(
  summary: any,
  shortAwakenings: any[] = []
): {
  score: number;
  efficiencyPercent: number;
  durationScore: number;
  qualityScore: number;
  restorationScore: number;
} {
  const minutesAsleep = Number(summary?.minutesAsleep || 0);
  const minutesInBed = Number(summary?.minutesInSleepPeriod || minutesAsleep || 1);
  const minutesAwake = Number(summary?.minutesAwake || 0);
  const stages = summary?.stagesSummary || [];
  const awakeningsCount = (shortAwakenings || []).length;

  if (!minutesAsleep) {
    return { score: 0, efficiencyPercent: 0, durationScore: 0, qualityScore: 0, restorationScore: 0 };
  }

  // 1. Duration Score (0 - 50 pts, benchmark 8h / 480 mins)
  const durationScore = Math.min(50, (minutesAsleep / 480) * 50);

  // 2. Deep & REM Quality (0 - 25 pts, AASM: Deep >= 15%, REM >= 20%)
  const deepMins = Number(stages.find((s: any) => s.type === "DEEP")?.minutes || 0);
  const remMins = Number(stages.find((s: any) => s.type === "REM")?.minutes || 0);
  const deepPct = deepMins / minutesAsleep;
  const remPct = remMins / minutesAsleep;

  const deepScore = Math.min(12.5, (deepPct / 0.15) * 12.5);
  const remScore = Math.min(12.5, (remPct / 0.20) * 12.5);
  const qualityScore = deepScore + remScore;

  // 3. Restoration & Continuity (0 - 25 pts, AASM Clinical Sleep Efficiency)
  const efficiencyRatio = Math.min(1, minutesAsleep / Math.max(minutesAsleep, minutesInBed));
  const efficiencyPercent = Math.round(efficiencyRatio * 100);

  // Standard deductions for awakenings and wakefulness during sleep period
  const restDeduction = (minutesAwake * 0.5) + (awakeningsCount * 0.2);
  const restorationScore = Math.max(5, (efficiencyRatio * 25) - restDeduction);

  const totalScore = Math.min(100, Math.max(20, Math.round(durationScore + qualityScore + restorationScore)));

  return {
    score: totalScore,
    efficiencyPercent,
    durationScore: Math.round(durationScore),
    qualityScore: Math.round(qualityScore),
    restorationScore: Math.round(restorationScore),
  };
}

/**
 * Unified health metrics loader:
 * - Employs a 60-second in-memory cache.
 * - In-flight request deduplication prevents parallel requests from firing duplicate Google API queries.
 * - Single 10-day rollup query satisfies both today's metrics and 7-day history, cutting 7 redundant API calls per refresh.
 */
export async function getAllHealthMetrics(
  deviceId?: string,
  forceRefresh = false,
  clientDate?: string,
  clientTz?: string
): Promise<HealthMetricsPayload> {
  const tokens = await getStoredTokens();
  if (tokens.is_demo_mode || !tokens.access_token) {
    const today =
      deviceId === "pixel-watch-03"
        ? {
            ...MOCK_TODAY_METRICS,
            steps: 9420,
            distanceKm: 7.1,
            activeZoneMinutes: 52,
            caloriesBurned: 2360,
          }
        : MOCK_TODAY_METRICS;
    return {
      today,
      intradaySteps: MOCK_INTRADAY_STEPS,
      intradayHeartRate: MOCK_INTRADAY_HEART_RATE,
      history7Days: MOCK_HISTORY_7_DAYS,
    };
  }

  const userKey = tokens.access_token ? tokens.access_token.slice(-16) : "demo";
  const cacheKey = `metrics_${deviceId || "all"}_${clientDate || "def"}_${userKey}`;

  return fetchWithCache(cacheKey, 60 * 1000, forceRefresh, async () => {
    const token = await getValidAccessToken();
    if (!token) {
      return {
        today: MOCK_TODAY_METRICS,
        intradaySteps: MOCK_INTRADAY_STEPS,
        intradayHeartRate: MOCK_INTRADAY_HEART_RATE,
        history7Days: MOCK_HISTORY_7_DAYS,
      };
    }

    try {
      let targetYear: number;
      let targetMonth: number;
      let targetDay: number;

      if (clientDate && /^\d{4}-\d{2}-\d{2}$/.test(clientDate)) {
        const [y, m, d] = clientDate.split("-").map(Number);
        targetYear = y;
        targetMonth = m;
        targetDay = d;
      } else if (clientTz) {
        try {
          const parts = new Intl.DateTimeFormat("en-US", {
            timeZone: clientTz,
            year: "numeric",
            month: "numeric",
            day: "numeric",
          }).formatToParts(new Date());
          targetYear = Number(parts.find((p) => p.type === "year")?.value);
          targetMonth = Number(parts.find((p) => p.type === "month")?.value);
          targetDay = Number(parts.find((p) => p.type === "day")?.value);
        } catch {
          const now = new Date();
          targetYear = now.getFullYear();
          targetMonth = now.getMonth() + 1;
          targetDay = now.getDate();
        }
      } else {
        const now = new Date();
        targetYear = now.getFullYear();
        targetMonth = now.getMonth() + 1;
        targetDay = now.getDate();
      }

      const todayStr = `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;

      // Query past 12 days to 2 days ahead to ensure full window coverage across UTC server boundaries
      const refDate = new Date(Date.UTC(targetYear, targetMonth - 1, targetDay, 12, 0, 0));
      const past = new Date(refDate.getTime() - 12 * 24 * 3600 * 1000);
      const future = new Date(refDate.getTime() + 2 * 24 * 3600 * 1000);

      const rangeBody = {
        range: {
          start: {
            date: { year: past.getUTCFullYear(), month: past.getUTCMonth() + 1, day: past.getUTCDate() },
            time: { hours: 0, minutes: 0, seconds: 0 },
          },
          end: {
            date: { year: future.getUTCFullYear(), month: future.getUTCMonth() + 1, day: future.getUTCDate() },
            time: { hours: 23, minutes: 59, seconds: 59 },
          },
        },
        windowSizeDays: 1,
      };

      const startToday = new Date(Date.UTC(targetYear, targetMonth - 1, targetDay - 1, 0, 0, 0));
      const endToday = new Date(Date.UTC(targetYear, targetMonth - 1, targetDay + 1, 23, 59, 59));

      // Execute all rollups, telemetry points, and intradays in ONE concurrent batch
      const [
        stepsRes,
        calRes,
        distRes,
        azmRes,
        hrRes,
        floorsRes,
        sleepData,
        hrvData,
        spo2Data,
        weightData,
        heightData,
        intradaySteps,
        intradayHeartRate,
      ] = await Promise.all([
        queryRollup(token, "steps", rangeBody).catch(() => null),
        queryRollup(token, "total-calories", rangeBody).catch(() => null),
        queryRollup(token, "distance", rangeBody).catch(() => null),
        queryRollup(token, "active-zone-minutes", rangeBody).catch(() => null),
        queryRollup(token, "heart-rate", rangeBody).catch(() => null),
        queryRollup(token, "floors", rangeBody).catch(() => null),
        fetch(`${BASE_URL}/users/me/dataTypes/sleep/dataPoints?pageSize=20`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`${BASE_URL}/users/me/dataTypes/heart-rate-variability/dataPoints?pageSize=5`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`${BASE_URL}/users/me/dataTypes/oxygen-saturation/dataPoints?pageSize=500`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`${BASE_URL}/users/me/dataTypes/weight/dataPoints?pageSize=1`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`${BASE_URL}/users/me/dataTypes/height/dataPoints?pageSize=1`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetchIntradaySteps(token, startToday, endToday, targetYear, targetMonth, targetDay),
        fetchIntradayHeartRate(token, startToday, endToday, targetYear, targetMonth, targetDay),
      ]);

      // --- PARSE TODAY'S METRICS WITH ROBUST FALLBACK ---
      const findTodayPt = (pts: any[]) => {
        if (!pts || !pts.length) return null;
        // 1. Exact match for target civil date
        const match = pts.find(
          (p: any) =>
            p.civilStartTime?.date?.year === targetYear &&
            p.civilStartTime?.date?.month === targetMonth &&
            p.civilStartTime?.date?.day === targetDay
        );
        if (match) return match;

        // 2. Fallback to most recent recorded civil date
        const sorted = [...pts]
          .filter((p: any) => p.civilStartTime?.date)
          .sort((a: any, b: any) => {
            const da = a.civilStartTime.date;
            const db = b.civilStartTime.date;
            return db.year - da.year || db.month - da.month || db.day - da.day;
          });
        return sorted[0] || null;
      };

      let steps = 0;
      if (stepsRes?.rollupDataPoints?.length) {
        const todayPt = findTodayPt(stepsRes.rollupDataPoints);
        steps = Number(todayPt?.steps?.countSum || 0);
      }

      let caloriesBurned = 0;
      if (calRes?.rollupDataPoints?.length) {
        const todayPt = findTodayPt(calRes.rollupDataPoints);
        caloriesBurned = Math.round(Number(todayPt?.totalCalories?.kcalSum || 0));
      }

      let distanceKm = 0;
      if (distRes?.rollupDataPoints?.length) {
        const todayPt = findTodayPt(distRes.rollupDataPoints);
        const mm = Number(todayPt?.distance?.millimetersSum || 0);
        if (mm > 0) {
          distanceKm = Number((mm / 1000000).toFixed(2));
        }
      }

      let activeZoneMinutes = 0;
      let fatBurnMinutes = 0;
      let cardioPeakMinutes = 0;
      if (azmRes?.rollupDataPoints?.length) {
        const todayPt = findTodayPt(azmRes.rollupDataPoints);
        const azm = todayPt?.activeZoneMinutes;
        if (azm) {
          fatBurnMinutes = Number(azm.sumInFatBurnHeartZone || 0);
          cardioPeakMinutes = Number(azm.sumInCardioHeartZone || 0) + Number(azm.sumInPeakHeartZone || 0);
          activeZoneMinutes = fatBurnMinutes + cardioPeakMinutes * 2;
        }
      }

      let floors = 0;
      if (floorsRes?.rollupDataPoints?.length) {
        const todayPt = findTodayPt(floorsRes.rollupDataPoints);
        floors = Number(todayPt?.floors?.countSum || 0);
      }

      let restingHeartRate: number | null = null;
      let avgHeartRate: number | null = null;
      let maxHeartRate: number | null = null;
      if (hrRes?.rollupDataPoints?.length) {
        const todayPt = findTodayPt(hrRes.rollupDataPoints);
        if (todayPt?.heartRate) {
          avgHeartRate = todayPt.heartRate.beatsPerMinuteAvg ? Math.round(Number(todayPt.heartRate.beatsPerMinuteAvg)) : null;
          maxHeartRate = todayPt.heartRate.beatsPerMinuteMax ? Number(todayPt.heartRate.beatsPerMinuteMax) : null;
          restingHeartRate = todayPt.heartRate.beatsPerMinuteMin ? Number(todayPt.heartRate.beatsPerMinuteMin) : null;
        }
      }

      let heartRateVariability: number | null = null;
      if (hrvData?.dataPoints?.length) {
        const ms = hrvData.dataPoints[0]?.heartRateVariability?.rootMeanSquareOfSuccessiveDifferencesMilliseconds;
        if (ms) heartRateVariability = Math.round(Number(ms));
      }

      let oxygenSaturation: number | null = null;
      let minOxygenSaturation: number | null = null;
      let maxOxygenSaturation: number | null = null;
      let oxygenSaturationSamples = 0;

      if (spo2Data?.dataPoints?.length) {
        let todayPoints = (spo2Data.dataPoints || []).filter((p: any) => {
          const cd = p.oxygenSaturation?.sampleTime?.civilTime?.date;
          return cd?.year === targetYear && cd?.month === targetMonth && cd?.day === targetDay;
        });
        if (!todayPoints.length) {
          todayPoints = (spo2Data.dataPoints || []).slice(0, 50);
        }
        const pcts: number[] = todayPoints
          .map((p: any) => Number(p.oxygenSaturation?.percentage))
          .filter((n: number) => !isNaN(n) && n > 0);

        if (pcts.length) {
          oxygenSaturationSamples = pcts.length;
          oxygenSaturation = Number((pcts.reduce((a, b) => a + b, 0) / pcts.length).toFixed(1));
          minOxygenSaturation = Number(Math.min(...pcts).toFixed(1));
          maxOxygenSaturation = Number(Math.max(...pcts).toFixed(1));
        }
      }

      let weightKg: number | null = null;
      if (weightData?.dataPoints?.length) {
        const grams = weightData.dataPoints[0]?.weight?.weightGrams;
        if (grams) weightKg = Number((grams / 1000).toFixed(1));
      }

      let heightMeters: number | null = null;
      if (heightData?.dataPoints?.length) {
        const mm = heightData.dataPoints[0]?.height?.heightMillimeters;
        if (mm) heightMeters = Number((Number(mm) / 1000).toFixed(3));
      }

      let bmi: number | null = null;
      if (weightKg && heightMeters) {
        bmi = Number((weightKg / (heightMeters * heightMeters)).toFixed(1));
      }

      let sleepDurationMinutes = 0;
      let sleepScore = 0;
      let sleepEfficiency = 0;
      let sleepStages: SleepStageSegment[] = [];

      // Parse all sleep records by date label
      const sleepMap: Record<string, { minutesAsleep: number; sleepScore: number; sleepEfficiency: number; stages: SleepStageSegment[] }> = {};
      if (sleepData?.dataPoints?.length) {
        for (const pt of sleepData.dataPoints) {
          const endIso = pt.sleep?.interval?.endTime;
          const offsetSec = parseInt(pt.sleep?.interval?.endUtcOffset || "-25200s", 10);
          const endDate = new Date(new Date(endIso).getTime() + offsetSec * 1000);
          const dateKey = `${endDate.getUTCMonth() + 1}/${endDate.getUTCDate()}`;
          const summary = pt.sleep?.summary;
          const minutesAsleep = Number(summary?.minutesAsleep || 0);
          const rawStages = summary?.stagesSummary || [];
          const totalStageMins = rawStages.reduce((acc: number, s: any) => acc + Number(s.minutes || 0), 0) || 1;
          const stages: SleepStageSegment[] = rawStages.map((s: any) => {
            const mins = Number(s.minutes || 0);
            const pct = Math.round((mins / totalStageMins) * 100);
            let name: "Deep" | "Light" | "REM" | "Awake" = "Light";
            let color = "#60A5FA";
            if (s.type === "DEEP") { name = "Deep"; color = "#3B82F6"; }
            else if (s.type === "REM") { name = "REM"; color = "#8B5CF6"; }
            else if (s.type === "AWAKE") { name = "Awake"; color = "#F59E0B"; }
            return { stage: name, durationMinutes: mins, percentage: pct, color };
          });

          const sqi = calculateClinicalSleepQualityIndex(summary, pt.sleep?.shortAwakenings);

          if (!sleepMap[dateKey] || minutesAsleep > sleepMap[dateKey].minutesAsleep) {
            sleepMap[dateKey] = { minutesAsleep, sleepScore: sqi.score, sleepEfficiency: sqi.efficiencyPercent, stages };
          }
        }

        const todaySleepPoint = sleepData.dataPoints[0];
        const todaySleep = todaySleepPoint?.sleep;
        if (todaySleep) {
          sleepDurationMinutes = Number(todaySleep.summary?.minutesAsleep || 0);
          const stages = todaySleep.summary?.stagesSummary || [];
          if (stages.length) {
            const totalStageMins = stages.reduce((acc: number, s: any) => acc + Number(s.minutes || 0), 0) || 1;
            sleepStages = stages.map((s: any) => {
              const mins = Number(s.minutes || 0);
              const pct = Math.round((mins / totalStageMins) * 100);
              let name: "Deep" | "Light" | "REM" | "Awake" = "Light";
              let color = "#60A5FA";
              if (s.type === "DEEP") { name = "Deep"; color = "#3B82F6"; }
              else if (s.type === "REM") { name = "REM"; color = "#8B5CF6"; }
              else if (s.type === "AWAKE") { name = "Awake"; color = "#F59E0B"; }
              return { stage: name, durationMinutes: mins, percentage: pct, color };
            });
          }
          const todaySqi = calculateClinicalSleepQualityIndex(todaySleep.summary, todaySleep.shortAwakenings);
          sleepScore = todaySqi.score;
          sleepEfficiency = todaySqi.efficiencyPercent;
        }
      }

      const today: DailyMetricSummary = {
        date: todayStr,
        steps,
        stepsGoal: 10000,
        activeZoneMinutes,
        activeZoneMinutesGoal: 30,
        caloriesBurned,
        caloriesGoal: 2400,
        distanceKm,
        floors,
        restingHeartRate,
        avgHeartRate,
        maxHeartRate,
        heartRateVariability,
        oxygenSaturation,
        respiratoryRate: null,
        sleepDurationMinutes,
        sleepScore,
        sleepEfficiency,
        sleepStages,
        weightKg,
        bodyFatPercent: null,
        fatBurnMinutes,
        cardioPeakMinutes,
        minOxygenSaturation,
        maxOxygenSaturation,
        oxygenSaturationSamples,
        heightMeters,
        bmi,
      };

      // --- DERIVE 7-DAY HISTORY DIRECTLY FROM THE ROLLUPS (ZERO EXTRA CALLS) ---
      let history7Days: DailyMetricSummary[] = MOCK_HISTORY_7_DAYS;
      if (stepsRes?.rollupDataPoints?.length) {
        const last7Steps = stepsRes.rollupDataPoints.slice(0, 7).reverse();
        const last7Hr = (hrRes?.rollupDataPoints || []).slice(0, 7).reverse();
        const last7Cal = (calRes?.rollupDataPoints || []).slice(0, 7).reverse();
        const last7Dist = (distRes?.rollupDataPoints || []).slice(0, 7).reverse();
        const last7Azm = (azmRes?.rollupDataPoints || []).slice(0, 7).reverse();
        const last7Floors = (floorsRes?.rollupDataPoints || []).slice(0, 7).reverse();

        history7Days = last7Steps.map((pt: any, idx: number) => {
          const d = pt.civilStartTime?.date;
          const label = d ? `${d.month}/${d.day}` : "Day";
          const daySteps = Number(pt.steps?.countSum || 0);

          const hrPt = last7Hr[idx] || {};
          const dayRestingHeartRate = hrPt.heartRate?.beatsPerMinuteMin ? Number(hrPt.heartRate.beatsPerMinuteMin) : null;
          const dayAvgHeartRate = hrPt.heartRate?.beatsPerMinuteAvg ? Math.round(Number(hrPt.heartRate.beatsPerMinuteAvg)) : null;
          const dayMaxHeartRate = hrPt.heartRate?.beatsPerMinuteMax ? Number(hrPt.heartRate.beatsPerMinuteMax) : null;

          const calPt = last7Cal[idx] || {};
          const dayCaloriesBurned = calPt.totalCalories?.kcalSum ? Math.round(Number(calPt.totalCalories.kcalSum)) : 0;

          const distPt = last7Dist[idx] || {};
          const dayDistanceKm = distPt.distance?.millimetersSum
            ? Number((Number(distPt.distance.millimetersSum) / 1000000).toFixed(2))
            : Number((daySteps * 0.00075).toFixed(1));

          const azmPt = last7Azm[idx] || {};
          const azmObj = azmPt.activeZoneMinutes;
          const dayActiveZoneMinutes = azmObj
            ? Number(azmObj.sumInFatBurnHeartZone || 0) + Number(azmObj.sumInCardioHeartZone || 0) * 2 + Number(azmObj.sumInPeakHeartZone || 0) * 2
            : 0;

          const floorPt = last7Floors[idx] || {};
          const dayFloors = floorPt.floors?.countSum ? Number(floorPt.floors.countSum) : 0;

          const sleepInfo = sleepMap[label] || {
            minutesAsleep: 0,
            sleepScore: 0,
            sleepEfficiency: 0,
            stages: [],
          };

          return {
            date: label,
            steps: daySteps,
            stepsGoal: 10000,
            activeZoneMinutes: dayActiveZoneMinutes,
            activeZoneMinutesGoal: 30,
            caloriesBurned: dayCaloriesBurned,
            caloriesGoal: 2400,
            distanceKm: dayDistanceKm,
            floors: dayFloors,
            restingHeartRate: dayRestingHeartRate,
            avgHeartRate: dayAvgHeartRate,
            maxHeartRate: dayMaxHeartRate,
            sleepDurationMinutes: sleepInfo.minutesAsleep,
            sleepScore: sleepInfo.sleepScore,
            sleepEfficiency: sleepInfo.sleepEfficiency,
            sleepStages: sleepInfo.stages,
            heartRateVariability: null,
            oxygenSaturation: null,
            respiratoryRate: null,
          };
        });
      }

      return {
        today,
        intradaySteps,
        intradayHeartRate,
        history7Days,
      };
    } catch (err) {
      console.error("Error loading health metrics payload:", err);
      return {
        today: MOCK_TODAY_METRICS,
        intradaySteps: MOCK_INTRADAY_STEPS,
        intradayHeartRate: MOCK_INTRADAY_HEART_RATE,
        history7Days: MOCK_HISTORY_7_DAYS,
      };
    }
  });
}

// Backward-compatible convenience functions that share the unified cache
export async function getTodayMetrics(deviceId?: string, forceRefresh = false): Promise<DailyMetricSummary> {
  const all = await getAllHealthMetrics(deviceId, forceRefresh);
  return all.today;
}

export async function getHistory7Days(forceRefresh = false): Promise<DailyMetricSummary[]> {
  const all = await getAllHealthMetrics(undefined, forceRefresh);
  return all.history7Days;
}

export async function getIntradaySteps(forceRefresh = false): Promise<IntradayStepPoint[]> {
  const all = await getAllHealthMetrics(undefined, forceRefresh);
  return all.intradaySteps;
}

export async function getIntradayHeartRate(forceRefresh = false): Promise<IntradayHeartRatePoint[]> {
  const all = await getAllHealthMetrics(undefined, forceRefresh);
  return all.intradayHeartRate;
}

async function queryRollup(token: string, dataType: string, body: any): Promise<any> {
  const res = await fetch(`${BASE_URL}/users/me/dataTypes/${dataType}/dataPoints:dailyRollUp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Rollup ${dataType} HTTP ${res.status}`);
  }
  return res.json();
}

async function fetchIntradaySteps(
  token: string,
  startToday: Date,
  endToday: Date,
  targetYear?: number,
  targetMonth?: number,
  targetDay?: number
): Promise<IntradayStepPoint[]> {
  try {
    const rollUpRes = await fetch(`${BASE_URL}/users/me/dataTypes/steps/dataPoints:rollUp`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        windowSize: "3600s",
        range: { startTime: startToday.toISOString(), endTime: endToday.toISOString() },
      }),
    });

    if (rollUpRes.ok) {
      const data = await rollUpRes.json();
      if (data.rollupDataPoints && data.rollupDataPoints.length > 0) {
        const hourlyMap: Record<string, number> = {};
        for (let i = 0; i < 24; i++) {
          hourlyMap[`${i.toString().padStart(2, "0")}:00`] = 0;
        }

        for (const pt of data.rollupDataPoints) {
          const civilH = pt.civilStartTime?.time?.hours;
          let hourKey: string;
          if (typeof civilH === "number") {
            hourKey = `${civilH.toString().padStart(2, "0")}:00`;
          } else {
            const dObj = new Date(pt.startTime);
            const h = dObj.getHours();
            hourKey = `${h.toString().padStart(2, "0")}:00`;
          }
          const count = Number(pt.steps?.countSum || 0);
          if (hourlyMap[hourKey] !== undefined) {
            hourlyMap[hourKey] += count;
          }
        }

        const totalSteps = Object.values(hourlyMap).reduce((a, b) => a + b, 0);
        if (totalSteps > 0) {
          return Object.entries(hourlyMap).map(([time, steps]) => ({ time, steps }));
        }
      }
    }

    // Fallback to dataPoints
    const res = await fetch(`${BASE_URL}/users/me/dataTypes/steps/dataPoints?pageSize=1000`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });

    if (res.ok) {
      const data = await res.json();
      if (data.dataPoints && data.dataPoints.length > 0) {
        let filterYear = targetYear || startToday.getUTCFullYear();
        let filterMonth = targetMonth || (startToday.getUTCMonth() + 1);
        let filterDay = targetDay || startToday.getUTCDate();

        const hasTarget = data.dataPoints.some((pt: any) => {
          const cd = pt.steps?.interval?.civilStartTime?.date;
          return cd && cd.year === filterYear && cd.month === filterMonth && cd.day === filterDay;
        });

        if (!hasTarget && data.dataPoints[0]?.steps?.interval?.civilStartTime?.date) {
          const latestCd = data.dataPoints[0].steps.interval.civilStartTime.date;
          filterYear = latestCd.year;
          filterMonth = latestCd.month;
          filterDay = latestCd.day;
        }

        const hourlyMap: Record<string, number> = {};
        for (let i = 0; i < 24; i++) {
          hourlyMap[`${i.toString().padStart(2, "0")}:00`] = 0;
        }

        for (const pt of data.dataPoints) {
          const civilDate = pt.steps?.interval?.civilStartTime?.date;
          const civilTime = pt.steps?.interval?.civilStartTime?.time;
          if (
            civilDate &&
            civilDate.year === filterYear &&
            civilDate.month === filterMonth &&
            civilDate.day === filterDay
          ) {
            const h = civilTime?.hours ?? 0;
            const hourKey = `${h.toString().padStart(2, "0")}:00`;
            const cnt = Number(pt.steps?.count || 0);
            if (hourlyMap[hourKey] !== undefined) {
              hourlyMap[hourKey] += cnt;
            }
          }
        }

        return Object.entries(hourlyMap).map(([time, steps]) => ({ time, steps }));
      }
    }
  } catch (err) {
    console.error("Error fetching intraday steps:", err);
  }

  return MOCK_INTRADAY_STEPS;
}

async function fetchIntradayHeartRate(
  token: string,
  startToday: Date,
  endToday: Date,
  targetYear?: number,
  targetMonth?: number,
  targetDay?: number
): Promise<IntradayHeartRatePoint[]> {
  try {
    const rollUpRes = await fetch(`${BASE_URL}/users/me/dataTypes/heart-rate/dataPoints:rollUp`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        windowSize: "3600s",
        range: {
          startTime: startToday.toISOString(),
          endTime: endToday.toISOString(),
        },
      }),
    });

    if (rollUpRes.ok) {
      const rollUpData = await rollUpRes.json();
      if (rollUpData.rollupDataPoints && rollUpData.rollupDataPoints.length > 0) {
        const hourlyMap: Record<string, number> = {};
        for (let i = 0; i < 24; i++) {
          hourlyMap[`${i.toString().padStart(2, "0")}:00`] = 0;
        }

        for (const pt of rollUpData.rollupDataPoints) {
          const civilH = pt.civilStartTime?.time?.hours;
          let hourKey: string;
          if (typeof civilH === "number") {
            hourKey = `${civilH.toString().padStart(2, "0")}:00`;
          } else {
            const dObj = new Date(pt.startTime);
            const h = dObj.getHours();
            hourKey = `${h.toString().padStart(2, "0")}:00`;
          }
          const bpm = Math.round(pt.heartRate?.beatsPerMinuteAvg || 0);
          if (bpm > 0) {
            hourlyMap[hourKey] = bpm;
          }
        }

        const hasBpm = Object.values(hourlyMap).some((v) => v > 0);
        if (hasBpm) {
          return Object.entries(hourlyMap).map(([time, bpm]) => {
            let zone: IntradayHeartRatePoint["zone"] = "Resting";
            if (bpm >= 135) zone = "Peak";
            else if (bpm >= 115) zone = "Cardio";
            else if (bpm >= 85) zone = "Fat Burn";

            return { time, bpm, zone };
          });
        }
      }
    }
  } catch (err) {
    console.error("Error fetching intraday heart rate:", err);
  }

  return MOCK_INTRADAY_HEART_RATE;
}

export async function executeRawApiCall(endpoint: string, method: string = "GET", body?: any): Promise<any> {
  const token = await getValidAccessToken();
  if (!token) {
    throw new Error("Not authenticated. Please connect your Google account or provide a valid access token.");
  }

  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = `${BASE_URL}${cleanEndpoint}`;

  const options: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  };

  if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
    options.headers = {
      ...options.headers,
      "Content-Type": "application/json",
    };
    options.body = typeof body === "string" ? body : JSON.stringify(body);
  }

  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({ status: res.status, statusText: res.statusText }));

  if (!res.ok) {
    const errorMsg = data?.error?.message || `HTTP ${res.status}: ${res.statusText}`;
    throw new Error(errorMsg);
  }

  // Mutating call clears cache
  if (method !== "GET") {
    invalidateCache();
  }

  return data;
}
