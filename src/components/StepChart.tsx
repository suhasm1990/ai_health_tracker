"use client";

import React, { useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { Footprints, TrendingUp, Clock, Calendar } from "lucide-react";
import { IntradayStepPoint, DailyMetricSummary } from "@/lib/types";
import { useTheme } from "@/lib/themeContext";

interface StepChartProps {
  intradaySteps: IntradayStepPoint[];
  history: DailyMetricSummary[];
  stepGoal?: number;
}

export const StepChart: React.FC<StepChartProps> = ({
  intradaySteps,
  history,
  stepGoal = 10000,
}) => {
  const [viewMode, setViewMode] = useState<"intraday" | "weekly">("intraday");
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const gridStroke = isDark ? "#1E293B" : "#E2E8F0";
  const axisStroke = isDark ? "#64748B" : "#94A3B8";

  // Calculate statistics
  const todayTotal = intradaySteps.reduce((sum, p) => sum + p.steps, 0);
  const peakHour = intradaySteps.reduce(
    (max, p) => (p.steps > max.steps ? p : max),
    { time: "—", steps: 0 }
  );

  const weeklyAvg = Math.round(
    history.reduce((sum, h) => sum + h.steps, 0) / (history.length || 1)
  );

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2.5 rounded-xl shadow-xl text-xs">
          <p className="text-slate-500 dark:text-slate-400 font-medium">{viewMode === "intraday" ? `Hour: ${label}` : `Day: ${label}`}</p>
          <p className="text-emerald-600 dark:text-emerald-400 font-bold text-sm mt-0.5">
            {payload[0].value.toLocaleString()} <span className="text-slate-400 text-xs">steps</span>
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col justify-between shadow-xs transition-colors duration-200">
      <div>
        {/* Header with Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <Footprints className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">Step Activity</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {viewMode === "intraday" ? "Intraday hourly step distribution" : "7-Day historical step trend"}
              </p>
            </div>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800/80 rounded-lg p-1 border border-slate-200 dark:border-slate-700/60 self-start sm:self-auto">
            <button
              onClick={() => setViewMode("intraday")}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                viewMode === "intraday"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Today (24h)</span>
            </button>
            <button
              onClick={() => setViewMode("weekly")}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                viewMode === "weekly"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>7-Day Trend</span>
            </button>
          </div>
        </div>

        {/* Quick Highlights */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-4 mb-4 text-xs">
          <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-2.5 border border-slate-200 dark:border-slate-800">
            <span className="text-slate-500 block">Total Today</span>
            <span className="text-base font-bold text-slate-900 dark:text-white">{todayTotal.toLocaleString()}</span>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-2.5 border border-slate-200 dark:border-slate-800">
            <span className="text-slate-500 block">Peak Hour</span>
            <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
              {peakHour.time} ({peakHour.steps.toLocaleString()})
            </span>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-2.5 border border-slate-200 dark:border-slate-800 col-span-2 sm:col-span-1">
            <span className="text-slate-500 block">7-Day Daily Avg</span>
            <span className="text-base font-bold text-teal-600 dark:text-teal-400">{weeklyAvg.toLocaleString()}</span>
          </div>
        </div>

        {/* Chart Canvas */}
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            {viewMode === "intraday" ? (
              <BarChart data={intradaySteps} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis
                  dataKey="time"
                  stroke={axisStroke}
                  fontSize={11}
                  tickLine={false}
                  interval={3}
                />
                <YAxis stroke={axisStroke} fontSize={11} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="steps" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            ) : (
              <BarChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis dataKey="date" stroke={axisStroke} fontSize={11} tickLine={false} />
                <YAxis stroke={axisStroke} fontSize={11} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine
                  y={stepGoal}
                  stroke="#3B82F6"
                  strokeDasharray="4 4"
                  label={{ value: "10k Goal", fill: "#3B82F6", fontSize: 10, position: "right" }}
                />
                <Bar dataKey="steps" fill="#14B8A6" radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
