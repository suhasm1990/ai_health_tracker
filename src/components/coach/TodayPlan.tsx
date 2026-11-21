"use client";

import { ArrowRight, BedDouble, Check, Dumbbell, Footprints, MessageCircle, Moon, Sparkles, Wand2, type LucideIcon } from "lucide-react";
import { useMemo } from "react";
import { useClientHour } from "@/hooks/useClientHour";
import { buildDayPlan, type DayMode, type PlanAction } from "@/lib/coach/dayPlan";
import type { GoalView } from "@/lib/goals/types";
import type { DailyMetricSummary, PersonalBaseline, WellnessSignals, WorkoutSession } from "@/lib/types";

interface TodayPlanProps {
  today: DailyMetricSummary;
  history: DailyMetricSummary[];
  baseline: PersonalBaseline;
  signals?: WellnessSignals;
  goals?: GoalView[];
  todayWorkouts?: WorkoutSession[];
  userName?: string;
  isLoading?: boolean;
  onAsk: (prompt: string) => void;
}

const MODE_STYLES: Record<DayMode, { glow: string; chip: string; label: string; dot: string }> = {
  push: { glow: "from-emerald-500/25 via-teal-500/10", chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30", label: "Push day", dot: "bg-emerald-500" },
  steady: { glow: "from-sky-500/20 via-teal-500/10", chip: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30", label: "Steady day", dot: "bg-sky-500" },
  recover: { glow: "from-amber-500/25 via-orange-500/10", chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30", label: "Recovery day", dot: "bg-amber-500" },
  rest: { glow: "from-rose-500/25 via-pink-500/10", chip: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30", label: "Rest day", dot: "bg-rose-500" },
};

const ACTION_ICONS: Record<PlanAction["id"], LucideIcon> = { workout: Dumbbell, move: Footprints, sleep: Moon };

function greetingFor(hour: number | null, name?: string) {
  const first = name?.split(" ")[0];
  const who = first ? `, ${first}` : "";
  if (hour === null) return `Hello${who}`;
  if (hour < 5) return `Up late${who}`;
  if (hour < 12) return `Good morning${who}`;
  if (hour < 17) return `Good afternoon${who}`;
  return `Good evening${who}`;
}

const todayLabel = () => new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

/** The coach's plan for today, at the top of the dashboard. */
export function TodayPlan({ today, history, baseline, signals, goals, todayWorkouts, userName, isLoading, onAsk }: TodayPlanProps) {
  const hour = useClientHour();
  const plan = useMemo(() => buildDayPlan({ today, history, baseline, signals, goals, todayWorkouts, hour }), [today, history, baseline, signals, goals, todayWorkouts, hour]);
  const style = MODE_STYLES[plan.mode];
  const { workout, sleep } = plan;
  const doneCount = plan.actions.filter((a) => a.done).length;

  return (
    <section aria-labelledby="today-plan-title" className="relative overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 shadow-sm">
      <div className={`pointer-events-none absolute -top-24 -left-24 w-[28rem] h-[28rem] rounded-full bg-gradient-to-br ${style.glow} to-transparent blur-3xl opacity-80`} />
      <div className="relative p-4 sm:p-6 lg:p-7 grid gap-5 lg:grid-cols-[1.1fr_1fr] lg:gap-8">
        {/* Left: headline and conversation starters */}
        <div className="flex flex-col">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span suppressHydrationWarning>{hour === null ? "Today" : todayLabel()}</span>
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${style.chip}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
              {style.label}
            </span>
          </div>
          <p className="mt-3 text-sm font-medium text-slate-500 dark:text-slate-400">{greetingFor(hour, userName)}</p>
          <h2 id="today-plan-title" className={`mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white text-balance ${isLoading ? "animate-pulse" : ""}`}>
            {isLoading ? "Reading your night…" : plan.headline}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300 max-w-prose">{plan.summary}</p>

          <div className="mt-5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
            Ask your coach
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {plan.prompts.map(({ label, prompt }) => (
              <button
                key={label}
                onClick={() => onAsk(prompt)}
                className="group inline-flex items-center gap-1.5 pl-3 pr-2.5 py-1.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:border-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
              >
                <MessageCircle className="w-3.5 h-3.5 text-emerald-500" />
                {label}
                <ArrowRight className="w-3 h-3 opacity-50 group-hover:translate-x-0.5 transition-transform" />
              </button>
            ))}
          </div>

          {/* Checklist */}
          <div className="mt-6 lg:mt-auto lg:pt-6">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              <span>Today&apos;s checklist</span>
              <span className="tabular-nums normal-case tracking-normal font-medium">
                {doneCount} of {plan.actions.length} done
              </span>
            </div>
            <ul className="space-y-1.5">
              {plan.actions.map((action) => {
                const Icon = ACTION_ICONS[action.id];
                return (
                  <li key={action.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/50">
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-colors ${action.done ? "bg-emerald-500 text-white" : "border-2 border-slate-300 dark:border-slate-600 text-slate-400"}`}
                      aria-hidden
                    >
                      {action.done ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : <Icon className="w-3 h-3" />}
                    </span>
                    <span className={`flex-1 min-w-0 text-sm font-medium truncate ${action.done ? "text-slate-400 dark:text-slate-500 line-through decoration-slate-300 dark:decoration-slate-600" : "text-slate-800 dark:text-slate-100"}`}>
                      {action.label}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0 tabular-nums">{action.detail}</span>
                    <span className="sr-only">{action.done ? "done" : "not done yet"}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* Right: the workout and the bedtime */}
        <div className="grid gap-3 content-start">
          <article className="rounded-2xl p-4 sm:p-5 bg-slate-950 text-white dark:bg-slate-950/80 border border-slate-800 shadow-lg">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                <Dumbbell className="w-3.5 h-3.5 text-emerald-400" />
                {workout.fromProgram ? "Today's session" : "Suggested workout"}
              </span>
              {workout.original && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-300 border border-amber-400/30">
                  <Wand2 className="w-3 h-3" />
                  Adjusted by coach
                </span>
              )}
              {workout.done && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-400/15 text-emerald-300 border border-emerald-400/30">
                  <Check className="w-3 h-3" />
                  Done
                </span>
              )}
            </div>
            <h3 className="mt-3 text-xl font-bold tracking-tight">{workout.title}</h3>
            <p className="mt-1 text-sm text-slate-300 leading-relaxed">{workout.detail}</p>
            {workout.original && (
              <p className="mt-3 text-xs text-slate-400">
                Planned: <span className="line-through decoration-slate-500">{workout.original.title}</span>
              </p>
            )}
            <p className="mt-3 pt-3 border-t border-white/10 text-xs text-slate-400 leading-relaxed">{workout.reason}</p>
          </article>

          {sleep ? (
            <article className="rounded-2xl p-4 sm:p-5 bg-gradient-to-br from-indigo-500/10 to-violet-500/5 dark:from-indigo-500/15 dark:to-violet-500/5 border border-indigo-500/20">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                  <BedDouble className="w-3.5 h-3.5" />
                  Tonight
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">Wake ~{sleep.wake}</span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white tabular-nums">{sleep.bedtime}</span>
                <span className="text-sm text-slate-500 dark:text-slate-400">lights out</span>
              </div>
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{sleep.reason}</p>
            </article>
          ) : (
            <article className="rounded-2xl p-4 border border-dashed border-slate-300 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
              Wear your watch to bed and the coach will plan your bedtime from your sleep pattern.
            </article>
          )}
        </div>
      </div>
    </section>
  );
}
