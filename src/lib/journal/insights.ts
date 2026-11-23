import type { DailyMetricSummary } from "../types";
import { shiftIso } from "../utils";
import { HABITS, type HabitKey, type JournalEntry } from "./habits";

/**
 * What a habit does to the next morning: mornings after a day the habit was logged
 * against mornings after days it wasn't (counted from the first journal entry on,
 * so days before the user started journaling never count as "no").
 */

export const MIN_YES = 3;
export const MIN_NO = 3;
/** Smaller differences than this are reported as "no clear effect". */
const NOTICEABLE_PCT = 4;

type MetricKey = "heartRateVariability" | "restingHeartRate" | "sleepScore" | "sleepDurationMinutes";

const METRICS: { key: MetricKey; label: string; higherIsBetter: boolean }[] = [
  { key: "heartRateVariability", label: "HRV", higherIsBetter: true },
  { key: "restingHeartRate", label: "resting heart rate", higherIsBetter: false },
  { key: "sleepScore", label: "sleep score", higherIsBetter: true },
  { key: "sleepDurationMinutes", label: "sleep time", higherIsBetter: true },
];

export interface MetricEffect {
  metric: string;
  /** Mean after habit days vs mean after other days, % */
  changePct: number;
  better: boolean;
  withHabit: number;
  without: number;
}

export interface HabitInsight {
  habit: HabitKey;
  label: string;
  yesMornings: number;
  noMornings: number;
  /** Ready when both groups are big enough. */
  ready: boolean;
  /** Most noticeable effect first; empty until ready. */
  effects: MetricEffect[];
  /** One plain sentence, e.g. "After alcohol, your HRV is 12% lower the next morning." */
  headline: string;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function habitInsights(entries: JournalEntry[], days: DailyMetricSummary[]): HabitInsight[] {
  if (!entries.length) return [];
  const firstDay = entries.reduce((min, e) => (e.date < min ? e.date : min), entries[0].date);
  const byDate = new Map(days.map((d) => [d.date, d]));
  const mornings = days.filter((d) => d.date > firstDay);
  const habits = [...new Set(entries.map((e) => e.habit))];

  return habits
    .map((habit) => {
      const logged = new Set(entries.filter((e) => e.habit === habit).map((e) => e.date));
      const yes = mornings.filter((d) => logged.has(shiftIso(d.date, -1)));
      const no = mornings.filter((d) => !logged.has(shiftIso(d.date, -1)) && byDate.has(d.date));
      const ready = yes.length >= MIN_YES && no.length >= MIN_NO;
      const label = HABITS[habit].label;
      const effects: MetricEffect[] = [];
      if (ready) {
        for (const m of METRICS) {
          const pick = (group: DailyMetricSummary[]) => group.map((d) => d[m.key]).filter((v): v is number => typeof v === "number" && v > 0);
          const a = pick(yes);
          const b = pick(no);
          if (a.length < MIN_YES || b.length < MIN_NO) continue;
          const withHabit = mean(a);
          const without = mean(b);
          const changePct = Math.round(((withHabit - without) / without) * 100);
          effects.push({ metric: m.label, changePct, better: m.higherIsBetter ? changePct > 0 : changePct < 0, withHabit: Number(withHabit.toFixed(1)), without: Number(without.toFixed(1)) });
        }
        effects.sort((x, y) => Math.abs(y.changePct) - Math.abs(x.changePct));
      }
      const top = effects[0];
      const headline = !ready
        ? yes.length < MIN_YES
          ? `Log ${label.toLowerCase()} a few more times to see its effect (${yes.length} of ${MIN_YES} mornings so far).`
          : `Needs a few more mornings without ${label.toLowerCase()} to compare (${no.length} of ${MIN_NO}).`
        : !top || Math.abs(top.changePct) < NOTICEABLE_PCT
          ? `${label} has had no clear effect on your next-morning recovery so far.`
          : `After ${label.toLowerCase()}, your ${top.metric} is ${Math.abs(top.changePct)}% ${top.changePct > 0 ? "higher" : "lower"} the next morning.`;
      return { habit, label, yesMornings: yes.length, noMornings: no.length, ready, effects, headline };
    })
    .sort((a, b) => Number(b.ready) - Number(a.ready) || Math.abs(b.effects[0]?.changePct ?? 0) - Math.abs(a.effects[0]?.changePct ?? 0));
}
