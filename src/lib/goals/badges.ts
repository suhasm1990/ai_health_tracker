import { shiftIso } from "../utils";
import type { RunDay } from "./activity";
import type { ActivityGoal, Badge, BadgeIcon, BadgeTier, ProgramGoal, WeekView } from "./types";
import { formatMetric, fromUnit } from "./units";

const badge = (id: string, name: string, description: string, icon: BadgeIcon, tier: BadgeTier, earnedOn: string | null, progress: number | null = null): Badge => ({
  id,
  name,
  description,
  icon,
  tier,
  earned: earnedOn !== null,
  earnedOn,
  progress: earnedOn ? 1 : progress === null ? null : Math.max(0, Math.min(0.99, progress)),
});

/** First date in `dates` (ascending) where the running total of `value` reaches `threshold`. */
function crossedOn(dates: string[], value: (date: string) => number, threshold: number): string | null {
  let sum = 0;
  for (const d of dates) {
    sum += value(d);
    if (sum >= threshold) return d;
  }
  return null;
}

interface ProgramBadgeInput {
  goal: ProgramGoal;
  today: string;
  /** Plan dates from start through today, ascending. */
  dates: string[];
  runs: Map<string, RunDay>;
  weeks: WeekView[];
  totalActualKm: number;
  totalPlannedKm: number;
  plannedToDateKm: number;
}

export function programBadges({ goal, today, dates, runs, weeks, totalActualKm, totalPlannedKm, plannedToDateKm }: ProgramBadgeInput): Badge[] {
  const { plan, unit, id } = goal;
  const km = (d: string) => runs.get(d)?.km ?? 0;
  const longest = Math.max(0, ...dates.map((d) => runs.get(d)?.longestKm ?? 0));
  const firstRunWith = (minKm: number) => dates.find((d) => (runs.get(d)?.longestKm ?? 0) >= minKm) ?? null;
  const anyRun = dates.find((d) => runs.has(d)) ?? null;
  const out: Badge[] = [];
  const add = (key: string, ...rest: Parameters<typeof badge> extends [string, ...infer R] ? R : never) => out.push(badge(`${id}:${key}`, ...rest));

  add("first-run", "First Stride", "Log your first run of the plan.", "footprints", "bronze", anyRun);

  const weekEnd = (w: WeekView) => shiftIso(w.startDate, 6);
  const week1 = weeks[0];
  add("week-one", "Week One Done", "Complete 80% of your first week.", "calendar", "bronze", week1?.state === "done" ? weekEnd(week1) : null, week1?.completion ?? 0);

  // Longest run of consecutive completed weeks, and when each streak length was first reached.
  let streak = 0;
  let best = 0;
  const reached: Record<number, string> = {};
  for (const w of weeks) {
    if (w.state === "done") {
      streak++;
      best = Math.max(best, streak);
      for (const n of [4, 8]) if (streak === n && !reached[n]) reached[n] = weekEnd(w);
    } else if (w.state !== "current" && w.state !== "upcoming") streak = 0;
  }
  if (weeks.length >= 6) add("streak-4", "Four-Week Streak", "Hit 80% of the plan four weeks in a row.", "flame", "silver", reached[4] ?? null, best / 4);
  if (weeks.length >= 12) add("streak-8", "Iron Consistency", "Hit 80% of the plan eight weeks in a row.", "flame", "gold", reached[8] ?? null, best / 8);

  const longRuns: [number, string, string, BadgeTier][] =
    unit === "mi"
      ? [[10, "Double Digits", "Run 10 miles in one go.", "bronze"], [13.1, "Half Marathon Club", "Cover the half marathon distance in a single run.", "silver"], [20, "The 20-Miler", "Complete a 20-mile long run.", "gold"]]
      : [[15, "15K Club", "Run 15 km in one go.", "bronze"], [21.1, "Half Marathon Club", "Cover the half marathon distance in a single run.", "silver"], [32, "The 32K", "Complete a 32 km long run.", "gold"]];
  for (const [value, name, description, tier] of longRuns) {
    const threshold = fromUnit(value, unit);
    // Only long runs this plan actually schedules; a little slack for GPS and rounding.
    if (plan.peakLongRunKm < threshold - 0.6) continue;
    add(`long-${value}`, name, description, "mountain", tier, firstRunWith(threshold - 0.15), longest / threshold);
  }

  const ladder = unit === "mi" ? [25, 50, 100, 250, 500, 750] : [50, 100, 250, 500, 1000, 1500];
  let lockedShown = false;
  for (const value of ladder) {
    const threshold = fromUnit(value, unit);
    if (threshold > totalPlannedKm) break;
    const on = crossedOn(dates, km, threshold);
    if (!on && lockedShown) break;
    if (!on) lockedShown = true;
    const tier: BadgeTier = value >= ladder[4] ? "gold" : value >= ladder[2] ? "silver" : "bronze";
    add(`total-${value}`, `${value} ${unit === "mi" ? "Miles" : "K"} Logged`, `Run ${value} ${unit} in total during this plan.`, "medal", tier, on, totalActualKm / threshold);
  }

  add("halfway", "Halfway There", "Log half of the plan's total distance.", "target", "silver", crossedOn(dates, km, totalPlannedKm / 2), totalActualKm / (totalPlannedKm / 2));

  const trainingWeeks = weeks.filter((w) => w.phase !== "Race");
  const peak = trainingWeeks.reduce<WeekView | null>((a, w) => (!a || w.plannedKm > a.plannedKm ? w : a), null);
  if (peak && trainingWeeks.length >= 4) {
    const done = weekEnd(peak) < today && (peak.completion ?? 0) >= 0.9;
    add("peak-week", "Peak Week Conquered", "Complete 90% of your biggest training week.", "zap", "gold", done ? weekEnd(peak) : null, peak.state === "upcoming" ? 0 : peak.completion ?? 0);
  }

  const taper = weeks.find((w) => w.phase === "Taper");
  if (taper) {
    const onTrack = plannedToDateKm > 0 && totalActualKm / plannedToDateKm >= 0.6;
    add("taper", "Taper Time", "Reach the taper having done 60% or more of the plan.", "rocket", "silver", today >= taper.startDate && onTrack ? taper.startDate : null);
  }

  const raceRun = runs.get(plan.raceDate);
  const finished = raceRun && raceRun.longestKm >= plan.raceDistanceKm * 0.95;
  add("finisher", `${plan.raceName} Finisher`, "Cross the finish line on race day.", "crown", "legend", finished ? plan.raceDate : null);
  return out;
}

export function activityBadges(goal: ActivityGoal, dates: string[], value: (date: string) => number, current: number, completedOn: string | null): Badge[] {
  const { id, metric, target, unit, startDate, endDate } = goal;
  const out: Badge[] = [];
  const steps: [number, string, BadgeIcon, BadgeTier][] = [
    [0.25, "Off the Blocks", "footprints", "bronze"],
    [0.5, "Halfway There", "target", "bronze"],
    [0.75, "Home Stretch", "flame", "silver"],
    [1, "Goal Crushed", "trophy", "gold"],
  ];
  for (const [share, name, icon, tier] of steps) {
    const threshold = target * share;
    out.push(badge(`${id}:p${share * 100}`, name, `Reach ${formatMetric(threshold, metric, unit)}.`, icon, tier, crossedOn(dates, value, threshold), current / threshold));
  }
  const totalDays = Math.max(1, dates.length ? Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86_400_000) + 1 : 1);
  const bigDay = (target / totalDays) * 2;
  const bigOn = dates.find((d) => value(d) >= bigDay) ?? null;
  const best = Math.max(0, ...dates.map(value));
  // Only for things that add up every day; a single run always "doubles" a running goal's daily average.
  if (metric === "steps" || metric === "distance" || metric === "active_minutes")
    out.push(badge(`${id}:big-day`, "Big Day", `Do double the daily average in one day (${formatMetric(bigDay, metric, unit)}).`, "zap", "silver", bigOn, best / bigDay));
  if (totalDays >= 7) out.push(badge(`${id}:early`, "Ahead of Schedule", "Finish the goal before its last day.", "rocket", "legend", completedOn && completedOn < endDate ? completedOn : null));
  return out;
}
