"use client";

import { ArrowRight, BedDouble, Check, Dumbbell, Footprints, ListChecks, Loader2, MessageCircle, Minus, Moon, SkipForward, Sparkles, Undo2, Wand2, type LucideIcon } from "lucide-react";
import type { DayMode, DayPlan, PlanAction } from "@/lib/coach/dayPlan";

interface TodayPlanProps {
  plan: DayPlan;
  hour: number | null;
  userName?: string;
  isLoading?: boolean;
  onAsk: (prompt: string) => void;
  /** Marks today's workout as skipped, or takes that back. */
  onSkip?: (skipped: boolean) => void;
  skipPending?: boolean;
  skipError?: string | null;
}

const MODE_STYLES: Record<DayMode, { glow: string; chip: string; label: string; dot: string }> = {
  push: { glow: "from-emerald-500/25 via-teal-500/10", chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30", label: "Push day", dot: "bg-emerald-500" },
  steady: { glow: "from-sky-500/20 via-teal-500/10", chip: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30", label: "Steady day", dot: "bg-sky-500" },
  recover: { glow: "from-amber-500/25 via-orange-500/10", chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30", label: "Recovery day", dot: "bg-amber-500" },
  rest: { glow: "from-rose-500/25 via-pink-500/10", chip: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30", label: "Rest day", dot: "bg-rose-500" },
};

/** A skipped workout turns the day into a rest day, whatever readiness said. */
const SKIPPED_STYLE = { glow: "from-indigo-500/20 via-slate-500/10", chip: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30", label: "Rest day", dot: "bg-slate-400" };

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
export function TodayPlan({ plan, hour, userName, isLoading, onAsk, onSkip, skipPending, skipError }: TodayPlanProps) {
  const { workout, sleep } = plan;
  const style = workout.skipped ? SKIPPED_STYLE : MODE_STYLES[plan.mode];
  const doneCount = plan.actions.filter((a) => a.done).length;
  // A skipped workout is settled, not outstanding: leave it out of the count.
  const countable = plan.actions.filter((a) => !a.skipped).length;

  return (
    <section aria-labelledby="today-plan-title" className="relative overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 shadow-sm">
      <div className={`pointer-events-none absolute -top-24 -left-24 w-[28rem] h-[28rem] rounded-full bg-gradient-to-br ${style.glow} to-transparent blur-3xl opacity-80`} />
      {/* Two aligned rows on desktop: headline | session, then checklist | tonight. Phones stack headline, checklist, session, tonight. */}
      <div className="relative p-4 sm:p-6 lg:p-7 grid gap-4 sm:gap-5 lg:grid-cols-2 lg:gap-x-8 lg:gap-y-5">
        {/* Headline and conversation starters */}
        <div className="flex flex-col order-1">
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

        </div>

        {/* Checklist */}
        <article className="order-2 lg:order-3 h-full rounded-2xl p-4 sm:p-5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <ListChecks className="w-3.5 h-3.5 text-emerald-500" />
              Today&apos;s checklist
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {doneCount} of {countable} done
            </span>
          </div>
          <ul className="mt-2 divide-y divide-slate-200 dark:divide-slate-700/60">
            {plan.actions.map((action) => {
              const Icon = ACTION_ICONS[action.id];
              return (
                <li key={action.id} className="flex items-center gap-3 py-2.5 last:pb-0">
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-colors ${action.done ? "bg-emerald-500 text-white" : action.skipped ? "bg-slate-300 dark:bg-slate-600 text-white dark:text-slate-200" : "border-2 border-slate-300 dark:border-slate-600 text-slate-400"}`}
                    aria-hidden
                  >
                    {action.done ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : action.skipped ? <Minus className="w-3.5 h-3.5" strokeWidth={3} /> : <Icon className="w-3 h-3" />}
                  </span>
                  <span className={`flex-1 min-w-0 text-sm font-medium truncate ${action.done || action.skipped ? "text-slate-400 dark:text-slate-500 line-through decoration-slate-300 dark:decoration-slate-600" : "text-slate-800 dark:text-slate-100"}`}>
                    {action.label}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0 tabular-nums">{action.detail}</span>
                  <span className="sr-only">{action.done ? "done" : action.skipped ? "skipped" : "not done yet"}</span>
                </li>
              );
            })}
          </ul>
        </article>

        {/* The workout */}
        <article className="order-3 lg:order-2 h-full flex flex-col rounded-2xl p-4 sm:p-5 bg-gradient-to-br from-emerald-500/10 to-teal-500/5 text-slate-900 border border-emerald-500/25 dark:from-transparent dark:to-transparent dark:bg-slate-950/80 dark:text-white dark:border-slate-800 dark:shadow-lg">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-slate-400">
              <Dumbbell className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              {workout.fromProgram ? "Today's session" : "Suggested workout"}
            </span>
            {workout.original && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-700 dark:text-amber-300 border border-amber-400/30">
                <Wand2 className="w-3 h-3" />
                Adjusted by coach
              </span>
            )}
            {workout.done && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-400/15 text-emerald-700 dark:text-emerald-300 border border-emerald-400/30">
                <Check className="w-3 h-3" />
                Done
              </span>
            )}
            {workout.skipped && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-400/15 text-slate-600 dark:text-slate-300 border border-slate-400/30">
                <Minus className="w-3 h-3" />
                Skipped
              </span>
            )}
            </div>
            <h3 className="mt-2 text-xl font-bold tracking-tight">{workout.title}</h3>
            <p className="mt-1 mb-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{workout.detail}</p>
            {workout.original && (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Planned: <span className="line-through decoration-slate-400 dark:decoration-slate-500">{workout.original.title}</span>
              </p>
            )}
            <div className="mt-auto pt-3 border-t border-emerald-500/20 dark:border-white/10">
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{workout.reason}</p>
              {onSkip && (workout.canSkip || workout.skipped) && !isLoading && (
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                  <button
                    type="button"
                    onClick={() => onSkip(!workout.skipped)}
                    disabled={skipPending}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors disabled:opacity-60 bg-white/70 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:border-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-300"
                  >
                    {skipPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : workout.skipped ? <Undo2 className="w-3.5 h-3.5" /> : <SkipForward className="w-3.5 h-3.5" />}
                    {workout.skipped ? "Undo skip" : "Skip today"}
                  </button>
                  {skipError && <span role="alert" className="text-xs text-rose-600 dark:text-rose-400">{skipError}</span>}
                </div>
              )}
            </div>
          </article>

          {sleep ? (
            <article className="order-4 h-full rounded-2xl p-4 sm:p-5 bg-gradient-to-br from-indigo-500/10 to-violet-500/5 dark:from-indigo-500/15 dark:to-violet-500/5 border border-indigo-500/20">
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
            <article className="order-4 h-full rounded-2xl p-4 sm:p-5 border border-dashed border-slate-300 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
              Wear your watch to bed and the coach will plan your bedtime from your sleep pattern.
            </article>
          )}
      </div>
    </section>
  );
}
