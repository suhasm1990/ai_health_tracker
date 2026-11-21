"use client";

import { AlarmClock, BedDouble, Repeat } from "lucide-react";
import { useMemo } from "react";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Ring } from "@/components/ui/Ring";
import { GOALS } from "@/lib/constants";
import { humanMinutes } from "@/lib/coach/dayPlan";
import { sleepHabits } from "@/lib/sleepHabits";
import type { DailyMetricSummary } from "@/lib/types";

const consistencyWord = (s: number) => (s >= 85 ? "Very regular" : s >= 70 ? "Fairly regular" : s >= 50 ? "Irregular" : "Very irregular");

/** Bed and wake regularity plus a week of sleep debt. */
export function SleepHabitsPanel({ history }: { history: DailyMetricSummary[] }) {
  const habits = useMemo(() => sleepHabits(history), [history]);
  const maxMinutes = Math.max(GOALS.sleepMinutes + 60, ...habits.nights.map((n) => n.minutes));
  const goalPct = (GOALS.sleepMinutes / maxMinutes) * 100;

  return (
    <Panel>
      <PanelHeader icon={Repeat} iconClass="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20" title="Sleep rhythm" subtitle="How regular your sleep is, and how much you owe" />
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="flex items-center gap-4">
          <Ring value={habits.consistency} size={96} stroke={10} colorClass="text-indigo-500" label={habits.consistency === null ? "Consistency not available yet" : `Consistency ${habits.consistency} of 100`}>
            <span className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white leading-none">{habits.consistency ?? "—"}</span>
          </Ring>
          <div className="min-w-0 space-y-1.5 text-sm">
            <div className="font-semibold text-slate-900 dark:text-white">{habits.consistency === null ? "Need 4 nights of sleep times" : consistencyWord(habits.consistency)}</div>
            {habits.typicalBedtime && (
              <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                <BedDouble className="w-3.5 h-3.5 text-indigo-500" />
                Bed ~{habits.typicalBedtime}
                {habits.bedtimeSpreadMin !== null && <span className="text-slate-400 dark:text-slate-500">± {habits.bedtimeSpreadMin} min</span>}
              </div>
            )}
            {habits.typicalWake && (
              <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                <AlarmClock className="w-3.5 h-3.5 text-amber-500" />
                Up ~{habits.typicalWake}
                {habits.wakeSpreadMin !== null && <span className="text-slate-400 dark:text-slate-500">± {habits.wakeSpreadMin} min</span>}
              </div>
            )}
            <p className="text-xs text-slate-500 dark:text-slate-400">Going to bed and waking within about 30 minutes each day helps you fall asleep faster and wake up fresher.</p>
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Sleep debt, last {habits.nights.length} nights</span>
            <span className={`text-sm font-bold tabular-nums ${habits.debtMinutes >= 120 ? "text-amber-600 dark:text-amber-400" : "text-slate-900 dark:text-white"}`}>
              {habits.debtMinutes ? humanMinutes(habits.debtMinutes) : "None"}
            </span>
          </div>
          <div className="mt-3 relative h-28 flex items-end gap-2">
            <div className="absolute inset-x-0 border-t border-dashed border-slate-300 dark:border-slate-600" style={{ bottom: `${goalPct}%` }}>
              <span className="absolute right-0 -top-4 text-[10px] text-slate-400">8h</span>
            </div>
            {habits.nights.map((n) => (
              <div key={n.date} className="flex-1 flex flex-col items-center justify-end h-full" title={`${n.label}: ${humanMinutes(n.minutes)}${n.shortfall ? `, ${humanMinutes(n.shortfall)} short` : ""}`}>
                <div className={`w-full max-w-8 rounded-t-md ${n.shortfall > 30 ? "bg-amber-400/80" : "bg-indigo-500/80"}`} style={{ height: `${(n.minutes / maxMinutes) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-2">
            {habits.nights.map((n) => (
              <span key={n.date} className="flex-1 text-center text-[10px] text-slate-500 dark:text-slate-400">
                {n.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}
