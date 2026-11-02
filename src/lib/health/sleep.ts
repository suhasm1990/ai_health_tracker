import type { SleepStage, SleepStageSegment } from "../types";
import { civilInZone, civilToIso } from "../utils";
import type { DataPoint, SleepStageSegmentRaw, SleepSummary } from "./client";

export interface SleepQualityIndex {
  score: number;
  efficiencyPercent: number;
  durationScore: number;
  qualityScore: number;
  restorationScore: number;
}

const EMPTY_SQI: SleepQualityIndex = { score: 0, efficiencyPercent: 0, durationScore: 0, qualityScore: 0, restorationScore: 0 };

const stageMinutes = (summary: SleepSummary, type: string) =>
  Number(summary.stagesSummary?.find((s) => s.type === type)?.minutes ?? 0);

/**
 * Clinical Sleep Quality Index (0-100) built from NSF / AASM benchmarks:
 *  - Duration (0-50): minutes asleep against the 8-hour adult recommendation.
 *  - Architecture (0-25): Deep >= 15% and REM >= 20% of total sleep, 12.5 pts each.
 *  - Restoration (0-25): sleep efficiency (asleep / in bed) minus deductions for
 *    wake-after-sleep-onset minutes and brief awakenings.
 */
export function calculateSleepQualityIndex(summary: SleepSummary | undefined, awakenings = 0): SleepQualityIndex {
  const minutesAsleep = Number(summary?.minutesAsleep ?? 0);
  if (!summary || !minutesAsleep) return EMPTY_SQI;

  const minutesInBed = Math.max(minutesAsleep, Number(summary.minutesInSleepPeriod ?? minutesAsleep));
  const minutesAwake = Number(summary.minutesAwake ?? 0);

  const durationScore = Math.min(50, (minutesAsleep / 480) * 50);
  const deepScore = Math.min(12.5, (stageMinutes(summary, "DEEP") / minutesAsleep / 0.15) * 12.5);
  const remScore = Math.min(12.5, (stageMinutes(summary, "REM") / minutesAsleep / 0.2) * 12.5);
  const qualityScore = deepScore + remScore;

  const efficiency = minutesAsleep / minutesInBed;
  const restorationScore = Math.max(5, efficiency * 25 - (minutesAwake * 0.5 + awakenings * 0.2));

  // Devices that do not detect Deep/REM are scored on duration and restoration alone, scaled to 100,
  // rather than losing the architecture points they cannot earn.
  const hasArchitecture = stageMinutes(summary, "DEEP") + stageMinutes(summary, "REM") > 0;
  const raw = hasArchitecture ? durationScore + qualityScore + restorationScore : ((durationScore + restorationScore) / 75) * 100;

  return {
    score: Math.min(100, Math.max(20, Math.round(raw))),
    efficiencyPercent: Math.round(efficiency * 100),
    durationScore: Math.round(durationScore),
    qualityScore: Math.round(qualityScore),
    restorationScore: Math.round(restorationScore),
  };
}

export interface SleepRecord {
  minutesAsleep: number;
  score: number;
  efficiency: number;
  stages: SleepStageSegment[];
  startTime: string | null;
  endTime: string | null;
}

/** ASLEEP is undifferentiated sleep from devices without staging, shown as Light; RESTLESS counts as awake. */
const STAGE_NAMES: Record<string, SleepStage> = { DEEP: "Deep", REM: "REM", AWAKE: "Awake", RESTLESS: "Awake", LIGHT: "Light", ASLEEP: "Light" };
const AWAKE_TYPES = new Set(["AWAKE", "RESTLESS"]);

const minutesBetween = (startIso?: string, endIso?: string) => {
  const ms = Date.parse(endIso ?? "") - Date.parse(startIso ?? "");
  return Number.isFinite(ms) && ms > 0 ? Math.round(ms / 60_000) : 0;
};

/**
 * Google fills `summary` for Fitbit sessions; other sources may send only stage segments or an interval.
 * Rebuilds the summary from whatever is present so those nights are not recorded as zero sleep.
 */
function summaryOf(summary: SleepSummary | undefined, segments: SleepStageSegmentRaw[] | undefined, startIso?: string, endIso?: string): SleepSummary {
  if (Number(summary?.minutesAsleep) > 0) return summary!;
  const byType = new Map<string, number>();
  for (const seg of segments ?? []) {
    const type = seg.type ?? "ASLEEP";
    byType.set(type, (byType.get(type) ?? 0) + minutesBetween(seg.startTime, seg.endTime));
  }
  const stagesSummary = summary?.stagesSummary?.length ? summary.stagesSummary : [...byType].map(([type, minutes]) => ({ type, minutes }));
  const total = stagesSummary.reduce((sum, s) => sum + Number(s.minutes ?? 0), 0);
  const awake = stagesSummary.filter((s) => AWAKE_TYPES.has(s.type ?? "")).reduce((sum, s) => sum + Number(s.minutes ?? 0), 0);
  const inBed = Number(summary?.minutesInSleepPeriod) || total || minutesBetween(startIso, endIso);
  const minutesAwake = Number(summary?.minutesAwake) || awake;
  return { minutesAsleep: Math.max(0, (total || inBed) - minutesAwake), minutesInSleepPeriod: inBed, minutesAwake, stagesSummary };
}

function toStages(summary: SleepSummary | undefined): SleepStageSegment[] {
  const raw = summary?.stagesSummary ?? [];
  const total = raw.reduce((sum, s) => sum + Number(s.minutes ?? 0), 0) || 1;
  return raw.map((s) => {
    const durationMinutes = Number(s.minutes ?? 0);
    return { stage: STAGE_NAMES[s.type ?? ""] ?? "Light", durationMinutes, percentage: Math.round((durationMinutes / total) * 100) };
  });
}

function formatClock(iso: string | undefined, timeZone?: string): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone });
  } catch {
    return null;
  }
}

/** The local calendar date a sleep session ended on: device offset first, then the client zone, then UTC. */
function sessionDate(endIso: string, utcOffset: string | undefined, timeZone: string | undefined): string {
  const end = new Date(endIso);
  const offsetSec = utcOffset ? parseInt(utcOffset, 10) : NaN;
  if (Number.isFinite(offsetSec)) {
    const shifted = new Date(end.getTime() + offsetSec * 1000);
    return civilToIso({ year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() });
  }
  return civilToIso(civilInZone(end, timeZone));
}

/** Longest sleep session per local date, keyed by ISO date. */
export function parseSleepRecords(points: DataPoint[], timeZone?: string): Map<string, SleepRecord> {
  const byDate = new Map<string, SleepRecord>();
  for (const pt of points) {
    const interval = pt.sleep?.interval ?? pt.interval;
    if (!interval?.endTime) continue;
    const summary = summaryOf(pt.sleep?.summary ?? pt.summary, pt.sleep?.stages, interval.startTime, interval.endTime);
    const minutesAsleep = Number(summary.minutesAsleep ?? 0);
    const date = sessionDate(interval.endTime, interval.endUtcOffset, timeZone);
    if ((byDate.get(date)?.minutesAsleep ?? -1) >= minutesAsleep) continue;
    const sqi = calculateSleepQualityIndex(summary, (pt.sleep?.shortAwakenings ?? pt.shortAwakenings ?? []).length);
    byDate.set(date, {
      minutesAsleep,
      score: sqi.score,
      efficiency: sqi.efficiencyPercent,
      stages: toStages(summary),
      startTime: formatClock(interval.startTime, timeZone),
      endTime: formatClock(interval.endTime, timeZone),
    });
  }
  return byDate;
}
