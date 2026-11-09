"use client";

import { ChevronDown, Dumbbell, Footprints, Map, PersonStanding, Zap, type LucideIcon } from "lucide-react";
import type { ActivityView, GoalMetric, Nudge } from "@/lib/goals/types";
import { METRIC_INFO, displayValue, formatLongDate, formatMetric } from "@/lib/goals/units";
import { BadgeRow } from "./BadgeMedal";
import { NudgeBanner, RemoveButton, useStoredToggle } from "./shared";

const METRIC_STYLE: Record<GoalMetric, { icon: LucideIcon; chip: string; bar: string }> = {
  steps: { icon: Footprints, chip: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20", bar: "from-emerald-500 to-teal-500" },
  distance: { icon: Map, chip: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20", bar: "from-sky-500 to-cyan-500" },
  walk_distance: { icon: Footprints, chip: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20", bar: "from-sky-500 to-cyan-500" },
  run_distance: { icon: PersonStanding, chip: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20", bar: "from-indigo-500 to-violet-500" },
  runs: { icon: PersonStanding, chip: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20", bar: "from-indigo-500 to-violet-500" },
  active_minutes: { icon: Zap, chip: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20", bar: "from-amber-500 to-orange-500" },
  workouts: { icon: Dumbbell, chip: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20", bar: "from-rose-500 to-pink-500" },
};

const TONE_TEXT: Record<Nudge["tone"], string> = {
  go: "text-emerald-600 dark:text-emerald-400",
  done: "text-teal-600 dark:text-teal-400",
  rest: "text-sky-600 dark:text-sky-400",
  behind: "text-amber-600 dark:text-amber-400",
  info: "text-slate-500 dark:text-slate-400",
};

const compact = (n: number) => (n >= 10_000 ? `${Number((n / 1000).toFixed(n >= 100_000 ? 0 : 1))}k` : Number(n.toFixed(1)).toLocaleString("en-US"));

interface ActivityCardProps {
  view: ActivityView;
  today: string;
  newBadgeIds: Set<string>;
  onAsk: (text: string) => void;
  onRemove: () => void;
}

/** One row per goal: progress and pace at a glance; the daily chart and badges open underneath. */
export function ActivityCard({ view, today, newBadgeIds, onAsk, onRemove }: ActivityCardProps) {
  const { goal, current, percent, daily } = view;
  const [open, toggleOpen] = useStoredToggle(`health-app-goal-open:${goal.id}`);
  const style = METRIC_STYLE[goal.metric];
  const Icon = style.icon;
  const expectedPct = Math.min(100, (view.expectedByToday / goal.target) * 100);
  const recent = daily.slice(-14);
  const max = Math.max(...recent.map((d) => d.value), 1);
  const unitLabel = METRIC_INFO[goal.metric].isDistance ? goal.unit : METRIC_INFO[goal.metric].unitLabel;
  const active = today >= goal.startDate && today <= goal.endDate && !view.completedOn;

  return (
    <article className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      <button onClick={toggleOpen} aria-expanded={open} className="w-full text-left p-3 sm:p-4">
        <div className="flex items-center gap-2.5">
          <div className={`p-2 rounded-xl border shrink-0 ${style.chip}`}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">{goal.title}</h4>
              <span className="text-sm font-bold text-slate-700 dark:text-slate-200 shrink-0">{percent}%</span>
            </div>
            <div className="flex items-baseline justify-between gap-2 text-[11px]">
              <span className="text-slate-600 dark:text-slate-400 truncate">
                <strong className="text-slate-900 dark:text-white">{compact(displayValue(current, goal.metric, goal.unit))}</strong> of {compact(displayValue(goal.target, goal.metric, goal.unit))} {unitLabel}
                {view.daysLeft > 0 ? ` · ${view.daysLeft} ${view.daysLeft === 1 ? "day" : "days"} left` : ""}
              </span>
              <span className={`font-semibold shrink-0 ${TONE_TEXT[view.nudge.tone]}`}>{view.nudge.headline}</span>
            </div>
          </div>
          <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
        <div className="relative mt-2.5 h-2 rounded-full bg-slate-200 dark:bg-slate-800">
          <div className={`h-full rounded-full bg-gradient-to-r ${style.bar} transition-all duration-700`} style={{ width: `${percent}%` }} />
          {active && <span className="absolute -top-1 w-0.5 h-4 bg-slate-900/70 dark:bg-white/80 rounded" style={{ left: `${expectedPct}%` }} title={`On-pace mark: ${formatMetric(view.expectedByToday, goal.metric, goal.unit)} by today`} />}
        </div>
      </button>

      {open && (
        <div className="px-3 sm:px-4 pb-4 space-y-3 animate-in fade-in duration-200">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {METRIC_INFO[goal.metric].label}, {formatLongDate(goal.startDate)} to {formatLongDate(goal.endDate)}.{active ? " The line on the bar marks where a steady pace would be today." : ""}
          </p>
          <NudgeBanner nudge={view.nudge} compact />
          {recent.length > 1 && (
            <div>
              <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Last {recent.length} days</div>
              <div className="flex items-end gap-[3px] h-10">
                {recent.map((d) => (
                  <div key={d.date} title={`${formatLongDate(d.date)}: ${formatMetric(d.value, goal.metric, goal.unit)}`} className={`flex-1 rounded-t-sm bg-gradient-to-t ${style.bar} ${d.date === today ? "opacity-100" : "opacity-60"}`} style={{ height: `${Math.max(4, (d.value / max) * 100)}%` }} />
                ))}
              </div>
            </div>
          )}
          <BadgeRow badges={view.badges} newIds={newBadgeIds} size="sm" />
          <div className="flex justify-end gap-1">
            <button onClick={() => onAsk(`Change my "${goal.title}" goal: `)} className="px-2 py-1 rounded-lg text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-emerald-600 hover:bg-emerald-500/10 transition-colors">
              Change goal
            </button>
            <RemoveButton label="Stop goal" onConfirm={onRemove} />
          </div>
        </div>
      )}
    </article>
  );
}
