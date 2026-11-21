"use client";

import { Gauge, MessageCircle } from "lucide-react";
import { useMemo } from "react";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Ring } from "@/components/ui/Ring";
import type { DayPlan } from "@/lib/coach/dayPlan";
import { dailyLoad, effortScore, MIN_BALANCE_DAYS, type BalanceState } from "@/lib/effort";
import type { DailyMetricSummary, PersonalBaseline } from "@/lib/types";

interface LoadPanelProps {
  plan: DayPlan;
  history: DailyMetricSummary[];
  baseline: PersonalBaseline;
  onAsk: (prompt: string) => void;
}

const BALANCE_ZONES: { state: BalanceState; from: number; to: number; className: string; label: string }[] = [
  { state: "easing", from: 0.5, to: 0.8, className: "bg-sky-400/50", label: "Easing" },
  { state: "maintaining", from: 0.8, to: 1.1, className: "bg-emerald-400/60", label: "Maintaining" },
  { state: "building", from: 1.1, to: 1.3, className: "bg-teal-500/70", label: "Building" },
  { state: "overreaching", from: 1.3, to: 1.7, className: "bg-rose-400/60", label: "Overreaching" },
];
const SCALE_MIN = 0.5;
const SCALE_MAX = 1.7;
const at = (ratio: number) => ((Math.max(SCALE_MIN, Math.min(SCALE_MAX, ratio)) - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100;

/** Today's effort against its target, a week of effort, and this week's load against the usual. */
export function LoadPanel({ plan, history, baseline, onAsk }: LoadPanelProps) {
  const { effort, balance } = plan;
  const week = useMemo(() => history.slice(-7).map((d) => ({ date: d.date, label: d.label, score: effortScore(dailyLoad(d)) })), [history]);
  const storedDays = baseline.source === "stored" ? baseline.days : 0;

  return (
    <Panel>
      <PanelHeader icon={Gauge} iconClass="bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20" title="Effort & training load" subtitle="How hard you've worked, and whether this week is building fitness">
        <button
          onClick={() => onAsk("How hard should I train today, and how does my training load this week compare with usual?")}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:border-emerald-500 transition-colors"
        >
          <MessageCircle className="w-3.5 h-3.5 text-emerald-500" />
          Ask the coach
        </button>
      </PanelHeader>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Today */}
        <div className="flex items-center gap-4">
          <Ring value={effort.score} band={effort.target} size={104} stroke={11} colorClass="text-orange-500" label={`Effort ${effort.score} of 100`}>
            <span className="text-3xl font-bold tabular-nums text-slate-900 dark:text-white leading-none">{effort.score}</span>
            <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 mt-1">effort</span>
          </Ring>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900 dark:text-white">
              Target {effort.target[0]}–{effort.target[1]}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{effort.advice}</p>
            <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">Shaded arc = today&apos;s target, set from readiness.</p>
          </div>
        </div>

        {/* Week */}
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Last 7 days</div>
          <div className="mt-3 h-24 flex items-end gap-2">
            {week.map((d) => (
              <div key={d.date} className="flex-1 h-full flex flex-col justify-end items-center gap-1" title={`${d.label}: effort ${d.score}`}>
                <span className="text-[10px] tabular-nums text-slate-500 dark:text-slate-400">{d.score}</span>
                <div className="w-full max-w-8 rounded-t-md bg-gradient-to-t from-orange-500 to-amber-400" style={{ height: `${Math.max(4, d.score)}%` }} />
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-2">
            {week.map((d) => (
              <span key={d.date} className="flex-1 text-center text-[10px] text-slate-500 dark:text-slate-400">
                {d.label}
              </span>
            ))}
          </div>
        </div>

        {/* Balance */}
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">This week vs your usual</div>
          {balance ? (
            <>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-xl font-bold text-slate-900 dark:text-white">{balance.label}</span>
                <span className="text-sm tabular-nums text-slate-500 dark:text-slate-400">{Math.round(balance.ratio * 100)}% of usual</span>
              </div>
              <div className="mt-3 relative h-2.5 rounded-full overflow-hidden flex">
                {BALANCE_ZONES.map((z) => (
                  <div key={z.state} className={z.className} style={{ width: `${at(z.to) - at(z.from)}%` }} />
                ))}
              </div>
              <div className="relative h-3">
                <div className="absolute -top-4 -translate-x-1/2 w-1 h-5 rounded-full bg-slate-900 dark:bg-white shadow" style={{ left: `${at(balance.ratio)}%` }} />
              </div>
              <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">{balance.detail}</p>
            </>
          ) : (
            <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Needs {MIN_BALANCE_DAYS} days of stored history to compare this week with your usual
              {storedDays ? ` (${storedDays} so far)` : ". Connect your account with a database to turn it on"}.
            </p>
          )}
        </div>
      </div>
    </Panel>
  );
}
