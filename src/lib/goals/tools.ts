import type { ToolContext, ToolResult } from "../llm/tools";
import type { ToolDefinition } from "../llm/types";
import { isValidIsoDate, shiftIso, todayIso } from "../utils";
import { PlanError, buildPlan } from "./plan";
import { activityView, programView } from "./progress";
import { defaultUnit, loadActivity, loadGoals } from "./service";
import { MAX_ACTIVE_GOALS, goalStore, newGoalId } from "./store";
import { replan, type PlanChanges } from "./replan";
import type { ActivityGoal, DistanceUnit, Goal, GoalMetric, GoalView, PlanInput, ProgramGoal, RaceDistance } from "./types";
import { METRIC_INFO, RACE_KM, RACE_LABEL, daysBetween, formatDistance, formatLongDate, formatMetric, formatPace, formatTime, fromUnit, parseTime, predictTime } from "./units";

const RACES: RaceDistance[] = ["5k", "10k", "half", "marathon"];
const METRICS: GoalMetric[] = ["steps", "distance", "walk_distance", "run_distance", "active_minutes", "workouts", "runs"];
const MAX_GOAL_DAYS = 366;
/** A plan may be backdated a little ("I actually started last Monday"), not rewritten into the past. */
const MAX_BACKDATE_DAYS = 60;
const MIN_RUNS_FOR_FITNESS = 3;

export const GOAL_TOOLS: ToolDefinition[] = [
  {
    name: "create_training_plan",
    description:
      "Create and save a week-by-week training program for a running event (5K, 10K, half marathon, marathon). The plan appears on the user's dashboard with daily workouts, progress and badges. You must know the race date: if the user did not give one and you are not certain of it, ask before calling. Pass a recent race result when the user mentions one so a realistic goal time can be predicted.",
    parameters: {
      type: "object",
      properties: {
        raceName: { type: "string", description: "Event name, e.g. 'San Francisco Marathon 2027'" },
        raceDate: { type: "string", description: "Race day as YYYY-MM-DD" },
        distance: { type: "string", description: "Race distance", enum: RACES },
        goalTime: { type: "string", description: "Goal finish time as h:mm:ss (e.g. '4:59:00'), only if the user stated one" },
        recentRaceDistance: { type: "string", description: "Distance of a recent race or time trial the user mentioned", enum: RACES },
        recentRaceTime: { type: "string", description: "Finish time of that recent race as h:mm:ss" },
        currentWeeklyDistance: { type: "number", description: "What the user currently runs per week, in 'unit'. Omit to infer it from their tracked runs" },
        longestRecentRun: { type: "number", description: "Their longest run in the last month, in 'unit'" },
        runDaysPerWeek: { type: "number", description: "Run days per week the user wants (3 to 6). Omit for the default" },
        longRunDay: { type: "string", description: "Day for the weekly long run (default saturday)", enum: ["saturday", "sunday"] },
        peakWeeklyDistance: { type: "number", description: "A ceiling for the biggest week, in 'unit', only if the user asks to cap or raise volume" },
        startDate: { type: "string", description: "First training day as YYYY-MM-DD, only if the user wants to start on a day other than today" },
        unit: { type: "string", description: "Distance unit the user speaks in", enum: ["mi", "km"] },
      },
      required: ["raceName", "raceDate", "distance"],
    },
  },
  {
    name: "update_training_plan",
    description:
      "Change an existing training program and save it: reset or move the start date, change the race date, distance or name, set or change the goal time, run days per week, long-run day, weekly volume ceiling, or re-level the plan after illness, injury or missed weeks (pass currentWeeklyDistance = what they can run now). Only pass the fields that change. Weeks already completed stay as they were; the plan is rebuilt from the current week. Passing startDate restarts the whole plan from that day.",
    parameters: {
      type: "object",
      properties: {
        goalId: { type: "string", description: "The program's id from get_goals_progress. May be omitted when the user has exactly one training program" },
        startDate: { type: "string", description: "New first training day, YYYY-MM-DD. Restarts the plan from that day ('reset my start date', 'start over from Monday')" },
        raceDate: { type: "string", description: "New race day, YYYY-MM-DD" },
        raceName: { type: "string", description: "New event name" },
        distance: { type: "string", description: "New race distance", enum: RACES },
        goalTime: { type: "string", description: "New goal finish time, h:mm:ss" },
        recentRaceDistance: { type: "string", description: "Distance of a new race or time-trial result to re-predict the goal time from", enum: RACES },
        recentRaceTime: { type: "string", description: "Finish time of that result, h:mm:ss" },
        currentWeeklyDistance: { type: "number", description: "What the user can run per week right now, in the plan's unit. Use to make the plan easier or harder from this week, or after a break" },
        longestRecentRun: { type: "number", description: "Their current longest run, in the plan's unit" },
        runDaysPerWeek: { type: "number", description: "New number of run days per week (3 to 6)" },
        longRunDay: { type: "string", description: "New long-run day", enum: ["saturday", "sunday"] },
        peakWeeklyDistance: { type: "number", description: "New ceiling for the biggest week, in the plan's unit" },
        unit: { type: "string", description: "Switch the plan's display unit", enum: ["mi", "km"] },
      },
      required: [],
    },
  },
  {
    name: "create_activity_goal",
    description:
      "Create and save a goal that adds up an activity over a date range, e.g. '300,000 steps in November', 'run 50 miles in December', 'walk 100 km this month', '12 workouts in January'. Progress is tracked automatically from the wearable and shown on the dashboard with badges. For a calendar month use its first and last day, even if the month has already started.",
    parameters: {
      type: "object",
      properties: {
        metric: {
          type: "string",
          description: "What to count: steps; distance (all movement the tracker counts: the right choice for 'walk N miles/km' goals, since most walking is not logged as a workout); walk_distance (only walks logged as workouts); run_distance (runs); active_minutes (active zone minutes); workouts (any workout sessions); runs (number of runs)",
          enum: METRICS,
        },
        target: { type: "number", description: "Total to reach over the whole range: steps, minutes, sessions, or distance in 'unit'" },
        startDate: { type: "string", description: "First day, YYYY-MM-DD" },
        endDate: { type: "string", description: "Last day, YYYY-MM-DD" },
        unit: { type: "string", description: "Distance unit for distance metrics", enum: ["mi", "km"] },
        title: { type: "string", description: "Short name, e.g. 'November 300k steps'. Omit to generate one" },
      },
      required: ["metric", "target", "startDate", "endDate"],
    },
  },
  {
    name: "update_activity_goal",
    description: "Change an existing activity goal and save it: a new target, new start or end date, new title or unit. Only pass the fields that change.",
    parameters: {
      type: "object",
      properties: {
        goalId: { type: "string", description: "The goal's id from get_goals_progress. May be omitted when the user has exactly one activity goal" },
        target: { type: "number", description: "New total to reach (distance in the goal's unit, or the new 'unit' if given)" },
        startDate: { type: "string", description: "New first day, YYYY-MM-DD" },
        endDate: { type: "string", description: "New last day, YYYY-MM-DD" },
        title: { type: "string", description: "New name" },
        unit: { type: "string", description: "New distance unit", enum: ["mi", "km"] },
      },
      required: [],
    },
  },
  {
    name: "get_goals_progress",
    description:
      "Get the user's active goals and training programs with live progress: today's planned workout, this week's planned vs completed distance, days to race day, pace vs target for activity goals, badges earned, and a suggested nudge. Use for 'how am I tracking', 'what's my workout today', 'my goals', 'my badges', 'my plan'.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "archive_goal",
    description: "Stop a goal or training program and remove it from the dashboard. Only when the user asks to stop, cancel, delete or end it. To change a goal, use the update tools instead.",
    parameters: { type: "object", properties: { goalId: { type: "string", description: "The goal's id from get_goals_progress. May be omitted when the user has exactly one goal" } }, required: [] },
  },
];

type Args = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/,/g, "")) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
};
const unitOf = (v: unknown, ctx: ToolContext): DistanceUnit => (v === "mi" || v === "km" ? v : defaultUnit(ctx.clientTz));
const failed = (name: string, label: string, args: Args, error: string): ToolResult => ({ data: { saved: false, error }, summary: { name, label, args, resultSummary: `Not saved: ${error}` } });

const longRunDayOf = (v: unknown) => (v === "saturday" || v === "sunday" ? v : undefined);
const runDaysOf = (v: unknown) => {
  const n = num(v);
  return n ? Math.min(6, Math.max(3, Math.round(n))) : undefined;
};

/** Finds the goal a tool call means: by id, else the only one of its kind. Otherwise the model gets the choices back. */
function pickGoal<K extends Goal["kind"]>(goals: Goal[], goalId: unknown, kind?: K): { goal: Extract<Goal, { kind: K }> } | { error: string } {
  const pool = goals.filter((g) => !kind || g.kind === kind) as Extract<Goal, { kind: K }>[];
  const what = kind === "program" ? "training program" : kind === "activity" ? "activity goal" : "goal";
  if (!pool.length) return { error: `The user has no active ${what}.` };
  const id = str(goalId);
  const byId = id ? pool.find((g) => g.id === id) ?? pool.find((g) => g.title.toLowerCase() === id.toLowerCase()) : undefined;
  if (byId) return { goal: byId };
  if (!id && pool.length === 1) return { goal: pool[0] };
  return { error: `Which ${what}? Pass one of these goalIds: ${pool.map((g) => `${g.id} ("${g.title}")`).join(", ")}. If it is unclear which one the user means, ask them.` };
}

/** Goal time from what the user said, else predicted from a recent race result. */
function resolveGoalTime(args: Args, raceKm: number) {
  const recentDistance = RACES.find((r) => r === args.recentRaceDistance);
  const recentSec = recentDistance ? parseTime(args.recentRaceTime, RACE_KM[recentDistance]) : null;
  const predictedSec = recentDistance && recentSec ? predictTime(recentSec, RACE_KM[recentDistance], raceKm) : null;
  const statedGoal = parseTime(args.goalTime, raceKm);
  return {
    statedGoal,
    predictedSec,
    recentDistance,
    goalTimeSec: statedGoal ?? (predictedSec ? Math.round(predictedSec / 60) * 60 : null),
    goalTimeSource: statedGoal ? ("user" as const) : predictedSec ? ("predicted" as const) : null,
  };
}

const ambitiousWarning = (statedGoal: number | null, predictedSec: number | null) =>
  statedGoal && predictedSec && statedGoal < predictedSec * 0.93
    ? `A ${formatTime(statedGoal)} goal is ambitious: the recent race predicts about ${formatTime(predictedSec)} today. Re-test mid-plan and adjust.`
    : null;

/** Plan facts the model reports after creating or changing a program. */
function planSummary(goal: ProgramGoal, view: ReturnType<typeof programView>) {
  const { plan, unit } = goal;
  const d = (km: number) => formatDistance(km, unit);
  const upcoming = plan.weeks.filter((w) => w.phase !== "Race");
  const peakWeek = upcoming.reduce((a, w) => (w.plannedKm > a.plannedKm ? w : a), upcoming[0] ?? plan.weeks[0]);
  return {
    ...describe(view),
    weeks: plan.weeks.length,
    startDate: formatLongDate(goal.startDate),
    phases: [...new Set(plan.weeks.map((w) => w.phase))].map((phase) => `${phase}: ${plan.weeks.filter((w) => w.phase === phase).length} wk`),
    startingWeek: d(plan.startingWeeklyKm),
    peakWeek: `${d(peakWeek.plannedKm)} (week ${peakWeek.index + 1}, long run ${d(plan.peakLongRunKm)})`,
    runDaysPerWeek: (view.currentWeek?.sessions ?? plan.weeks.find((w) => w.phase !== "Race")?.sessions ?? []).filter((s) => s.distanceKm > 0).length || null,
    longRunDay: goal.input.longRunDay ?? "saturday",
    paces: plan.paces.filter((p) => p.fastSecPerKm).map((p) => `${p.label}: ${formatPace(p.fastSecPerKm!, unit)} to ${formatPace(p.slowSecPerKm!, unit)}`),
    warnings: plan.warnings,
  };
}

/** What the model needs to describe a goal; the dashboard renders the full detail itself. */
function describe(view: GoalView) {
  if (view.kind === "activity") {
    const { goal } = view;
    const f = (v: number) => formatMetric(v, goal.metric, goal.unit);
    return {
      goalId: goal.id,
      type: "activity goal",
      title: goal.title,
      counts: METRIC_INFO[goal.metric].label,
      period: `${formatLongDate(goal.startDate)} to ${formatLongDate(goal.endDate)}`,
      target: f(goal.target),
      current: f(view.current),
      percent: view.percent,
      paceCheck: view.nudge.headline,
      daysLeft: view.daysLeft,
      neededPerDay: view.perDayNeeded > 0 ? f(view.perDayNeeded) : null,
      completedOn: view.completedOn,
      badgesEarned: view.badges.filter((b) => b.earned).map((b) => b.name),
      nextBadge: view.badges.find((b) => !b.earned)?.name ?? null,
      nudge: `${view.nudge.headline}. ${view.nudge.detail}`,
    };
  }
  const { goal, plan, currentWeek, todaySession, nextSession, totals } = view;
  const d = (km: number) => formatDistance(km, goal.unit);
  // `distance` is what the session asks for now (after this week's re-balancing); `note` says what changed and why.
  const session = (s: typeof todaySession) =>
    s
      ? {
          date: formatLongDate(s.date),
          workout: s.title,
          distance: (s.adjustedKm ?? s.distanceKm) > 0 ? d(s.adjustedKm ?? s.distanceKm) : null,
          originallyPlanned: s.adjustedKm !== null ? d(s.distanceKm) : undefined,
          how: s.details,
          status: s.status,
          ranThatDay: s.ranKm > 0 ? d(s.ranKm) : undefined,
          note: s.note ?? undefined,
          otherActivity: s.crossTraining ?? undefined,
        }
      : null;
  return {
    goalId: goal.id,
    type: "training program",
    title: goal.title,
    race: `${plan.raceName}, ${formatLongDate(plan.raceDate)} (${RACE_LABEL[plan.distance]})`,
    daysToRace: view.daysToRace,
    goalTime: plan.goalTimeSec ? formatTime(plan.goalTimeSec) : null,
    week: currentWeek ? `Week ${currentWeek.week.index + 1} of ${view.weeks.length} (${currentWeek.week.phase}${currentWeek.week.isDownWeek ? ", down week" : ""})` : `${view.weeks.length} weeks, starts ${formatLongDate(goal.startDate)}`,
    weekFocus: currentWeek?.week.focus ?? null,
    thisWeek: currentWeek ? { planned: d(currentWeek.week.plannedKm), completed: d(currentWeek.week.actualKm), sessions: currentWeek.sessions.map(session) } : null,
    today: session(todaySession),
    nextRun: session(nextSession),
    planSoFar: {
      completed: d(totals.actualKm),
      plannedToDate: d(totals.plannedToDateKm),
      wholePlan: d(totals.plannedKm),
      longestRun: d(totals.longestRunKm),
      weeksCompleted: totals.weeksCompleted,
      weekStreak: totals.weekStreak,
      adherencePercent: totals.adherence === null ? null : Math.round(totals.adherence * 100),
    },
    recentAutomaticAdjustment: view.adaptation?.message ?? null,
    badgesEarned: view.badges.filter((b) => b.earned).map((b) => b.name),
    nextBadge: view.badges.find((b) => !b.earned)?.name ?? null,
    nudge: `${view.nudge.headline}. ${view.nudge.detail}`,
  };
}

export const goalHandlers: Record<string, (args: Args, ctx: ToolContext) => Promise<ToolResult>> = {
  async create_training_plan(args, ctx) {
    const name = "create_training_plan";
    const label = "Built Training Program";
    const fail = (error: string) => failed(name, label, args, error);
    const distance = RACES.find((r) => r === args.distance);
    const raceDate = args.raceDate;
    if (!distance) return fail("distance must be one of 5k, 10k, half, marathon.");
    if (!isValidIsoDate(raceDate)) return fail("raceDate must be YYYY-MM-DD. Ask the user for the race date.");
    const unit = unitOf(args.unit, ctx);
    const raceKm = RACE_KM[distance];
    const raceName = (str(args.raceName) ?? `My ${RACE_LABEL[distance]}`).slice(0, 80);

    const store = goalStore(ctx.state, ctx.clientTz, ctx.guestId);
    const existing = await store.list();
    const data = await loadActivity(ctx, shiftIso(ctx.clientDate ?? todayIso(ctx.clientTz), -35));
    const { today } = data;

    // Current fitness: what the user said, else their tracked runs over the last four weeks.
    const cutoff = shiftIso(today, -28);
    const recentRuns = data.workouts.filter((w) => w.kind === "run" && w.date >= cutoff);
    const statedWeekly = num(args.currentWeeklyDistance);
    // One or two runs in a month say little about weekly volume; better to start gently than to guess from them.
    const trackedWeekly = recentRuns.length >= MIN_RUNS_FOR_FITNESS ? recentRuns.reduce((sum, w) => sum + w.distanceKm, 0) / 4 : 0;
    const statedLong = num(args.longestRecentRun);
    const trackedLong = trackedWeekly ? Math.max(0, ...recentRuns.map((w) => w.distanceKm)) : 0;

    const { statedGoal, predictedSec, recentDistance, goalTimeSec, goalTimeSource } = resolveGoalTime(args, raceKm);
    const startDate = isValidIsoDate(args.startDate) ? args.startDate : today;
    if (startDate < shiftIso(today, -MAX_BACKDATE_DAYS)) return fail(`startDate can be at most ${MAX_BACKDATE_DAYS} days in the past.`);
    const peak = num(args.peakWeeklyDistance);
    const input: PlanInput = {
      raceName,
      raceDate,
      distance,
      startDate,
      unit,
      currentWeeklyKm: statedWeekly ? fromUnit(statedWeekly, unit) : trackedWeekly || null,
      longestRecentRunKm: statedLong ? fromUnit(statedLong, unit) : trackedLong || null,
      goalTimeSec,
      goalTimeSource,
      runDaysPerWeek: runDaysOf(args.runDaysPerWeek) ?? null,
      longRunDay: longRunDayOf(args.longRunDay) ?? null,
      peakWeeklyKm: peak ? fromUnit(peak, unit) : null,
    };

    let plan;
    try {
      plan = buildPlan(input);
    } catch (err) {
      if (err instanceof PlanError) return fail(err.message);
      throw err;
    }
    const ambitious = ambitiousWarning(statedGoal, predictedSec);
    if (ambitious) plan.warnings.push(ambitious);

    // A new plan for the same race replaces the old one rather than stacking a duplicate.
    const replaced = existing.filter((g): g is ProgramGoal => g.kind === "program" && g.plan.raceDate === raceDate && g.plan.distance === distance);
    if (existing.length - replaced.length >= MAX_ACTIVE_GOALS) return fail(`You already have ${MAX_ACTIVE_GOALS} active goals. Archive one first.`);
    for (const old of replaced) await store.archive(old.id);

    const goal: ProgramGoal = { id: newGoalId(), kind: "program", title: raceName, unit, startDate, endDate: raceDate, status: "active", createdAt: new Date().toISOString(), input, plan };
    await store.create(goal);

    const view = programView(goal, data);
    const d = (km: number) => formatDistance(km, unit);
    return {
      data: {
        saved: true,
        savedTo: store.persistent ? "the user's account" : "this demo session only (connect a Google account with a database to keep it)",
        shownOn: "The dashboard's Goals panel now shows this plan with daily workouts, weekly progress and badges. Training starts " + (startDate === today ? "today" : formatLongDate(startDate)) + ".",
        replacedExistingPlan: replaced.length > 0,
        ...planSummary(goal, view),
        currentFitnessUsed: statedWeekly ? "the weekly distance the user gave" : trackedWeekly ? `tracked runs: about ${d(trackedWeekly)} a week` : "none found, so the plan starts gently",
        goalTimeBasis: statedGoal ? "stated by the user" : predictedSec ? `predicted from their recent ${RACE_LABEL[recentDistance!]} (Riegel formula); present it as a realistic starting target` : "no goal time set; offer to add one",
        predictedFromRecentRace: predictedSec ? formatTime(predictedSec) : null,
        firstWeek: (view.currentWeek?.sessions ?? plan.weeks[0].sessions).filter((s) => s.title !== "Before plan start").map((s) => `${formatLongDate(s.date)}: ${s.title}${s.distanceKm ? ` ${d(s.distanceKm)}` : ""}`),
        canChangeLater: "Anything can be changed later by asking: goal time, run days, long-run day, start date, race date, or making it easier or harder.",
      },
      summary: { name, label, args, resultSummary: `${raceName}: ${plan.weeks.length} weeks, peak ${d(plan.peakWeeklyKm)}/wk${goalTimeSec ? `, goal ${formatTime(goalTimeSec)}` : ""}` },
    };
  },

  async update_training_plan(args, ctx) {
    const name = "update_training_plan";
    const label = "Updated Training Program";
    const fail = (error: string) => failed(name, label, args, error);
    const store = goalStore(ctx.state, ctx.clientTz, ctx.guestId);
    const picked = pickGoal(await store.list(), args.goalId, "program");
    if ("error" in picked) return fail(picked.error);
    const old = picked.goal;
    const today = ctx.clientDate ?? todayIso(ctx.clientTz);

    const changes: PlanChanges = {};
    const changed: string[] = [];
    const unit = args.unit === "mi" || args.unit === "km" ? args.unit : old.unit;
    if (unit !== old.unit) {
      changes.unit = unit;
      changed.push(`unit → ${unit}`);
    }
    for (const key of ["startDate", "raceDate"] as const) {
      if (args[key] === undefined || args[key] === null || args[key] === "") continue;
      const value = args[key];
      if (!isValidIsoDate(value)) return fail(`${key} must be YYYY-MM-DD.`);
      if (value !== old.input[key]) {
        changes[key] = value;
        changed.push(`${key === "startDate" ? "start date" : "race date"} → ${formatLongDate(value)}`);
      }
    }
    if (changes.startDate && changes.startDate < shiftIso(today, -MAX_BACKDATE_DAYS)) return fail(`startDate can be at most ${MAX_BACKDATE_DAYS} days in the past.`);
    const distance = RACES.find((r) => r === args.distance);
    if (distance && distance !== old.input.distance) {
      changes.distance = distance;
      changed.push(`distance → ${RACE_LABEL[distance]}`);
    }
    const raceName = str(args.raceName)?.slice(0, 80);
    if (raceName && raceName !== old.input.raceName) {
      changes.raceName = raceName;
      changed.push(`name → ${raceName}`);
    }

    const raceKm = RACE_KM[changes.distance ?? old.input.distance];
    const time = resolveGoalTime(args, raceKm);
    if (time.goalTimeSec) {
      changes.goalTimeSec = time.goalTimeSec;
      changes.goalTimeSource = time.goalTimeSource;
      changed.push(`goal time → ${formatTime(time.goalTimeSec)}${time.statedGoal ? "" : " (predicted from the new result)"}`);
    } else if (changes.distance && old.input.goalTimeSec) {
      // A goal time for the old distance means nothing for the new one; carry the same fitness across.
      changes.goalTimeSec = Math.round(predictTime(old.input.goalTimeSec, RACE_KM[old.input.distance], raceKm) / 60) * 60;
      changes.goalTimeSource = "predicted";
      changed.push(`goal time → ${formatTime(changes.goalTimeSec)} (converted to the new distance)`);
    }
    const weekly = num(args.currentWeeklyDistance);
    if (weekly) {
      changes.currentWeeklyKm = fromUnit(weekly, unit);
      changed.push(`current weekly distance → ${weekly} ${unit}`);
    }
    const long = num(args.longestRecentRun);
    if (long) {
      changes.longestRecentRunKm = fromUnit(long, unit);
      changed.push(`longest run → ${long} ${unit}`);
    }
    const runDays = runDaysOf(args.runDaysPerWeek);
    if (runDays) {
      changes.runDaysPerWeek = runDays;
      changed.push(`run days → ${runDays} a week`);
    }
    const longRunDay = longRunDayOf(args.longRunDay);
    if (longRunDay) {
      changes.longRunDay = longRunDay;
      changed.push(`long run → ${longRunDay}`);
    }
    const peak = num(args.peakWeeklyDistance);
    if (peak) {
      changes.peakWeeklyKm = fromUnit(peak, unit);
      changed.push(`peak week ceiling → ${peak} ${unit}`);
    }
    if (!changed.length) return fail("Nothing to change: pass at least one field that differs from the current plan.");

    let goal: ProgramGoal;
    try {
      goal = replan(old, changes, today);
    } catch (err) {
      if (err instanceof PlanError) return fail(err.message);
      throw err;
    }
    const ambitious = ambitiousWarning(time.statedGoal, time.predictedSec);
    if (ambitious) goal.plan.warnings.push(ambitious);
    await store.update(goal);

    const view = programView(goal, await loadActivity(ctx, goal.startDate));
    const restarted = changes.startDate !== undefined;
    return {
      data: {
        saved: true,
        changed,
        effect: restarted
          ? `The whole plan was rebuilt to start ${formatLongDate(goal.startDate)}.`
          : today < old.startDate
            ? "The plan had not started yet, so all of it was rebuilt."
            : "Completed weeks were kept as they were; the plan was rebuilt from this week onward.",
        ...planSummary(goal, view),
      },
      summary: { name, label, args, resultSummary: `${goal.title}: ${changed.join("; ")}` },
    };
  },

  async create_activity_goal(args, ctx) {
    const name = "create_activity_goal";
    const label = "Created Activity Goal";
    const fail = (error: string) => failed(name, label, args, error);
    const metric = METRICS.find((m) => m === args.metric);
    const rawTarget = num(args.target);
    const { startDate, endDate } = args;
    if (!metric) return fail(`metric must be one of ${METRICS.join(", ")}.`);
    if (!rawTarget) return fail("target must be a positive number.");
    if (!isValidIsoDate(startDate) || !isValidIsoDate(endDate)) return fail("startDate and endDate must be YYYY-MM-DD.");
    const today = ctx.clientDate ?? todayIso(ctx.clientTz);
    if (endDate < startDate) return fail("endDate is before startDate.");
    if (endDate < today) return fail(`That range has already ended (today is ${today}). Use the current or a future period.`);
    if (daysBetween(startDate, endDate) + 1 > MAX_GOAL_DAYS) return fail("Goals can span at most one year.");

    const info = METRIC_INFO[metric];
    const unit = unitOf(args.unit, ctx);
    const target = info.isDistance ? fromUnit(rawTarget, unit) : Math.round(rawTarget);
    const store = goalStore(ctx.state, ctx.clientTz, ctx.guestId);
    if ((await store.list()).length >= MAX_ACTIVE_GOALS) return fail(`You already have ${MAX_ACTIVE_GOALS} active goals. Archive one first.`);

    const title = (str(args.title) ?? `${info.verb} ${formatMetric(target, metric, unit)}`).slice(0, 80);
    const goal: ActivityGoal = { id: newGoalId(), kind: "activity", title, unit, metric, target, startDate, endDate, status: "active", createdAt: new Date().toISOString() };
    await store.create(goal);
    const view = activityView(goal, await loadActivity(ctx, startDate));
    return {
      data: {
        saved: true,
        savedTo: store.persistent ? "the user's account" : "this demo session only (connect a Google account with a database to keep it)",
        shownOn: "The dashboard's Goals panel now tracks this goal automatically from the wearable.",
        ...describe(view),
        dailyAverageNeededOverall: formatMetric(target / (daysBetween(startDate, endDate) + 1), metric, unit),
      },
      summary: { name, label, args, resultSummary: `${title}: ${formatMetric(target, metric, unit)} by ${formatLongDate(endDate)} (${view.percent}% so far)` },
    };
  },

  async get_goals_progress(args, ctx) {
    const { goals, today, suggestions } = await loadGoals(ctx);
    return {
      data: goals.length
        ? { today, goals: goals.map(describe) }
        : { today, goals: [], note: "No goals yet. Offer to create one, for example:", ideas: suggestions.map((s) => s.prompt) },
      summary: {
        name: "get_goals_progress",
        label: "Checked Goals & Training Progress",
        args,
        resultSummary: goals.length ? goals.map((g) => (g.kind === "program" ? `${g.goal.title}: ${g.daysToRace} days out` : `${g.goal.title}: ${g.percent}%`)).join("; ") : "No active goals",
      },
    };
  },

  async update_activity_goal(args, ctx) {
    const name = "update_activity_goal";
    const label = "Updated Activity Goal";
    const fail = (error: string) => failed(name, label, args, error);
    const store = goalStore(ctx.state, ctx.clientTz, ctx.guestId);
    const picked = pickGoal(await store.list(), args.goalId, "activity");
    if ("error" in picked) return fail(picked.error);
    const old = picked.goal;
    const info = METRIC_INFO[old.metric];
    const goal: ActivityGoal = { ...old };
    const changed: string[] = [];

    if (info.isDistance && (args.unit === "mi" || args.unit === "km") && args.unit !== old.unit) {
      goal.unit = args.unit;
      changed.push(`unit → ${args.unit}`);
    }
    const target = num(args.target);
    if (target) {
      goal.target = info.isDistance ? fromUnit(target, goal.unit) : Math.round(target);
      changed.push(`target → ${formatMetric(goal.target, goal.metric, goal.unit)}`);
    }
    for (const key of ["startDate", "endDate"] as const) {
      const value = args[key];
      if (value === undefined || value === null || value === "") continue;
      if (!isValidIsoDate(value)) return fail(`${key} must be YYYY-MM-DD.`);
      if (value !== old[key]) {
        goal[key] = value;
        changed.push(`${key === "startDate" ? "start" : "end"} → ${formatLongDate(value)}`);
      }
    }
    if (goal.endDate < goal.startDate) return fail("endDate is before startDate.");
    if (daysBetween(goal.startDate, goal.endDate) + 1 > MAX_GOAL_DAYS) return fail("Goals can span at most one year.");
    const title = str(args.title)?.slice(0, 80);
    if (title && title !== old.title) {
      goal.title = title;
      changed.push(`name → ${title}`);
    }
    // A generated title quotes the old target; keep it truthful.
    else if (target && old.title === `${info.verb} ${formatMetric(old.target, old.metric, old.unit)}`) goal.title = `${info.verb} ${formatMetric(goal.target, goal.metric, goal.unit)}`;
    if (!changed.length) return fail("Nothing to change: pass at least one field that differs from the current goal.");

    await store.update(goal);
    const view = activityView(goal, await loadActivity(ctx, goal.startDate));
    return { data: { saved: true, changed, ...describe(view) }, summary: { name, label, args, resultSummary: `${goal.title}: ${changed.join("; ")}` } };
  },

  async archive_goal(args, ctx) {
    const store = goalStore(ctx.state, ctx.clientTz, ctx.guestId);
    const picked = pickGoal(await store.list(), args.goalId);
    const summary = (resultSummary: string) => ({ name: "archive_goal", label: "Stopped Goal", args, resultSummary });
    if ("error" in picked) return { data: { archived: false, error: picked.error }, summary: summary("No goal stopped") };
    await store.archive(picked.goal.id);
    return { data: { archived: true, title: picked.goal.title, note: "Removed from the dashboard. Its history stays in the user's account." }, summary: summary(`Stopped "${picked.goal.title}"`) };
  },
};
