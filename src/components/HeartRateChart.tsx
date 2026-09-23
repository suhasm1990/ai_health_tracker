"use client";

import { Calendar, Clock, Heart } from "lucide-react";
import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartEmpty, ChartLegend, TooltipBox, TooltipRow, type TooltipContent } from "@/components/ui/ChartTooltip";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { StatTile } from "@/components/ui/StatTile";
import { ViewToggle } from "@/components/ui/ViewToggle";
import { useChartTheme } from "@/hooks/useChartTheme";
import type { DailyMetricSummary, IntradayHeartRatePoint } from "@/lib/types";
import { meanOf, withUnit } from "@/lib/utils";

interface HeartRateChartProps {
  intradayHeartRate: IntradayHeartRatePoint[];
  history: DailyMetricSummary[];
  today: DailyMetricSummary;
}

type View = "intraday" | "weekly";
const VIEWS = [
  { value: "intraday" as const, label: "Today (24h)", icon: Clock },
  { value: "weekly" as const, label: "7-Day Trend", icon: Calendar },
];
const MARGIN = { top: 10, right: 10, left: -20, bottom: 0 };
const LEGEND = [
  { label: "Daily Avg HR", swatch: "w-2.5 h-2.5 rounded-full bg-rose-500" },
  { label: "Resting HR", swatch: "w-2.5 h-0.5 bg-sky-400 border-t border-dashed border-sky-400" },
  { label: "Peak HR", swatch: "w-2.5 h-0.5 bg-amber-500 border-t border-dotted border-amber-500" },
];

function IntradayTooltip({ active, payload, label }: TooltipContent<IntradayHeartRatePoint>) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <TooltipBox className="p-2.5!">
      <p className="text-slate-500 dark:text-slate-400 font-medium">Time: {label}</p>
      <p className="text-rose-500 dark:text-rose-400 font-bold text-sm">
        {point.bpm} <span className="text-slate-400 text-xs">bpm</span>
      </p>
      <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium">Zone: {point.zone}</span>
    </TooltipBox>
  );
}

function WeeklyTooltip({ active, payload, label }: TooltipContent<DailyMetricSummary>) {
  if (!active || !payload?.length) return null;
  const day = payload[0].payload;
  return (
    <TooltipBox className="min-w-[140px]">
      <p className="text-slate-700 dark:text-slate-300 font-semibold border-b border-slate-100 dark:border-slate-800 pb-1">Date: {label}</p>
      <TooltipRow label="Daily Avg" value={withUnit(day.avgHeartRate, "bpm")} swatch="bg-rose-500" valueClass="text-rose-600 dark:text-rose-400" />
      <TooltipRow label="Resting" value={withUnit(day.restingHeartRate, "bpm")} swatch="bg-sky-400" valueClass="text-sky-500" />
      <TooltipRow label="Peak" value={withUnit(day.maxHeartRate, "bpm")} swatch="bg-amber-500" valueClass="text-amber-500" />
    </TooltipBox>
  );
}

export function HeartRateChart({ intradayHeartRate, history, today }: HeartRateChartProps) {
  const [view, setView] = useState<View>("intraday");
  const theme = useChartTheme();

  const weeklyAvg = meanOf(history, (h) => h.avgHeartRate) ?? today.avgHeartRate;
  const weeklyResting = meanOf(history, (h) => h.restingHeartRate) ?? today.restingHeartRate;
  const weeklyPeak = Math.max(...history.map((h) => h.maxHeartRate ?? 0), today.maxHeartRate ?? 0) || null;
  const hasData = view === "intraday" ? intradayHeartRate.some((p) => p.bpm > 0) : history.length > 0;

  const tiles =
    view === "intraday"
      ? [
          { label: "Resting HR", value: withUnit(today.restingHeartRate, "bpm"), valueClass: "text-slate-800 dark:text-slate-200" },
          { label: "Average HR", value: withUnit(today.avgHeartRate, "bpm"), valueClass: "text-rose-600 dark:text-rose-400" },
          { label: "Peak Today", value: withUnit(today.maxHeartRate, "bpm"), valueClass: "text-amber-600 dark:text-amber-400" },
        ]
      : [
          { label: "7-Day Avg Resting", value: withUnit(weeklyResting, "bpm"), valueClass: "text-sky-600 dark:text-sky-400" },
          { label: "7-Day Avg HR", value: withUnit(weeklyAvg, "bpm"), valueClass: "text-rose-600 dark:text-rose-400" },
          { label: "7-Day Peak HR", value: withUnit(weeklyPeak, "bpm"), valueClass: "text-amber-600 dark:text-amber-400" },
        ];

  return (
    <Panel>
      <PanelHeader icon={Heart} iconClass="bg-rose-500/10 text-rose-500 dark:text-rose-400 border-rose-500/20" title="Heart Rate" subtitle={view === "intraday" ? "Intraday 24h continuous readings" : "7-Day resting, avg & peak heart rate"}>
        <ViewToggle value={view} options={VIEWS} onChange={setView} activeClass="bg-rose-600" />
      </PanelHeader>

      <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-3 sm:mb-4 text-xs">
        {tiles.map((tile) => (
          <StatTile key={tile.label} {...tile} />
        ))}
      </div>

      <div className="h-52 sm:h-64 w-full">
        {!hasData ? (
          <ChartEmpty message="No heart rate readings synced for today yet." />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {view === "intraday" ? (
              <AreaChart data={intradayHeartRate} margin={MARGIN}>
                <defs>
                  <linearGradient id="hr-intraday" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F43F5E" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#F43F5E" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
                <XAxis dataKey="time" stroke={theme.axis} fontSize={11} tickLine={false} interval={3} />
                <YAxis stroke={theme.axis} fontSize={11} tickLine={false} domain={[40, 160]} />
                <Tooltip content={<IntradayTooltip />} />
                {today.restingHeartRate && (
                  <ReferenceLine y={today.restingHeartRate} stroke="#38BDF8" strokeDasharray="3 3" label={{ value: "Resting", fill: "#0284C7", fontSize: 10, position: "left" }} />
                )}
                <Area type="monotone" dataKey="bpm" stroke="#F43F5E" strokeWidth={2} fill="url(#hr-intraday)" />
              </AreaChart>
            ) : (
              <ComposedChart data={history} margin={MARGIN}>
                <defs>
                  <linearGradient id="hr-weekly" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F43F5E" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#F43F5E" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
                <XAxis dataKey="label" stroke={theme.axis} fontSize={11} tickLine={false} />
                <YAxis stroke={theme.axis} fontSize={11} tickLine={false} domain={[40, 180]} />
                <Tooltip content={<WeeklyTooltip />} />
                {weeklyResting && <ReferenceLine y={weeklyResting} stroke="#38BDF8" strokeDasharray="3 3" label={{ value: "Avg Resting", fill: "#0284C7", fontSize: 10, position: "left" }} />}
                <Area type="monotone" name="Daily Avg" dataKey="avgHeartRate" stroke="#F43F5E" strokeWidth={2.5} fill="url(#hr-weekly)" />
                <Line type="monotone" name="Resting HR" dataKey="restingHeartRate" stroke="#38BDF8" strokeWidth={2} strokeDasharray="3 3" dot={{ r: 3.5, fill: "#38BDF8" }} />
                <Line type="monotone" name="Peak HR" dataKey="maxHeartRate" stroke="#F59E0B" strokeWidth={1.5} strokeDasharray="2 2" dot={{ r: 3, fill: "#F59E0B" }} />
              </ComposedChart>
            )}
          </ResponsiveContainer>
        )}
      </div>

      {view === "weekly" && <ChartLegend items={LEGEND} />}
    </Panel>
  );
}
