"use client";

import { Calendar, Clock, Footprints } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartEmpty, TooltipBox, type TooltipContent } from "@/components/ui/ChartTooltip";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { StatTile } from "@/components/ui/StatTile";
import { ViewToggle } from "@/components/ui/ViewToggle";
import { useChartTheme } from "@/hooks/useChartTheme";
import type { DailyMetricSummary, IntradayStepPoint } from "@/lib/types";
import { meanOf } from "@/lib/utils";

interface StepChartProps {
  intradaySteps: IntradayStepPoint[];
  history: DailyMetricSummary[];
  stepGoal: number;
}

type View = "intraday" | "weekly";
const VIEWS = [
  { value: "intraday" as const, label: "Today (24h)", icon: Clock },
  { value: "weekly" as const, label: "7-Day Trend", icon: Calendar },
];
const MARGIN = { top: 10, right: 10, left: -20, bottom: 0 };

function StepTooltip({ active, payload, label, mode }: TooltipContent<unknown> & { mode: View }) {
  if (!active || !payload?.length) return null;
  return (
    <TooltipBox className="p-2.5!">
      <p className="text-slate-500 dark:text-slate-400 font-medium">{mode === "intraday" ? `Hour: ${label}` : `Day: ${label}`}</p>
      <p className="text-emerald-600 dark:text-emerald-400 font-bold text-sm">
        {(payload[0].value ?? 0).toLocaleString()} <span className="text-slate-400 text-xs">steps</span>
      </p>
    </TooltipBox>
  );
}

export function StepChart({ intradaySteps, history, stepGoal }: StepChartProps) {
  const [view, setView] = useState<View>("intraday");
  const theme = useChartTheme();

  const todayTotal = intradaySteps.reduce((sum, p) => sum + p.steps, 0);
  const peak = intradaySteps.reduce((max, p) => (p.steps > max.steps ? p : max), { time: "—", steps: 0 });
  const weeklyAvg = meanOf(history, (h) => h.steps) ?? 0;
  const hasData = view === "intraday" ? todayTotal > 0 : history.length > 0;

  return (
    <Panel>
      <PanelHeader icon={Footprints} iconClass="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" title="Step Activity" subtitle={view === "intraday" ? "Intraday hourly step distribution" : "7-Day historical step trend"}>
        <ViewToggle value={view} options={VIEWS} onChange={setView} />
      </PanelHeader>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-4 mb-3 sm:mb-4 text-xs">
        <StatTile label="Total Today" value={todayTotal.toLocaleString()} />
        <StatTile label="Peak Hour" value={`${peak.time} (${peak.steps.toLocaleString()})`} valueClass="text-emerald-600 dark:text-emerald-400" />
        <StatTile label="7-Day Daily Avg" value={weeklyAvg.toLocaleString()} valueClass="text-teal-600 dark:text-teal-400" className="col-span-2 sm:col-span-1" />
      </div>

      <div className="h-52 sm:h-64 w-full">
        {!hasData ? (
          <ChartEmpty message="No step data recorded yet today. Sync your device to see hourly activity." />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {view === "intraday" ? (
              <BarChart data={intradaySteps} margin={MARGIN}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
                <XAxis dataKey="time" stroke={theme.axis} fontSize={11} tickLine={false} interval={3} />
                <YAxis stroke={theme.axis} fontSize={11} tickLine={false} />
                <Tooltip content={<StepTooltip mode={view} />} />
                <Bar dataKey="steps" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            ) : (
              <BarChart data={history} margin={MARGIN}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
                <XAxis dataKey="label" stroke={theme.axis} fontSize={11} tickLine={false} />
                <YAxis stroke={theme.axis} fontSize={11} tickLine={false} />
                <Tooltip content={<StepTooltip mode={view} />} />
                <ReferenceLine y={stepGoal} stroke="#3B82F6" strokeDasharray="4 4" label={{ value: `${Math.round(stepGoal / 1000)}k Goal`, fill: "#3B82F6", fontSize: 10, position: "right" }} />
                <Bar dataKey="steps" fill="#14B8A6" radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </Panel>
  );
}
