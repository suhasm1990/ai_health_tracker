"use client";

import { Activity, AlertTriangle, CheckCircle2, MessageCircle } from "lucide-react";
import { useMemo } from "react";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { baselineLabel } from "@/lib/baseline";
import type { DailyMetricSummary, PersonalBaseline } from "@/lib/types";
import { formatVital, MIN_RANGE_NIGHTS, vitalReadings, type VitalReading } from "@/lib/vitals";

interface VitalsPanelProps {
  today: DailyMetricSummary;
  history: DailyMetricSummary[];
  baseline: PersonalBaseline;
  onAsk: (prompt: string) => void;
}

/** Track spans the personal range plus room either side, so the dot can land outside it. */
function RangeTrack({ reading }: { reading: VitalReading }) {
  const { range, value } = reading;
  if (!range) return <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800" />;
  const half = (range.high - range.low) / 2;
  const min = range.low - half * 1.5;
  const max = range.high + half * 1.5;
  const at = (v: number) => `${Math.max(2, Math.min(98, ((v - min) / (max - min)) * 100))}%`;
  const dot = reading.flagged ? "bg-amber-500 ring-amber-500/30" : "bg-slate-900 dark:bg-white ring-slate-900/10 dark:ring-white/20";
  return (
    <div className="relative h-2 rounded-full bg-slate-100 dark:bg-slate-800">
      <div className="absolute inset-y-0 rounded-full bg-emerald-500/25 dark:bg-emerald-400/25" style={{ left: at(range.low), right: `calc(100% - ${at(range.high)})` }} />
      {value !== null && <div className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full ring-4 ${dot}`} style={{ left: at(value) }} />}
    </div>
  );
}

const statusText = (r: VitalReading) => {
  switch (r.status) {
    case "within":
      return "Within your normal";
    case "above":
      return "Above your normal";
    case "below":
      return "Below your normal";
    case "learning":
      return `Learning your range (${r.nights}/${MIN_RANGE_NIGHTS} nights)`;
    default:
      return "No reading last night";
  }
};

/** Overnight vitals on personal ranges, so "is anything off?" is answered at a glance. */
export function VitalsPanel({ today, history, baseline, onAsk }: VitalsPanelProps) {
  const readings = useMemo(() => vitalReadings(today, history, baseline), [today, history, baseline]);
  const flagged = readings.filter((r) => r.flagged);
  const measured = readings.filter((r) => r.range && r.value !== null);

  return (
    <Panel>
      <PanelHeader
        icon={Activity}
        iconClass="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
        title="Vitals"
        subtitle={`Last night against your own ${baselineLabel(baseline)} normal range`}
      >
        {measured.length > 0 &&
          (flagged.length ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30">
              <AlertTriangle className="w-3.5 h-3.5" />
              {flagged.length} outside normal
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
              <CheckCircle2 className="w-3.5 h-3.5" />
              All within normal
            </span>
          ))}
      </PanelHeader>

      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {readings.map((r) => (
          <li key={r.info.key} className="py-3 grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[12rem_minmax(0,1fr)_9rem] items-center gap-x-4 gap-y-2">
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{r.info.label}</div>
              <div className={`text-xs ${r.flagged ? "text-amber-600 dark:text-amber-400 font-medium" : "text-slate-500 dark:text-slate-400"}`}>{statusText(r)}</div>
            </div>
            <div className="text-right sm:order-last">
              <span className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">{r.value === null ? "—" : formatVital(r.value, r.info)}</span>
              <span className="ml-1 text-xs text-slate-500 dark:text-slate-400">{r.info.unit}</span>
              {r.range && (
                <div className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
                  normal {formatVital(r.range.low, r.info)}–{formatVital(r.range.high, r.info)}
                </div>
              )}
            </div>
            <div className="col-span-2 sm:col-span-1">
              <RangeTrack reading={r} />
            </div>
          </li>
        ))}
      </ul>

      {flagged.length > 0 && (
        <button
          onClick={() => onAsk(`My ${flagged.map((r) => r.info.label.toLowerCase()).join(" and ")} ${flagged.length > 1 ? "are" : "is"} outside my normal range. What could cause that and what should I do today?`)}
          className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:border-emerald-500 transition-colors"
        >
          <MessageCircle className="w-3.5 h-3.5 text-emerald-500" />
          Ask the coach what this means
        </button>
      )}
    </Panel>
  );
}
