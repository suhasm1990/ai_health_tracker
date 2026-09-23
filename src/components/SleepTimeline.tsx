"use client";

import { Calendar, Clock, Moon, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartEmpty, ChartLegend, TooltipBox, TooltipRow, type TooltipContent } from "@/components/ui/ChartTooltip";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { StatTile } from "@/components/ui/StatTile";
import { ViewToggle } from "@/components/ui/ViewToggle";
import { useChartTheme } from "@/hooks/useChartTheme";
import { GOALS, SLEEP_STAGE_COLORS } from "@/lib/constants";
import type { DailyMetricSummary, SleepStage } from "@/lib/types";
import { formatDuration, meanOf, restorativeMinutes, stageMinutes } from "@/lib/utils";

interface SleepTimelineProps {
  today: DailyMetricSummary;
  history: DailyMetricSummary[];
}

type View = "today" | "weekly";
const VIEWS = [
  { value: "today" as const, label: "Last Night", icon: Clock },
  { value: "weekly" as const, label: "7-Day Trend", icon: Calendar },
];
const STAGES: SleepStage[] = ["Deep", "REM", "Light", "Awake"];
const STAGE_TEXT: Record<SleepStage, string> = { Deep: "text-blue-500", REM: "text-purple-500", Light: "text-sky-400", Awake: "text-amber-400" };
const STAGE_SWATCH: Record<SleepStage, string> = { Deep: "bg-blue-500", REM: "bg-purple-500", Light: "bg-sky-400", Awake: "bg-amber-400" };
const LEGEND = [
  ...STAGES.map((s) => ({ label: `${s} Sleep`.replace("Awake Sleep", "Awake Time"), swatch: `w-2.5 h-2.5 rounded-full ${STAGE_SWATCH[s]}` })),
  { label: "Sleep Score (Right Axis)", swatch: "w-3 h-0.5 bg-pink-500" },
  { label: "7h Optimal Target", swatch: "w-3 h-0.5 bg-emerald-500 border-t border-dashed border-emerald-500" },
];

function scoreRating(score: number) {
  if (score >= 90) return { label: "Excellent", color: "text-emerald-500 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20" };
  if (score >= 80) return { label: "Good", color: "text-blue-500 dark:text-blue-400 bg-blue-500/10 border-blue-500/20" };
  if (score >= 70) return { label: "Fair", color: "text-amber-500 dark:text-amber-400 bg-amber-500/10 border-amber-500/20" };
  return { label: "Poor", color: "text-rose-500 dark:text-rose-400 bg-rose-500/10 border-rose-500/20" };
}

const hours = (minutes: number) => Number((minutes / 60).toFixed(1));

interface WeeklyPoint {
  label: string;
  day: DailyMetricSummary;
  Deep: number;
  REM: number;
  Light: number;
  Awake: number;
}

function WeeklyTooltip({ active, payload, label }: TooltipContent<WeeklyPoint>) {
  if (!active || !payload?.length) return null;
  const { day, ...point } = payload[0].payload;
  const rating = scoreRating(day.sleepScore);
  return (
    <TooltipBox className="min-w-[170px] space-y-2">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-1.5">
        <span className="font-semibold text-slate-800 dark:text-slate-200">Date: {label}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium border ${rating.color}`}>Score: {day.sleepScore}</span>
      </div>
      <div className="space-y-1">
        <TooltipRow label="Total Sleep" value={formatDuration(day.sleepDurationMinutes)} />
        {day.sleepStartTime && day.sleepEndTime && (
          <TooltipRow label="Schedule" value={`${day.sleepStartTime} – ${day.sleepEndTime}`} valueClass="font-semibold text-indigo-600 dark:text-indigo-400 font-mono text-[11px]" />
        )}
        {day.sleepEfficiency ? <TooltipRow label="Efficiency" value={`${day.sleepEfficiency}%`} valueClass="font-semibold text-emerald-600 dark:text-emerald-400" /> : null}
        {STAGES.filter((s) => s !== "Awake" || point.Awake > 0).map((s) => (
          <TooltipRow key={s} label={s} value={`${point[s]}h`} swatch={STAGE_SWATCH[s]} valueClass={`font-medium ${STAGE_TEXT[s]}`} />
        ))}
        {day.restingHeartRate && <TooltipRow label="Resting HR" value={`${day.restingHeartRate} bpm`} valueClass="text-rose-500" className="pt-1 border-t border-slate-100 dark:border-slate-800" />}
      </div>
    </TooltipBox>
  );
}

export function SleepTimeline({ today, history }: SleepTimelineProps) {
  const [view, setView] = useState<View>("today");
  const theme = useChartTheme();

  const duration = today.sleepDurationMinutes;
  const rating = scoreRating(today.sleepScore);
  const restorative = restorativeMinutes(today.sleepStages);
  const restorativePct = duration > 0 ? Math.round((restorative / duration) * 100) : 0;

  const nights = history.filter((h) => h.sleepDurationMinutes > 0);
  const weeklyAvgDuration = meanOf(nights, (h) => h.sleepDurationMinutes) ?? duration;
  const weeklyAvgScore = meanOf(nights, (h) => h.sleepScore) ?? today.sleepScore;
  const weeklyRating = scoreRating(weeklyAvgScore);
  const weeklyEfficiency = meanOf(nights, (h) => h.sleepEfficiency);
  const weeklyTotal = nights.reduce((sum, h) => sum + h.sleepDurationMinutes, 0);
  const weeklyRestorativePct = weeklyTotal > 0 ? Math.round((nights.reduce((sum, h) => sum + restorativeMinutes(h.sleepStages), 0) / weeklyTotal) * 100) : restorativePct;

  const weeklyData: WeeklyPoint[] = history.map((day) => ({
    label: day.label,
    day,
    Deep: hours(stageMinutes(day.sleepStages, "Deep")),
    REM: hours(stageMinutes(day.sleepStages, "REM")),
    Light: hours(stageMinutes(day.sleepStages, "Light")),
    Awake: hours(stageMinutes(day.sleepStages, "Awake")),
  }));

  const active = view === "today" ? { score: `Score: ${today.sleepScore}`, rating } : { score: `7D Avg Score: ${weeklyAvgScore}`, rating: weeklyRating };
  const tileIcon = { size: "lg" as const };

  return (
    <Panel>
      <PanelHeader icon={Moon} iconClass="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20" title="Sleep & Recovery" subtitle={view === "today" ? "Sleep stages & architecture analysis" : "7-Day sleep duration, score & restorative recovery"}>
        <ViewToggle value={view} options={VIEWS} onChange={setView} activeClass="bg-indigo-600" />
        <div className={`hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${active.rating.color}`}>
          <Sparkles className="w-3.5 h-3.5" />
          <span>
            {active.score} • {active.rating.label}
          </span>
        </div>
      </PanelHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-3 sm:mb-4 text-xs">
        {view === "today" ? (
          <>
            <StatTile {...tileIcon} icon={Clock} iconClass="text-indigo-500 dark:text-indigo-400" label="Total Sleep Time" value={formatDuration(duration)} sub={today.sleepStartTime && today.sleepEndTime ? `${today.sleepStartTime} – ${today.sleepEndTime}` : `Target: ${formatDuration(GOALS.sleepMinutes)}`} />
            <StatTile {...tileIcon} icon={Sparkles} iconClass="text-indigo-500 dark:text-indigo-400" label="Sleep Score" valueClass="text-indigo-600 dark:text-indigo-400" value={<>{today.sleepScore} <span className="text-xs font-normal text-slate-400">/ 100</span></>} sub={`${rating.label} Quality`} />
            <StatTile {...tileIcon} icon={ShieldCheck} iconClass="text-emerald-500 dark:text-emerald-400" label="Clinical Efficiency" valueClass="text-emerald-600 dark:text-emerald-400" value={today.sleepEfficiency ? `${today.sleepEfficiency}%` : "—"} sub="Time asleep vs in bed" />
            <StatTile {...tileIcon} icon={Zap} iconClass="text-purple-500 dark:text-purple-400" label="Deep + REM Restorative" valueClass="text-purple-600 dark:text-purple-400" value={`${restorativePct}%`} sub={`${formatDuration(restorative)} restorative`} />
          </>
        ) : (
          <>
            <StatTile {...tileIcon} icon={Clock} iconClass="text-indigo-500 dark:text-indigo-400" label="7-Day Daily Avg Sleep" value={formatDuration(weeklyAvgDuration)} sub="Across logged nights" />
            <StatTile {...tileIcon} icon={Sparkles} iconClass="text-indigo-500 dark:text-indigo-400" label="7-Day Avg Sleep Score" valueClass="text-indigo-600 dark:text-indigo-400" value={<>{weeklyAvgScore} <span className="text-xs font-normal text-slate-400">/ 100</span></>} sub={`${weeklyRating.label} Quality`} />
            <StatTile {...tileIcon} icon={ShieldCheck} iconClass="text-emerald-500 dark:text-emerald-400" label="7-Day Clinical Efficiency" valueClass="text-emerald-600 dark:text-emerald-400" value={weeklyEfficiency ? `${weeklyEfficiency}%` : "—"} sub="Average sleep consistency" />
            <StatTile {...tileIcon} icon={Zap} iconClass="text-purple-500 dark:text-purple-400" label="Restorative Deep + REM" valueClass="text-purple-600 dark:text-purple-400" value={`${weeklyRestorativePct}% Avg`} sub="Deep & REM sleep proportion" />
          </>
        )}
      </div>

      {view === "today" ? (
        today.sleepStages.length === 0 ? (
          <div className="h-24">
            <ChartEmpty message="No sleep session recorded for last night." />
          </div>
        ) : (
          <>
            <div className="mb-4">
              <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
                <span>
                  Sleep stages<span className="hidden sm:inline"> distribution (last night)</span>
                </span>
                <span>
                  {formatDuration(duration)}<span className="hidden sm:inline"> total (100% of cycle)</span>
                </span>
              </div>
              <div className="w-full h-4 rounded-full overflow-hidden flex bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700/50">
                {today.sleepStages.map((stage) => (
                  <div key={stage.stage} style={{ width: `${stage.percentage}%`, backgroundColor: SLEEP_STAGE_COLORS[stage.stage] }} className="h-full transition-all hover:opacity-90" title={`${stage.stage}: ${stage.durationMinutes}m (${stage.percentage}%)`} />
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
              {today.sleepStages.map((stage) => (
                <div key={stage.stage} className="bg-slate-50 dark:bg-slate-800/30 rounded-lg p-2 border border-slate-200 dark:border-slate-800/60">
                  <div className="flex items-center space-x-1.5 mb-1">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: SLEEP_STAGE_COLORS[stage.stage] }} />
                    <span className="text-slate-700 dark:text-slate-300 font-medium">{stage.stage}</span>
                  </div>
                  <div className="text-slate-500 dark:text-slate-400 text-[11px]">
                    {formatDuration(stage.durationMinutes)} ({stage.percentage}%)
                  </div>
                </div>
              ))}
            </div>
          </>
        )
      ) : (
        <div>
          <div className="h-52 sm:h-64 w-full mb-3">
            {nights.length === 0 ? (
              <ChartEmpty message="No sleep sessions recorded in the last 7 days." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={weeklyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
                  <XAxis dataKey="label" stroke={theme.axis} fontSize={11} tickLine={false} />
                  <YAxis stroke={theme.axis} fontSize={11} tickLine={false} domain={[0, 9]} tickFormatter={(v) => `${v}h`} />
                  <YAxis yAxisId="score" orientation="right" stroke="#EC4899" fontSize={11} tickLine={false} domain={[50, 100]} tickFormatter={(v) => `${v}pt`} />
                  <Tooltip content={<WeeklyTooltip />} />
                  <ReferenceLine y={7} stroke="#10B981" strokeDasharray="4 4" label={{ value: "7h Target", fill: "#059669", fontSize: 10, position: "left" }} />
                  {STAGES.map((s, i) => (
                    <Bar key={s} dataKey={s} stackId="sleep" fill={SLEEP_STAGE_COLORS[s]} name={s} radius={i === STAGES.length - 1 ? [4, 4, 0, 0] : undefined} />
                  ))}
                  <Line yAxisId="score" type="monotone" dataKey="day.sleepScore" stroke="#EC4899" strokeWidth={2.5} dot={{ r: 4, fill: "#EC4899" }} name="Sleep Score" />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
            <ChartLegend items={LEGEND} />
          </div>
        </div>
      )}
    </Panel>
  );
}
