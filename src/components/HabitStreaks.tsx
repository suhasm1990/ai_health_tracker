"use client";

import { Flame, Moon, Trophy, Zap, type LucideIcon } from "lucide-react";
import { useMemo } from "react";
import { STREAK_THRESHOLDS as T } from "@/lib/constants";
import type { DailyMetricSummary } from "@/lib/types";

interface HabitStreaksProps {
  today: DailyMetricSummary;
  history7Days: DailyMetricSummary[];
}

const hitSteps = (d: DailyMetricSummary) => d.steps >= Math.min(d.stepsGoal, T.steps);
const hitSleep = (d: DailyMetricSummary) => d.sleepScore >= T.sleepScore || d.sleepDurationMinutes >= T.sleepMinutes;
const hitActive = (d: DailyMetricSummary) => d.activeZoneMinutes >= T.activeZoneMinutes;

/**
 * Consecutive days (newest first) meeting `hit`. Today is still in progress, so a
 * miss today does not break the streak when `todayPending` says it can still be met.
 */
function streak(days: DailyMetricSummary[], hit: (d: DailyMetricSummary) => boolean, todayPending: (d: DailyMetricSummary) => boolean = () => true): number {
  let count = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (hit(days[i])) count++;
    else if (i === days.length - 1 && todayPending(days[i])) continue;
    else break;
  }
  return count;
}

interface StreakCard {
  id: string;
  title: string;
  description: string;
  count: number;
  unit: string;
  target: number;
  milestone: string;
  icon: LucideIcon;
  color: string;
  surface: string;
  bar: string;
}

export function HabitStreaks({ today, history7Days }: HabitStreaksProps) {
  // Chronological days ending today (ISO dates sort lexicographically).
  const days = useMemo(() => {
    const list = [...history7Days].sort((a, b) => a.date.localeCompare(b.date));
    return list.some((d) => d.date === today.date) ? list : [...list, today];
  }, [today, history7Days]);

  const cards = useMemo<StreakCard[]>(() => {
    const steps = streak(days, hitSteps);
    const sleep = streak(days, hitSleep, (d) => d.sleepDurationMinutes === 0);
    const active = streak(days, hitActive);
    const consistent = days.filter((d) => d.steps >= T.steps || hitActive(d) || d.sleepScore >= T.sleepScore).length;
    return [
      { id: "steps", title: "Daily Steps Streak", description: `Hit ${T.steps.toLocaleString()}+ steps daily to keep momentum alive`, count: steps, unit: "days", target: 7, milestone: steps >= 7 ? "🏆 7-Day Iron Walker" : "🎯 Next: 7-Day Iron Walker", icon: Flame, color: "text-amber-500 dark:text-amber-400", surface: "bg-amber-500/10 dark:bg-amber-500/15 border-amber-500/20", bar: "from-amber-500 to-orange-500" },
      { id: "sleep", title: "Restorative Sleep", description: "7+ hours or Sleep Score >= 75", count: sleep, unit: "days", target: 5, milestone: sleep >= 5 ? "🛡️ Circadian Master" : "🎯 Next: 5-Day Master", icon: Moon, color: "text-indigo-500 dark:text-indigo-400", surface: "bg-indigo-500/10 dark:bg-indigo-500/15 border-indigo-500/20", bar: "from-indigo-500 to-purple-500" },
      { id: "cardio", title: "Active Zone Minutes", description: "20+ minutes of fat burn or cardio daily", count: active, unit: "days", target: 5, milestone: active >= 5 ? "⚡ High Endurance" : "🎯 Next: 5-Day Surge", icon: Zap, color: "text-teal-500 dark:text-teal-400", surface: "bg-teal-500/10 dark:bg-teal-500/15 border-teal-500/20", bar: "from-teal-500 to-emerald-500" },
      { id: "weekly", title: "Weekly Consistency", description: "Days with a primary wellness goal satisfied", count: consistent, unit: `/${days.length} days`, target: days.length, milestone: "🎖️ Consistency Leader", icon: Trophy, color: "text-emerald-500 dark:text-emerald-400", surface: "bg-emerald-500/10 dark:bg-emerald-500/15 border-emerald-500/20", bar: "from-emerald-500 to-teal-500" },
    ];
  }, [days]);

  return (
    <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-400 text-white shadow-sm shadow-amber-500/20">
            <Flame className="w-4 h-4 animate-bounce" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Habit Streaks & Milestone Badges</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">Resilience Engine</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Consistent daily micro-habits compound into long-term vitality</p>
          </div>
        </div>

        <div className="flex items-center space-x-1.5 bg-slate-100 dark:bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700/60">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mr-1">Last 7 Days:</span>
          {days.slice(-7).map((d) => {
            const completed = d.steps >= T.steps || hitActive(d);
            const isToday = d.date === today.date;
            return (
              <div
                key={d.date}
                title={`${d.label}: ${d.steps.toLocaleString()} steps`}
                className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold transition-all ${
                  completed ? "bg-emerald-500 text-white shadow-xs" : isToday ? "bg-teal-500/20 text-teal-600 dark:text-teal-400 border border-teal-500/40" : "bg-slate-200 dark:bg-slate-700 text-slate-400"
                }`}
              >
                {completed ? "✓" : isToday ? "•" : "–"}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(({ id, title, description, count, unit, target, milestone, icon: Icon, color, surface, bar }) => {
          const progress = target > 0 ? Math.min(100, Math.round((count / target) * 100)) : 0;
          return (
            <div key={id} className={`relative overflow-hidden rounded-xl border p-3.5 transition-all duration-200 hover:shadow-md ${surface}`}>
              <div className="flex items-center space-x-2">
                <div className={`p-1.5 rounded-lg bg-white dark:bg-slate-800 shadow-xs ${color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">{title}</h4>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">{description}</span>
                </div>
              </div>
              <div className="mt-3 flex items-baseline space-x-1.5">
                <span className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">{count}</span>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{unit}</span>
              </div>
              <div className="mt-2.5">
                <div className="flex items-center justify-between text-[10px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                  <span>{milestone}</span>
                  <span>{progress}%</span>
                </div>
                <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-700/80 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-1000 ease-out bg-gradient-to-r ${bar}`} style={{ width: `${progress}%` }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
