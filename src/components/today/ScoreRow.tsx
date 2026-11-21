"use client";

import { ChevronRight, Flame, Moon, Zap } from "lucide-react";
import type { ReactNode } from "react";
import { Ring } from "@/components/ui/Ring";
import type { Tab } from "@/hooks/useTab";
import type { DayPlan } from "@/lib/coach/dayPlan";
import type { DailyMetricSummary } from "@/lib/types";
import { formatDuration } from "@/lib/utils";

interface ScoreRowProps {
  plan: DayPlan;
  today: DailyMetricSummary;
  isLoading?: boolean;
  onOpen: (tab: Tab) => void;
}

const readinessColor = (s: number) => (s >= 85 ? "text-emerald-500" : s >= 65 ? "text-sky-500" : "text-amber-500");
const sleepWord = (s: number) => (s >= 85 ? "Excellent" : s >= 75 ? "Good" : s >= 60 ? "Fair" : "Poor");

function ScoreCard({ title, icon, ring, value, caption, onClick }: { title: string; icon: ReactNode; ring: ReactNode; value: ReactNode; caption: ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group text-left flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-2xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-xs transition-colors min-w-0"
    >
      {ring}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {icon}
          {title}
        </div>
        <div className="mt-0.5 text-sm sm:text-base font-semibold text-slate-900 dark:text-white truncate">{value}</div>
        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{caption}</div>
      </div>
      <ChevronRight className="hidden sm:block w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:translate-x-0.5 transition-transform" />
    </button>
  );
}

const Big = ({ children }: { children: ReactNode }) => <span className="text-xl font-bold tabular-nums text-slate-900 dark:text-white leading-none">{children}</span>;

/** Readiness, sleep and effort at a glance; each opens the tab with the detail. */
export function ScoreRow({ plan, today, isLoading, onOpen }: ScoreRowProps) {
  const { effort } = plan;
  const sleepScore = today.sleepScore || null;
  const effortWord =
    effort.status === "in_range" ? "In target" : effort.status === "above" ? "Above target" : plan.workout.done ? "Workout done" : plan.mode === "rest" ? "Resting" : "Below target";
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-3 gap-3 ${isLoading ? "animate-pulse" : ""}`}>
      <ScoreCard
        title="Readiness"
        icon={<Zap className="w-3.5 h-3.5 text-emerald-500" />}
        ring={
          <Ring value={plan.readinessScore} colorClass={readinessColor(plan.readinessScore)} label={`Readiness ${plan.readinessScore} of 100`}>
            <Big>{plan.readinessScore}</Big>
          </Ring>
        }
        value={plan.mode === "push" ? "Ready to push" : plan.mode === "steady" ? "Steady" : plan.mode === "recover" ? "Recovering" : "Needs rest"}
        caption="HRV, sleep, resting HR, strain"
        onClick={() => document.getElementById("readiness")?.scrollIntoView({ behavior: "smooth", block: "start" })}
      />
      <ScoreCard
        title="Sleep"
        icon={<Moon className="w-3.5 h-3.5 text-indigo-500" />}
        ring={
          <Ring value={sleepScore} colorClass="text-indigo-500" label={sleepScore ? `Sleep score ${sleepScore} of 100` : "No sleep recorded"}>
            <Big>{sleepScore ?? "—"}</Big>
          </Ring>
        }
        value={sleepScore ? `${sleepWord(sleepScore)} · ${formatDuration(today.sleepDurationMinutes)}` : "No sleep recorded"}
        caption={plan.sleep ? `Tonight: in bed by ${plan.sleep.bedtime}` : "Wear your watch to bed"}
        onClick={() => onOpen("health")}
      />
      <ScoreCard
        title="Effort"
        icon={<Flame className="w-3.5 h-3.5 text-orange-500" />}
        ring={
          <Ring value={effort.score} band={effort.target} colorClass="text-orange-500" label={`Effort ${effort.score} of 100, target ${effort.target[0]} to ${effort.target[1]}`}>
            <Big>{effort.score}</Big>
          </Ring>
        }
        value={effortWord}
        caption={`Target today ${effort.target[0]}–${effort.target[1]}`}
        onClick={() => onOpen("training")}
      />
    </div>
  );
}
