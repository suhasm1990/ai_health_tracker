import type { DailyMetricSummary, PersonalBaseline } from "./types";

/**
 * Effort: how hard the body worked in a day, on a 0-100 scale.
 *
 * Load is Active Zone Minutes (fat-burn minutes count once, cardio and peak twice,
 * the same weighting Fitbit credits) plus a little for everyday steps beyond 3,000.
 * The score rises steeply at first and flattens out, so going from 20 to 40 takes far
 * less work than going from 80 to 100, the way fatigue actually builds.
 */

/** Load at which the score reaches about 63. */
const LOAD_SCALE = 90;
const FREE_STEPS = 3000;
const LOAD_PER_1000_STEPS = 1.5;
/** Training balance needs at least this much stored history to mean anything. */
export const MIN_BALANCE_DAYS = 14;

export function dailyLoad(d: Pick<DailyMetricSummary, "activeZoneMinutes" | "steps">): number {
  const steps = Math.max(0, (d.steps ?? 0) - FREE_STEPS) / 1000;
  return Number(((d.activeZoneMinutes ?? 0) + steps * LOAD_PER_1000_STEPS).toFixed(1));
}

export const effortScore = (load: number): number => Math.max(0, Math.min(100, Math.round(100 * (1 - Math.exp(-load / LOAD_SCALE)))));

/** Load needed to reach a score; inverse of effortScore. */
export const loadForScore = (score: number): number => Math.round(-LOAD_SCALE * Math.log(1 - Math.min(score, 99) / 100));

export type EffortZone = "push" | "steady" | "recover" | "rest";

/** Target effort range for the day type the coach picked. */
export const EFFORT_TARGETS: Record<EffortZone, [number, number]> = {
  push: [60, 85],
  steady: [40, 65],
  recover: [15, 35],
  rest: [0, 20],
};

export interface EffortToday {
  score: number;
  load: number;
  target: [number, number];
  status: "below" | "in_range" | "above";
  /** Plain advice on what's left to do, e.g. "About 25 more active zone minutes reaches your target." */
  advice: string;
}

export function effortToday(today: DailyMetricSummary, zone: EffortZone, workoutDone = false): EffortToday {
  const load = dailyLoad(today);
  const score = effortScore(load);
  const target = EFFORT_TARGETS[zone];
  const status = score < target[0] ? "below" : score > target[1] ? "above" : "in_range";
  const minutesToGo = Math.max(0, Math.ceil(loadForScore(target[0]) - load));
  const advice =
    status === "below"
      ? zone === "rest"
        ? "Rest day: no target to hit."
        : workoutDone
          ? `Today's workout is in. A brisk walk later (about ${minutesToGo} more active minutes) would top you up to the target, but it's optional.`
          : `About ${minutesToGo} more active zone minutes reaches today's target.`
      : status === "in_range"
        ? "You're in today's target range. Anything more is optional."
        : zone === "recover" || zone === "rest"
          ? "You've gone past today's easy target. Keep the rest of the day light."
          : "Above target: a big day. Prioritise food and sleep tonight.";
  return { score, load, target, status, advice };
}

export type BalanceState = "easing" | "maintaining" | "building" | "overreaching";

export interface TrainingBalance {
  /** Mean daily load over the last 7 completed days */
  acute: number;
  /** Mean daily load over the baseline window */
  chronic: number;
  ratio: number;
  state: BalanceState;
  label: string;
  detail: string;
}

const BALANCE_COPY: Record<BalanceState, { label: string; detail: string }> = {
  easing: { label: "Easing off", detail: "This week is lighter than your usual. Fine for a recovery week; a few lighter weeks in a row and fitness starts to slip." },
  maintaining: { label: "Maintaining", detail: "This week matches your usual load. Fitness holds steady." },
  building: { label: "Building", detail: "A bit more than your usual: the range where fitness grows without much extra injury risk." },
  overreaching: { label: "Overreaching", detail: "Well above your usual load. Fine for a few days, but plan an easier stretch soon. Sharp jumps like this are when injuries tend to happen." },
};

/**
 * This week's load against the longer-term norm (acute:chronic ratio).
 * Null until enough stored history exists for the comparison to mean something.
 */
export function trainingBalance(history: DailyMetricSummary[], todayIso: string, baseline: PersonalBaseline): TrainingBalance | null {
  if (baseline.source !== "stored" || baseline.days < MIN_BALANCE_DAYS || !baseline.effortLoad) return null;
  const week = history.filter((d) => d.date < todayIso).slice(-7);
  if (week.length < 4) return null;
  const acute = week.reduce((sum, d) => sum + dailyLoad(d), 0) / week.length;
  const ratio = Number((acute / baseline.effortLoad).toFixed(2));
  const state: BalanceState = ratio < 0.8 ? "easing" : ratio <= 1.1 ? "maintaining" : ratio <= 1.3 ? "building" : "overreaching";
  return { acute: Number(acute.toFixed(1)), chronic: baseline.effortLoad, ratio, state, ...BALANCE_COPY[state] };
}
