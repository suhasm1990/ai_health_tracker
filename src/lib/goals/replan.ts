import { buildPlan } from "./plan";
import type { PlanInput, ProgramGoal, TrainingPlan } from "./types";
import { mondayOf } from "./units";

/** Fields of a plan the user may change after it was created. */
export type PlanChanges = Partial<Omit<PlanInput, "elapsedWeeks">>;

const DOWN_WEEK_FACTOR = 0.78;

/**
 * Applies changes to a program.
 *
 * - A new start date (or a plan that has not begun) regenerates the whole plan.
 * - Mid-program, weeks before the current one are history and stay exactly as they were;
 *   the plan is rebuilt from the current week, continuing from the volume already reached
 *   unless the user gives a new current volume (after illness, injury or a break).
 */
export function replan(goal: ProgramGoal, changes: PlanChanges, today: string): ProgramGoal {
  const input: PlanInput = { ...goal.input, ...changes, elapsedWeeks: 0 };
  const restart = changes.startDate !== undefined || today < goal.startDate;
  const thisMonday = mondayOf(today);
  const past = goal.plan.weeks.filter((w) => w.startDate < thisMonday);

  let plan: TrainingPlan;
  if (restart || past.length === 0) {
    plan = buildPlan(input);
  } else {
    const current = goal.plan.weeks.find((w) => w.startDate === thisMonday);
    const training = current && current.phase !== "Taper" && current.phase !== "Race" ? current : null;
    // A down week understates the level reached; undo its cut-back before carrying on.
    const reachedWeekly = training ? training.plannedKm / (training.isDownWeek ? DOWN_WEEK_FACTOR : 1) : null;
    const reachedLong = training ? training.longRunKm / (training.isDownWeek ? 0.75 : 1) : null;
    const rest = buildPlan({
      ...input,
      startDate: thisMonday,
      currentWeeklyKm: changes.currentWeeklyKm ?? reachedWeekly ?? input.currentWeeklyKm,
      longestRecentRunKm: changes.longestRecentRunKm ?? reachedLong ?? input.longestRecentRunKm,
      elapsedWeeks: past.length,
    });
    const weeks = [...past, ...rest.weeks];
    plan = {
      ...rest,
      weeks,
      startingWeeklyKm: goal.plan.startingWeeklyKm,
      peakWeeklyKm: Math.max(...weeks.map((w) => w.plannedKm)),
      peakLongRunKm: Math.max(...weeks.filter((w) => w.phase !== "Race").map((w) => w.longRunKm), 0),
    };
  }
  return { ...goal, title: input.raceName, unit: input.unit, startDate: input.startDate, endDate: input.raceDate, input, plan };
}
