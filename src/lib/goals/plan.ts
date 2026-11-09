import { shiftIso } from "../utils";
import type { DistanceUnit, PaceRange, Phase, PlanInput, PlanSession, PlanWeek, RaceDistance, SessionType, TrainingPlan } from "./types";
import { RACE_KM, RACE_LABEL, daysBetween, formatDistance, formatPace, formatTime, mondayOf, roundToHalfUnit } from "./units";

/** A plan request that cannot be built (bad dates); the message is safe to show the user. */
export class PlanError extends Error {}

interface DistanceConfig {
  /** Typical peak weekly volume for a recreational runner, km */
  peakWeeklyKm: number;
  peakLongKm: number;
  minWeeks: number;
  taperWeeks: number;
}

const CONFIG: Record<RaceDistance, DistanceConfig> = {
  "5k": { peakWeeklyKm: 32, peakLongKm: 11, minWeeks: 4, taperWeeks: 0 },
  "10k": { peakWeeklyKm: 40, peakLongKm: 15, minWeeks: 6, taperWeeks: 1 },
  half: { peakWeeklyKm: 48, peakLongKm: 19.5, minWeeks: 8, taperWeeks: 1 },
  marathon: { peakWeeklyKm: 64, peakLongKm: 32.2, minWeeks: 12, taperWeeks: 2 },
};

const MAX_WEEKS = 52;
/** Weekly volume may grow at most this much between hard weeks. */
const MAX_GROWTH = 1.1;
const DOWN_WEEK_FACTOR = 0.78;
/** ...but small volumes may always add this much, or a beginner's plan would crawl. */
const MIN_STEP_KM = 2.5;
/** The long run is at most this share of the week. */
const MAX_LONG_SHARE = 0.5;

export type { PlanInput };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Training paces as offsets from marathon-equivalent pace, so one table works for every race distance. */
function paceTable(goalTimeSec: number | null, raceKm: number): PaceRange[] {
  const rows: [string, number, number, string][] = [
    ["Easy", 40, 75, "Conversational: full sentences"],
    ["Recovery", 75, 100, "Deliberately slow; walk breaks are fine"],
    ["Long run", 25, 60, "Relaxed and steady; goal-pace segments only where noted"],
    ["Tempo", -25, -15, "Comfortably hard: a few words at a time"],
    ["Intervals", -45, -30, "Hard but even across every rep"],
  ];
  if (!goalTimeSec) return [...rows.map(([label, , , feel]) => ({ label, fastSecPerKm: null, slowSecPerKm: null, feel })), { label: "Goal race pace", fastSecPerKm: null, slowSecPerKm: null, feel: "Set a goal time to get paces" }];
  const marathonPace = (goalTimeSec * Math.pow(42.195 / raceKm, 1.06)) / 42.195;
  const racePace = goalTimeSec / raceKm;
  return [
    { label: "Goal race pace", fastSecPerKm: racePace, slowSecPerKm: racePace + 5, feel: "Your race rhythm: controlled and steady" },
    ...rows.map(([label, fast, slow, feel]) => ({ label, fastSecPerKm: marathonPace + fast, slowSecPerKm: marathonPace + slow, feel })),
  ];
}

interface WeekSkeleton {
  phase: Phase;
  isDownWeek: boolean;
  weeklyKm: number;
  longKm: number;
}

/** Weekly volume and long run for every week: build with down weeks, then taper, then race week. */
function skeleton(totalWeeks: number, cfg: DistanceConfig, startWeekly: number, targetPeak: number, startLong: number, elapsed: number): WeekSkeleton[] {
  const taper = Math.min(cfg.taperWeeks, Math.max(0, totalWeeks - 3));
  const buildWeeks = Math.max(0, totalWeeks - taper - 1);
  const allBuild = elapsed + buildWeeks;
  // Every 4th week recovers, but never the last build week (that is the peak).
  const isDown = (i: number) => allBuild >= 6 && (i + elapsed) % 4 === 3 && i > 0 && i < buildWeeks - 1;
  const hardWeeks = Array.from({ length: buildWeeks }, (_, i) => i).filter((i) => !isDown(i)).length;

  // Hard weeks climb in even steps from the start to the peak, never faster than the growth cap.
  const hardVolumes: number[] = [];
  for (let k = 0; k < hardWeeks; k++) {
    const target = hardWeeks <= 1 ? startWeekly : startWeekly + ((targetPeak - startWeekly) * k) / (hardWeeks - 1);
    const prev = hardVolumes[k - 1];
    hardVolumes.push(prev === undefined ? startWeekly : Math.min(target, Math.max(prev * MAX_GROWTH, prev + MIN_STEP_KM)));
  }
  const peakWeekly = hardVolumes[hardVolumes.length - 1] ?? startWeekly;
  const peakLong = Math.min(cfg.peakLongKm, Math.max(startLong, peakWeekly * MAX_LONG_SHARE));

  const weeks: WeekSkeleton[] = [];
  let hard = 0;
  let last = { weeklyKm: startWeekly, longKm: startLong };
  for (let i = 0; i < buildWeeks; i++) {
    const share = allBuild <= 1 ? 1 : (i + elapsed) / (allBuild - 1);
    const phase: Phase = share < 0.4 ? "Base" : share < 0.75 ? "Build" : "Peak";
    if (isDown(i)) {
      weeks.push({ phase, isDownWeek: true, weeklyKm: last.weeklyKm * DOWN_WEEK_FACTOR, longKm: last.longKm * 0.75 });
      continue;
    }
    const weeklyKm = hardVolumes[hard];
    // The long run reaches its peak one hard week before the last, so the peak is run twice.
    const longShare = hardWeeks <= 2 ? 1 : Math.min(1, hard / (hardWeeks - 2));
    const longKm = Math.min(startLong + (peakLong - startLong) * longShare, weeklyKm * MAX_LONG_SHARE);
    last = { weeklyKm, longKm };
    weeks.push({ phase, isDownWeek: false, weeklyKm, longKm });
    hard++;
  }
  const taperShape = taper === 2 ? [[0.72, 0.62], [0.55, 0.45]] : taper === 1 ? [[0.62, 0.5]] : [];
  for (const [v, l] of taperShape) weeks.push({ phase: "Taper", isDownWeek: false, weeklyKm: peakWeekly * v, longKm: peakLong * l });
  weeks.push({ phase: "Race", isDownWeek: false, weeklyKm: 0, longKm: 0 });
  return weeks;
}

const SHARES: Record<number, number> = { 1: 0.3, 2: 0.22, 3: 0.3, 4: 0.18, 6: 0.2 };
const RUN_DAYS: Record<number, number[]> = { 3: [1, 3], 4: [1, 3, 6], 5: [1, 2, 3, 6], 6: [1, 2, 3, 4, 6] };
const SATURDAY = 5;
const SUNDAY = 6;

interface SessionContext {
  input: PlanInput;
  weekIndex: number;
  phaseIndex: number;
  paces: PaceRange[];
}

function paceHint(paces: PaceRange[], label: string, unit: DistanceUnit): string {
  const p = paces.find((x) => x.label === label);
  return p?.fastSecPerKm && p.slowSecPerKm ? ` (${formatPace(p.fastSecPerKm, unit)} to ${formatPace(p.slowSecPerKm, unit)})` : "";
}

function qualitySession(slot: 1 | 3, w: WeekSkeleton, ctx: SessionContext, km: number): { type: SessionType; title: string; details: string } {
  const { unit, distance } = ctx.input;
  const easy = { type: "easy" as const, title: "Easy run", details: `Conversational effort${paceHint(ctx.paces, "Easy", unit)}.` };
  if (w.isDownWeek) return { ...easy, details: `${easy.details} Down week: keep everything relaxed.` };
  const reps = 4 + Math.min(4, ctx.phaseIndex);
  switch (w.phase) {
    case "Base":
      if (slot === 1 && ctx.weekIndex >= 2) return { ...easy, details: `${easy.details} Finish with 4 to 6 x 20 s strides.` };
      if (slot === 3 && ctx.weekIndex >= 4) return { type: "hills", title: "Easy + hill sprints", details: `Easy run with 6 to 8 x 10 s hill sprints, full recovery between.` };
      return easy;
    case "Build":
      if (slot === 1)
        return ctx.weekIndex % 2 === 0
          ? { type: "intervals", title: "Intervals", details: `Warm up, then ${reps} x 800 m hard${paceHint(ctx.paces, "Intervals", unit)} with 400 m jog. Cool down.` }
          : { type: "hills", title: "Hill repeats", details: `Warm up, then ${reps + 2} x 60 s uphill at a strong effort, jog down. Cool down.` };
      return { type: "tempo", title: "Tempo run", details: `${formatDistance(roundToHalfUnit(km * 0.45, unit), unit)} at tempo${paceHint(ctx.paces, "Tempo", unit)} in the middle of the run.` };
    case "Peak":
      if (slot === 1) return { type: "intervals", title: "Intervals", details: `Warm up, then ${Math.max(3, reps - 2)} x 1 ${unit === "mi" ? "mi" : "km"} at intervals pace${paceHint(ctx.paces, "Intervals", unit)}, 2 to 3 min jog. Cool down.` };
      return distance === "marathon" || distance === "half"
        ? { type: "race_pace", title: "Goal pace run", details: `${formatDistance(roundToHalfUnit(km * 0.6, unit), unit)} at goal race pace${paceHint(ctx.paces, "Goal race pace", unit)}.` }
        : { type: "tempo", title: "Tempo run", details: `${formatDistance(roundToHalfUnit(km * 0.5, unit), unit)} at tempo${paceHint(ctx.paces, "Tempo", unit)}.` };
    case "Taper":
      if (slot === 1) return { ...easy, details: `${easy.details} Add 6 x 20 s strides.` };
      return { type: "race_pace", title: "Sharpener", details: `${formatDistance(roundToHalfUnit(km * 0.4, unit), unit)} at goal race pace${paceHint(ctx.paces, "Goal race pace", unit)}. Volume drops, intensity stays.` };
    default:
      return easy;
  }
}

function longRunDetails(w: WeekSkeleton, ctx: SessionContext, km: number): string {
  const { unit, distance } = ctx.input;
  const base = `Steady and relaxed${paceHint(ctx.paces, "Long run", unit)}.`;
  if (w.isDownWeek || w.phase === "Base") return `${base} Practice drinking and fueling on anything over 90 minutes.`;
  if (w.phase === "Peak" && (distance === "marathon" || distance === "half") && ctx.weekIndex % 2 === 1)
    return `${base} Run the last ${formatDistance(roundToHalfUnit(Math.min(km * 0.3, 10), unit), unit)} at goal race pace. Rehearse race-day breakfast, kit and gels.`;
  if (w.phase === "Peak") return `${base} Use hilly routes where you can, and practice downhills.`;
  return `${base} Take a gel every 30 to 45 minutes to train your gut.`;
}

function strengthOrRest(dow: number, w: WeekSkeleton, hasRun: boolean): Omit<PlanSession, "date"> | null {
  if (hasRun) return null;
  if (dow === 0) {
    return w.phase === "Taper" || w.phase === "Race"
      ? { type: "rest", distanceKm: 0, title: "Mobility", details: "Light mobility and foam rolling only." }
      : { type: "strength", distanceKm: 0, title: "Strength", details: `Squats, deadlifts, lunges, calf raises and core, 30 to 40 min${w.isDownWeek ? ", lighter this week" : ""}.` };
  }
  return { type: "rest", distanceKm: 0, title: dow === 2 ? "Rest or cross-train" : "Rest", details: dow === 2 ? "Rest, or 30 min of easy cycling or swimming." : "Full rest. Sleep is training too." };
}

function raceWeekSessions(monday: string, ctx: SessionContext): PlanSession[] {
  const { raceDate, raceName, distance, unit, goalTimeSec } = ctx.input;
  const long = distance === "marathon" || distance === "half";
  const plan: Record<number, Omit<PlanSession, "date">> = {
    [-5]: { type: "easy", distanceKm: roundToHalfUnit(long ? 8 : 5, unit), title: "Easy run", details: "Easy, with 4 x 20 s strides." },
    [-3]: { type: "race_pace", distanceKm: roundToHalfUnit(long ? 6.5 : 5, unit), title: "Sharpener", details: `Easy with ${formatDistance(roundToHalfUnit(long ? 3 : 2, unit), unit)} at goal race pace.` },
    [-1]: { type: "shakeout", distanceKm: roundToHalfUnit(3, unit), title: "Shakeout", details: "Very easy 15 to 20 min, or rest. Lay out your kit tonight." },
    0: {
      type: "race",
      distanceKm: RACE_KM[distance],
      title: raceName,
      details: `Race day!${goalTimeSec ? ` Goal ${formatTime(goalTimeSec)}.` : ""} Start the first ${unit === "mi" ? "2 mi" : "3 km"} slower than goal pace and fuel early.`,
    },
  };
  return Array.from({ length: 7 }, (_, dow) => {
    const date = shiftIso(monday, dow);
    const offset = daysBetween(raceDate, date);
    const s = plan[offset] ?? (offset > 0 ? { type: "rest" as const, distanceKm: 0, title: "Recover", details: "Walk, eat, sleep. Celebrate." } : { type: "rest" as const, distanceKm: 0, title: "Rest", details: "Stay off your feet; hydrate." });
    return { date, ...s };
  });
}

function weekSessions(monday: string, w: WeekSkeleton, ctx: SessionContext): PlanSession[] {
  if (w.phase === "Race") return raceWeekSessions(monday, ctx);
  const { unit } = ctx.input;
  const runDays = clamp(Math.round(ctx.input.runDaysPerWeek ?? (w.weeklyKm < 25 ? 4 : 5)), 3, 6);
  // With a Sunday long run, the weekend's short run moves to Saturday as an easy leg-loosener.
  const longDay = ctx.input.longRunDay === "sunday" ? SUNDAY : SATURDAY;
  const shortDay = longDay === SUNDAY ? SATURDAY : SUNDAY;
  const others = RUN_DAYS[runDays].map((d) => (d === SUNDAY ? shortDay : d));
  const share = (d: number) => SHARES[d === shortDay ? SUNDAY : d];
  const longKm = roundToHalfUnit(w.longKm, unit);
  const rest = Math.max(0, w.weeklyKm - longKm);
  const totalShare = others.reduce((sum, d) => sum + share(d), 0);
  const minRun = unit === "mi" ? 3.2 : 3;

  return Array.from({ length: 7 }, (_, dow): PlanSession => {
    const date = shiftIso(monday, dow);
    if (dow === longDay) return { date, type: "long", distanceKm: longKm, title: "Long run", details: longRunDetails(w, ctx, longKm) };
    if (!others.includes(dow)) return { date, ...strengthOrRest(dow, w, false)! };
    const km = roundToHalfUnit(Math.max(minRun, (rest * share(dow)) / totalShare), unit);
    if (dow === shortDay)
      return longDay === SATURDAY
        ? { date, type: "recovery", distanceKm: km, title: "Recovery run", details: `Very easy${paceHint(ctx.paces, "Recovery", unit)}, the day after your long run.` }
        : { date, type: "easy", distanceKm: km, title: "Easy run", details: `Short and relaxed${paceHint(ctx.paces, "Easy", unit)}; save your legs for tomorrow's long run.` };
    if (dow === 1 || dow === 3) return { date, distanceKm: km, ...qualitySession(dow as 1 | 3, w, ctx, km) };
    return { date, type: "easy", distanceKm: km, title: "Easy run", details: `Conversational effort${paceHint(ctx.paces, "Easy", unit)}.` };
  });
}

const FOCUS: Record<Phase, string> = {
  Base: "Build the aerobic base: easy miles, strides and strength.",
  Build: "Add structure: one fast session and one tempo, long run grows.",
  Peak: "Biggest weeks: race-specific work and your longest runs.",
  Taper: "Cut volume, keep a little speed, sleep more.",
  Race: "Race week: stay fresh and trust the training.",
};

export function buildPlan(input: PlanInput): TrainingPlan {
  const cfg = CONFIG[input.distance];
  const raceKm = RACE_KM[input.distance];
  if (input.raceDate <= input.startDate) throw new PlanError("The race date must be after today.");
  const firstMonday = mondayOf(input.startDate);
  const totalWeeks = daysBetween(firstMonday, mondayOf(input.raceDate)) / 7 + 1;
  if (totalWeeks > MAX_WEEKS) throw new PlanError(`That race is ${totalWeeks} weeks away; plans cover up to ${MAX_WEEKS} weeks. Start one closer to race day.`);

  const elapsed = Math.max(0, input.elapsedWeeks ?? 0);
  const continuing = elapsed > 0;
  const warnings: string[] = [];
  if (!continuing && totalWeeks < cfg.minWeeks)
    warnings.push(`Only ${totalWeeks} weeks to race day; ${cfg.minWeeks}+ is recommended for a ${RACE_LABEL[input.distance]}. The plan is compressed, so keep easy runs easy.`);

  const current = input.currentWeeklyKm && input.currentWeeklyKm > 0 ? input.currentWeeklyKm : null;
  if (!current && !continuing) warnings.push("No recent running found, so the plan starts gently. Tell the coach your current weekly distance to adjust it.");
  const startWeekly = clamp(current ?? cfg.peakWeeklyKm * 0.35, 10, cfg.peakWeeklyKm * 1.2);
  // The user's own ceiling wins; otherwise the typical peak, a little higher for people already running more.
  const targetPeak = input.peakWeeklyKm && input.peakWeeklyKm > 0
    ? clamp(input.peakWeeklyKm, Math.min(startWeekly, cfg.peakWeeklyKm * 0.5), cfg.peakWeeklyKm * 1.6)
    : Math.max(cfg.peakWeeklyKm, Math.min(startWeekly * 1.15, cfg.peakWeeklyKm * 1.4));
  if (input.peakWeeklyKm && input.peakWeeklyKm < cfg.peakWeeklyKm * 0.6)
    warnings.push(`A ${formatDistance(input.peakWeeklyKm, input.unit, 0)} peak week is light for a ${RACE_LABEL[input.distance]}; expect to finish rather than race it.`);
  const startLong = clamp(input.longestRecentRunKm ?? startWeekly * 0.33, 4, Math.min(cfg.peakLongKm, Math.max(4, startWeekly * MAX_LONG_SHARE)));

  const paces = paceTable(input.goalTimeSec ?? null, raceKm);
  const shape = skeleton(totalWeeks, cfg, startWeekly, targetPeak, startLong, elapsed);
  const phaseCounters: Partial<Record<Phase, number>> = {};

  const weeks: PlanWeek[] = shape.map((w, i) => {
    const index = i + elapsed;
    const monday = shiftIso(firstMonday, i * 7);
    const phaseIndex = (phaseCounters[w.phase] = (phaseCounters[w.phase] ?? -1) + 1);
    const sessions = weekSessions(monday, w, { input, weekIndex: index, phaseIndex, paces }).map((s) =>
      s.date < input.startDate ? { date: s.date, type: "rest" as const, distanceKm: 0, title: "Before plan start", details: "Your plan starts later this week." } : s
    );
    const plannedKm = sessions.reduce((sum, s) => sum + s.distanceKm, 0);
    return {
      index,
      startDate: monday,
      phase: w.phase,
      isDownWeek: w.isDownWeek,
      plannedKm,
      longRunKm: Math.max(...sessions.map((s) => (s.type === "long" || s.type === "race" ? s.distanceKm : 0))),
      focus: w.isDownWeek ? "Down week: absorb the training, back off ~25%." : FOCUS[w.phase],
      sessions,
    };
  });

  return {
    raceName: input.raceName,
    raceDate: input.raceDate,
    distance: input.distance,
    raceDistanceKm: raceKm,
    goalTimeSec: input.goalTimeSec ?? null,
    goalTimeSource: input.goalTimeSec ? input.goalTimeSource ?? "user" : null,
    startingWeeklyKm: weeks[0]?.plannedKm ?? 0,
    peakWeeklyKm: Math.max(...weeks.map((w) => w.plannedKm)),
    peakLongRunKm: Math.max(...weeks.filter((w) => w.phase !== "Race").map((w) => w.longRunKm), 0),
    weeks,
    paces,
    warnings,
  };
}
