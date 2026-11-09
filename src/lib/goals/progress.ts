import { shiftIso } from "../utils";
import { runsByDate, type ActivityData, type RunDay } from "./activity";
import { activityBadges, programBadges } from "./badges";
import type { ActivityGoal, ActivityView, DistanceUnit, Goal, GoalView, Nudge, PlanSession, PlanWeek, ProgramGoal, ProgramView, SessionStatus, SessionView, WeekView } from "./types";
import { daysBetween, formatDistance, formatLongDate, formatMetric, fromUnit, roundToHalfUnit } from "./units";

/** A session or week counts as done at this share of its planned distance. */
const DONE_SHARE = 0.8;
const PARTIAL_WEEK_SHARE = 0.4;
/** A run on another day stands in for a planned run when it covers at least this much of it... */
const MOVE_SHARE = 0.6;
/** ...and only a properly long run stands in for the long run. */
const LONG_MOVE_SHARE = 0.75;
/** Making up a missed run: remaining easy runs may grow by at most this share. Never cram. */
const MAX_TOP_UP = 0.25;
/** An automatic adjustment stays on the card this long. */
const ADAPTATION_NEWS_DAYS = 10;
const FLEXIBLE = new Set(["easy", "recovery", "shakeout"]);
const HARD_SESSIONS = new Set(["intervals", "tempo", "hills", "race_pace", "long"]);
/** Below this readiness a hard session is better swapped; at or above the high mark it gets a green light. */
const LOW_READINESS = 65;
const HIGH_READINESS = 85;

const datesBetween = (fromIso: string, toIso: string): string[] =>
  fromIso > toIso ? [] : Array.from({ length: daysBetween(fromIso, toIso) + 1 }, (_, i) => shiftIso(fromIso, i));

const isRun = (s: PlanSession) => s.distanceKm > 0;
const weekdayName = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });

interface Credit {
  km: number;
  on: string;
  untracked: boolean;
}

/**
 * Matches the week's actual runs to its planned runs. A run on its own day counts for that
 * day's session; a run on a rest or strength day is credited to the open session it fits best
 * (so running Tuesday's run on Monday just works). Runs that fit nothing are bonus distance.
 */
function creditRuns(sessions: PlanSession[], runs: Map<string, RunDay>, counts: (date: string) => boolean) {
  const credits = new Map<string, Credit>();
  const bonus = new Map<string, number>();
  const ranOn = sessions.filter((s) => counts(s.date) && runs.has(s.date));
  for (const s of ranOn) {
    const run = runs.get(s.date)!;
    if (isRun(s)) credits.set(s.date, { km: run.km, on: s.date, untracked: run.untracked });
  }
  for (const day of ranOn) {
    if (isRun(day)) continue;
    const run = runs.get(day.date)!;
    const fits = (s: PlanSession) =>
      isRun(s) && s.type !== "race" && !credits.has(s.date) && s.title !== "Before plan start" &&
      (run.untracked ? s.type !== "long" : run.km >= s.distanceKm * (s.type === "long" ? LONG_MOVE_SHARE : MOVE_SHARE));
    const distance = (s: PlanSession) => (run.untracked ? Math.abs(daysBetween(day.date, s.date)) : Math.abs(s.distanceKm - run.km));
    const pick = sessions.filter(fits).sort((a, b) => distance(a) - distance(b) || a.date.localeCompare(b.date))[0];
    if (pick) credits.set(pick.date, { km: run.km, on: day.date, untracked: run.untracked });
    else bonus.set(day.date, run.km);
  }
  return { credits, bonus };
}

/**
 * Re-balances the runs still to come this week. Extra distance already run trims the easy
 * runs (down to "optional"); a missed run adds a little to them. Quality sessions and the
 * long run are never touched. Returns the new distance per session date, only where it changed.
 */
function rebalance(sessions: PlanSession[], credits: Map<string, Credit>, bonus: Map<string, number>, today: string, unit: DistanceUnit) {
  const adjusted = new Map<string, { km: number; note: string }>();
  const open = sessions.filter((s) => isRun(s) && s.date >= today && !credits.has(s.date) && FLEXIBLE.has(s.type));
  if (!open.length) return adjusted;
  let surplus = [...bonus.values()].reduce((a, b) => a + b, 0);
  let deficit = 0;
  for (const s of sessions) {
    if (!isRun(s) || s.type === "race") continue;
    const credit = credits.get(s.date);
    if (credit && !credit.untracked) {
      if (credit.km > s.distanceKm) surplus += credit.km - s.distanceKm;
      else if (s.date < today || credit.on !== s.date) deficit += s.distanceKm - credit.km;
    } else if (!credit && s.date < today && s.title !== "Before plan start") deficit += s.distanceKm;
  }
  const net = deficit - surplus;
  const half = fromUnit(0.5, unit);
  if (Math.abs(net) < half) return adjusted;
  const flexTotal = open.reduce((sum, s) => sum + s.distanceKm, 0);
  const minRun = fromUnit(unit === "mi" ? 2 : 3, unit);
  for (const s of open) {
    const share = s.distanceKm / flexTotal;
    if (net > 0) {
      const km = roundToHalfUnit(s.distanceKm + Math.min(net * share, s.distanceKm * MAX_TOP_UP), unit);
      if (km > s.distanceKm) adjusted.set(s.date, { km, note: `A little longer than planned (${formatDistance(s.distanceKm, unit)}) to make up part of a missed run. The rest is let go.` });
    } else {
      const raw = s.distanceKm - Math.min(-net, flexTotal) * share;
      const km = raw < minRun ? 0 : roundToHalfUnit(raw, unit);
      if (km < s.distanceKm)
        adjusted.set(s.date, { km, note: km === 0 ? "Optional now: you already ran this distance earlier in the week." : `Trimmed from ${formatDistance(s.distanceKm, unit)}: you ran extra earlier this week.` });
    }
  }
  return adjusted;
}

/** Non-running activity by day, e.g. "Walking 45 min", for the cross-training line. */
function crossTrainingByDate(data: ActivityData): Map<string, string> {
  const map = new Map<string, string[]>();
  for (const w of data.workouts) {
    if (w.kind === "run" || w.minutes < 10) continue;
    map.set(w.date, [...(map.get(w.date) ?? []), `${w.label} ${w.minutes} min`]);
  }
  return new Map([...map].map(([date, items]) => [date, items.join(", ")]));
}

interface WeekContext {
  goal: ProgramGoal;
  today: string;
  runs: Map<string, RunDay>;
  strengthDays: Set<string>;
  cross: Map<string, string>;
}

function weekView({ sessions, ...week }: PlanWeek, ctx: WeekContext): WeekView {
  const { goal, today, runs } = ctx;
  const end = shiftIso(week.startDate, 6);
  const counts = (date: string) => date >= goal.startDate && date <= today;
  const isFuture = week.startDate > today;
  const isCurrent = !isFuture && end >= today;
  const { credits, bonus } = isFuture ? { credits: new Map<string, Credit>(), bonus: new Map<string, number>() } : creditRuns(sessions, runs, counts);
  const adjusted = isCurrent ? rebalance(sessions, credits, bonus, today, goal.unit) : new Map<string, { km: number; note: string }>();
  // One strength workout anywhere in the week ticks off the week's strength session.
  const strengthDone = sessions.some((s) => counts(s.date) && ctx.strengthDays.has(s.date));

  const views = sessions.map((s): SessionView => {
    const ranKm = counts(s.date) ? runs.get(s.date)?.km ?? 0 : 0;
    const base = { ...s, ranKm, coveredOn: null, adjustedKm: null, note: null, crossTraining: counts(s.date) ? ctx.cross.get(s.date) ?? null : null };
    if (s.date < goal.startDate || s.title === "Before plan start") return { ...base, status: "before_start", actualKm: 0 };
    if (!isRun(s)) {
      const status: SessionStatus = s.type === "strength" && strengthDone ? "done" : "rest";
      const where = [...credits.values()].find((c) => c.on === s.date);
      const credited = where ? sessions.find((x) => credits.get(x.date) === where) : undefined;
      const note = ranKm > 0 ? (credited ? `You ran ${formatDistance(ranKm, goal.unit)} today instead: counted as ${weekdayName(credited.date)}'s ${credited.title.toLowerCase()}.` : `Bonus run: ${formatDistance(ranKm, goal.unit)} on top of the plan.`) : null;
      return { ...base, status, actualKm: 0, note: note?.replace("today instead", s.date === today ? "today instead" : `on ${weekdayName(s.date)} instead`) ?? null };
    }
    const credit = credits.get(s.date);
    const change = adjusted.get(s.date);
    const target = change?.km ?? s.distanceKm;
    let status: SessionStatus;
    if (credit) {
      const done = credit.untracked || credit.km >= target * DONE_SHARE;
      status = done ? "done" : s.date === today && credit.on === today ? "today" : "partial";
    } else if (change?.km === 0) status = "covered";
    else status = s.date > today ? "upcoming" : s.date === today ? "today" : "missed";
    const moved = credit && credit.on !== s.date ? credit.on : null;
    return {
      ...base,
      status,
      actualKm: credit?.km ?? 0,
      coveredOn: moved,
      adjustedKm: change && !credit ? change.km : null,
      note: moved ? `Done ${moved < s.date ? "early" : "late"}, on ${weekdayName(moved)}.` : change && !credit ? change.note : null,
    };
  });

  const days = datesBetween(week.startDate, end).filter(counts);
  const actualKm = days.reduce((sum, date) => sum + (runs.get(date)?.km ?? 0), 0);
  // Runs recorded without a distance still count toward the week, at their planned distance.
  const untracked = views.filter((s) => s.status === "done" && s.actualKm === 0 && isRun(s)).reduce((sum, s) => sum + s.distanceKm, 0);
  const completion = isFuture ? null : week.plannedKm > 0 ? (actualKm + untracked) / week.plannedKm : 1;
  const state: WeekView["state"] = isFuture ? "upcoming" : isCurrent ? "current" : completion! >= DONE_SHARE ? "done" : completion! >= PARTIAL_WEEK_SHARE ? "partial" : "missed";
  return { ...week, sessions: views, actualKm, longestRunKm: Math.max(0, ...days.map((date) => runs.get(date)?.longestKm ?? 0)), completion, state };
}

/** What a session asks for now, after this week's re-balancing. */
const targetKm = (s: SessionView) => s.adjustedKm ?? s.distanceKm;

function programNudge(view: Omit<ProgramView, "nudge" | "badges">, today: string, readiness: { score: number; label: string } | null): Nudge {
  const { goal, plan, daysToRace, currentWeek, todaySession, nextSession } = view;
  const d = (km: number) => formatDistance(km, goal.unit);
  if (daysToRace < 0) {
    return { tone: "info", headline: `${plan.raceName} is behind you`, detail: "Recover well, then ask the coach for your next goal." };
  }
  if (today < goal.startDate || !currentWeek) {
    return { tone: "info", headline: `Your plan starts ${formatLongDate(goal.startDate)}`, detail: `${daysToRace} days to ${plan.raceName}. Rest up and get your shoes ready.` };
  }
  const { week, sessions } = currentWeek;
  const weekLine = `${d(week.actualKm)} of ${d(week.plannedKm)} done this week`;
  const next = nextSession ? ` Next: ${formatLongDate(nextSession.date)}, ${d(targetKm(nextSession))} ${nextSession.title.toLowerCase()}.` : "";
  const missedKm = sessions.filter((s) => s.status === "missed").reduce((sum, s) => sum + s.distanceKm, 0);

  if (todaySession?.type === "race") return { tone: "go", headline: `Race day: ${plan.raceName}!`, detail: todaySession.details };
  if (daysToRace <= 6) {
    return { tone: "go", headline: `${daysToRace} ${daysToRace === 1 ? "day" : "days"} to ${plan.raceName}`, detail: todaySession ? `Today: ${todaySession.title}. ${todaySession.details}` : "Stay fresh and trust the training." };
  }
  // A run on a day that had none planned: say what it counted for.
  if (todaySession && todaySession.distanceKm === 0 && todaySession.ranKm > 0) {
    return { tone: "done", headline: `${d(todaySession.ranKm)} logged on a ${todaySession.type === "strength" ? "strength" : "rest"} day`, detail: `${todaySession.note ?? ""} The rest of the week has been re-balanced. ${weekLine}.${next}`.trim() };
  }
  if (todaySession?.type === "strength" && todaySession.status === "done") {
    return { tone: "done", headline: "Strength session done. Nice work!", detail: `${weekLine}.${next}` };
  }
  if (todaySession?.status === "done") {
    const early = todaySession.coveredOn ? ` You already did it on ${weekdayName(todaySession.coveredOn)}, so today is free.` : "";
    return { tone: "done", headline: todaySession.coveredOn ? "Today's run is already done" : "Today's run is done. Nice work!", detail: `${early} ${weekLine}.${next}`.trim() };
  }
  if (todaySession?.status === "covered") {
    return { tone: "done", headline: "You're ahead: today's run is optional", detail: `${todaySession.note} ${weekLine}.${next}` };
  }
  if (todaySession?.status === "today" && readiness && readiness.score < LOW_READINESS && HARD_SESSIONS.has(todaySession.type)) {
    const easier = todaySession.type === "long" ? `cut the long run to ${d(roundToHalfUnit(todaySession.distanceKm * 0.7, goal.unit))} at an easy effort` : `swap the ${todaySession.title.toLowerCase()} for an easy ${d(roundToHalfUnit(todaySession.distanceKm * 0.75, goal.unit))}`;
    return {
      tone: "rest",
      headline: `Readiness is ${readiness.score}: go easy today`,
      detail: `Your body is still recovering, so ${easier}, or move the session to a fresher day (runs count whichever day you do them). ${weekLine}.`,
    };
  }
  if (todaySession?.status === "today") {
    const green = readiness && readiness.score >= HIGH_READINESS && HARD_SESSIONS.has(todaySession.type) ? ` Readiness is ${readiness.score}: green light to push.` : "";
    const partial = todaySession.actualKm > 0 ? ` ${d(todaySession.actualKm)} in so far.` : "";
    return { tone: "go", headline: `Today: ${d(targetKm(todaySession))} ${todaySession.title.toLowerCase()}`, detail: `${todaySession.note ?? todaySession.details}${partial}${green} ${weekLine}.` };
  }
  // Rest or strength day.
  if (missedKm > 0 && week.actualKm < week.plannedKm * DONE_SHARE) {
    return { tone: "behind", headline: `${d(missedKm)} missed so far this week`, detail: `No need to cram: the remaining easy runs carry a little extra, and a run today would count too. ${weekLine}.${next}` };
  }
  if (week.plannedKm > 0 && week.actualKm >= week.plannedKm * DONE_SHARE) {
    return { tone: "done", headline: "This week is in the bag", detail: `${weekLine}.${next}` };
  }
  const title = todaySession?.type === "strength" ? "Strength day" : "Rest day";
  return { tone: "rest", headline: `${title}: recovery is training too`, detail: `${todaySession?.details ?? ""} ${weekLine}.${next}`.trim() };
}

export function programView(goal: ProgramGoal, data: ActivityData): ProgramView {
  const { today } = data;
  const { plan } = goal;
  const runs = runsByDate(data);
  const ctx: WeekContext = { goal, today, runs, strengthDays: new Set(data.workouts.filter((w) => w.kind === "strength").map((w) => w.date)), cross: crossTrainingByDate(data) };
  const weeks = plan.weeks.map((w) => weekView(w, ctx));

  const currentIndex = weeks.findIndex((w) => w.state === "current");
  const currentWeek = currentIndex >= 0 ? { week: weeks[currentIndex], sessions: weeks[currentIndex].sessions } : null;
  const all = weeks.flatMap((w) => w.sessions);
  const todaySession = all.find((s) => s.date === today && s.status !== "before_start") ?? null;
  const nextSession = all.find((s) => s.date > today && isRun(s) && s.status !== "done" && s.status !== "covered") ?? null;

  const planDates = datesBetween(goal.startDate, today < goal.endDate ? today : goal.endDate);
  const actualKm = planDates.reduce((sum, date) => sum + (runs.get(date)?.km ?? 0), 0);
  // What was due: every past session, plus this week's runs already done (an unfinished today is not "behind").
  const dueKm = all.filter((s) => s.date < today || s.status === "done").reduce((sum, s) => sum + s.distanceKm, 0);
  let weekStreak = 0;
  for (const w of [...weeks].reverse()) {
    if (w.state === "upcoming" || w.state === "current") continue;
    if (w.state !== "done") break;
    weekStreak++;
  }
  const totals = {
    plannedKm: weeks.reduce((sum, w) => sum + w.plannedKm, 0),
    plannedToDateKm: all.filter((s) => s.date <= today).reduce((sum, s) => sum + s.distanceKm, 0),
    actualKm,
    longestRunKm: Math.max(0, ...planDates.map((date) => runs.get(date)?.longestKm ?? 0)),
    weeksCompleted: weeks.filter((w) => w.state === "done").length,
    weekStreak,
    adherence: dueKm > 0 ? actualKm / dueKm : null,
  };

  const { plan: fullPlan, input: _input, adaptations, ...goalInfo } = goal;
  const { weeks: _weeks, ...planInfo } = fullPlan;
  void [_weeks, _input];
  const latest = adaptations?.[adaptations.length - 1];
  const base = {
    kind: "program" as const,
    goal: goalInfo,
    plan: planInfo,
    adaptation: latest && daysBetween(latest.date, today) <= ADAPTATION_NEWS_DAYS ? latest : null,
    daysToRace: daysBetween(today, plan.raceDate),
    currentWeekIndex: currentIndex >= 0 ? currentIndex : null,
    weeks,
    currentWeek,
    todaySession,
    nextSession,
    totals,
  };
  return {
    ...base,
    nudge: programNudge(base, today, data.readiness),
    badges: programBadges({ goal, today, dates: planDates, runs, weeks, totalActualKm: actualKm, totalPlannedKm: totals.plannedKm, plannedToDateKm: totals.plannedToDateKm }),
  };
}

function activityNudge(goal: ActivityGoal, v: Pick<ActivityView, "current" | "expectedByToday" | "daysLeft" | "perDayNeeded" | "completedOn">, today: string): Nudge {
  const f = (value: number) => formatMetric(value, goal.metric, goal.unit);
  if (v.completedOn) return { tone: "done", headline: "Goal crushed!", detail: `You hit ${f(goal.target)} on ${formatLongDate(v.completedOn)}. Ask the coach for a bigger one.` };
  if (today < goal.startDate) return { tone: "info", headline: `Starts ${formatLongDate(goal.startDate)}`, detail: `Target: ${f(goal.target)} by ${formatLongDate(goal.endDate)}.` };
  if (today > goal.endDate) return { tone: "info", headline: "This goal has ended", detail: `You reached ${f(v.current)} of ${f(goal.target)}. Set a new one and go again.` };
  const perDay = `${f(v.perDayNeeded)} a day for the next ${v.daysLeft} ${v.daysLeft === 1 ? "day" : "days"} gets you there`;
  const gap = v.current - v.expectedByToday;
  if (gap >= 0) return { tone: "go", headline: gap > goal.target * 0.02 ? `${f(gap)} ahead of pace` : "Right on pace", detail: `${perDay}. Keep it rolling.` };
  return { tone: "behind", headline: `${f(-gap)} behind pace`, detail: `${perDay}. A solid day today closes the gap.` };
}

function metricValue(goal: ActivityGoal, data: ActivityData): (date: string) => number {
  const sumWorkouts = (pick: (w: ActivityData["workouts"][number]) => number) => {
    const map = new Map<string, number>();
    for (const w of data.workouts) map.set(w.date, (map.get(w.date) ?? 0) + pick(w));
    return (date: string) => map.get(date) ?? 0;
  };
  switch (goal.metric) {
    case "steps":
      return (date) => data.days.get(date)?.steps ?? 0;
    case "distance":
      return (date) => data.days.get(date)?.distanceKm ?? 0;
    case "active_minutes":
      return (date) => data.days.get(date)?.activeMinutes ?? 0;
    case "run_distance":
      return sumWorkouts((w) => (w.kind === "run" ? w.distanceKm : 0));
    case "walk_distance":
      return sumWorkouts((w) => (w.kind === "walk" ? w.distanceKm : 0));
    case "runs":
      return sumWorkouts((w) => (w.kind === "run" ? 1 : 0));
    case "workouts":
      return sumWorkouts(() => 1);
  }
}

export function activityView(goal: ActivityGoal, data: ActivityData): ActivityView {
  const { today } = data;
  const value = metricValue(goal, data);
  const dates = datesBetween(goal.startDate, today < goal.endDate ? today : goal.endDate);
  const daily = dates.map((date) => ({ date, value: value(date) }));
  const current = daily.reduce((sum, d) => sum + d.value, 0);
  let running = 0;
  const completedOn = daily.find((d) => (running += d.value) >= goal.target)?.date ?? null;
  const totalDays = daysBetween(goal.startDate, goal.endDate) + 1;
  const elapsed = Math.max(0, Math.min(totalDays, daysBetween(goal.startDate, today) + 1));
  const daysLeft = today > goal.endDate ? 0 : today < goal.startDate ? totalDays : daysBetween(today, goal.endDate) + 1;
  const stats = {
    current,
    expectedByToday: (goal.target * elapsed) / totalDays,
    daysLeft,
    perDayNeeded: completedOn || daysLeft === 0 ? 0 : (goal.target - current) / daysLeft,
    completedOn,
  };
  return {
    kind: "activity",
    goal,
    ...stats,
    percent: Math.min(100, Math.round((current / goal.target) * 100)),
    daily: daily.slice(-31),
    nudge: activityNudge(goal, stats, today),
    badges: activityBadges(goal, dates, value, current, completedOn),
  };
}

export const goalView = (goal: Goal, data: ActivityData): GoalView => (goal.kind === "program" ? programView(goal, data) : activityView(goal, data));
