import { PlanError } from "./plan";
import { replan } from "./replan";
import type { PlanAdaptation, ProgramGoal, ProgramView, WeekView } from "./types";
import { daysBetween, formatDistance, fromUnit } from "./units";

/** Two finished weeks in a row under this share of the plan: the plan is ahead of the runner. */
const EASE_BELOW = 0.6;
/** Three finished weeks in a row over this share: the runner is ahead of the plan. */
const RAISE_ABOVE = 1.2;
/** Leave a fresh adjustment alone this long before judging again, so the plan does not see-saw. */
const SETTLE_DAYS = 21;
const MAX_KEPT = 10;

const finished = (w: WeekView) => w.state === "done" || w.state === "partial" || w.state === "missed";

/**
 * Keeps a program honest with what is actually being run. When recent finished weeks sit well
 * below the plan, the coming weeks are rebuilt from the real volume (a plan nobody can follow
 * motivates nobody); when they sit well above, the plan steps up to match. Finished weeks are
 * never rewritten. Returns the adjusted goal, or null when the plan should stand.
 */
export function adaptProgram(goal: ProgramGoal, view: ProgramView, today: string): ProgramGoal | null {
  const current = view.currentWeek?.week;
  if (!current || current.phase === "Taper" || current.phase === "Race") return null;
  const last = goal.adaptations?.[goal.adaptations.length - 1];
  if (last && daysBetween(last.date, today) < SETTLE_DAYS) return null;

  // Full training weeks only: the first week may have started mid-week.
  const done = view.weeks.filter((w) => finished(w) && w.startDate >= goal.startDate && w.phase !== "Taper" && w.phase !== "Race" && w.plannedKm > 0);
  const d = (km: number) => formatDistance(km, goal.unit, 0);
  const avg = (weeks: WeekView[]) => weeks.reduce((sum, w) => sum + w.actualKm, 0) / weeks.length;
  const minWeekly = fromUnit(goal.unit === "mi" ? 6 : 10, goal.unit);

  let adaptation: PlanAdaptation | null = null;
  let weekly = 0;
  const lastTwo = done.slice(-2);
  const lastThree = done.slice(-3);
  if (lastTwo.length === 2 && lastTwo.every((w) => (w.completion ?? 0) < EASE_BELOW)) {
    // A touch above what was actually run, so the plan still leads, just from where the runner is.
    weekly = Math.max(minWeekly, avg(lastTwo) * 1.1);
    if (weekly < current.plannedKm * 0.9)
      adaptation = { date: today, direction: "eased", message: `Your last two weeks averaged ${d(avg(lastTwo))} against about ${d((lastTwo[0].plannedKm + lastTwo[1].plannedKm) / 2)} planned, so the coming weeks now build from ${d(weekly)}. Finished weeks are unchanged.` };
  } else if (lastThree.length === 3 && lastThree.every((w) => !w.isDownWeek && (w.completion ?? 0) > RAISE_ABOVE)) {
    weekly = avg(lastThree);
    if (weekly > current.plannedKm * 1.1)
      adaptation = { date: today, direction: "raised", message: `You have run about ${d(weekly)} a week for three weeks, well above the plan, so the coming weeks now build from there.` };
  }
  if (!adaptation) return null;

  try {
    const longest = Math.max(0, ...done.slice(-3).map((w) => w.longestRunKm));
    const next = replan(goal, { currentWeeklyKm: weekly, ...(longest > 0 ? { longestRecentRunKm: longest } : {}) }, today);
    return { ...next, adaptations: [...(goal.adaptations ?? []), adaptation].slice(-MAX_KEPT) };
  } catch (err) {
    if (err instanceof PlanError) return null;
    throw err;
  }
}
