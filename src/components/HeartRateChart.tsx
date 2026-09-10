"use client";

import React, { useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { Heart, Activity, Clock, Calendar } from "lucide-react";
import { IntradayHeartRatePoint, DailyMetricSummary } from "@/lib/types";
import { useTheme } from "@/lib/themeContext";

interface HeartRateChartProps {
  intradayHeartRate: IntradayHeartRatePoint[];
  history?: DailyMetricSummary[];
  restingHeartRate: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
}

export const HeartRateChart: React.FC<HeartRateChartProps> = ({
  intradayHeartRate,
  history = [],
  restingHeartRate = null,
  avgHeartRate = null,
  maxHeartRate = null,
}) => {
  const [viewMode, setViewMode] = useState<"intraday" | "weekly">("intraday");
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const gridStroke = isDark ? "#1E293B" : "#E2E8F0";
  const axisStroke = isDark ? "#64748B" : "#94A3B8";

  // Compute 7-day statistics
  const validHistory = history.filter((h) => h.avgHeartRate && h.avgHeartRate > 0);
  const weeklyAvgBpm = validHistory.length
    ? Math.round(validHistory.reduce((sum, h) => sum + (h.avgHeartRate || 0), 0) / validHistory.length)
    : avgHeartRate;

  const weeklyRestingPts = history.filter((h) => h.restingHeartRate && h.restingHeartRate > 0);
  const weeklyAvgResting = weeklyRestingPts.length
    ? Math.round(weeklyRestingPts.reduce((sum, h) => sum + (h.restingHeartRate || 0), 0) / weeklyRestingPts.length)
    : restingHeartRate;

  const weeklyPeakBpm = Math.max(
    ...history.map((h) => h.maxHeartRate || 0),
    maxHeartRate || 0
  );

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      if (viewMode === "intraday") {
        const data = payload[0].payload as IntradayHeartRatePoint;
        return (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2.5 rounded-xl shadow-xl text-xs">
            <p className="text-slate-500 dark:text-slate-400 font-medium">Time: {label}</p>
            <p className="text-rose-500 dark:text-rose-400 font-bold text-sm mt-0.5">
              {data.bpm} <span className="text-slate-400 text-xs">bpm</span>
            </p>
            <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium">
              Zone: {data.zone}
            </span>
          </div>
        );
      } else {
        const dayData = payload[0].payload as DailyMetricSummary;
        return (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-xl shadow-xl text-xs space-y-1.5 min-w-[140px]">
            <p className="text-slate-700 dark:text-slate-300 font-semibold border-b border-slate-100 dark:border-slate-800 pb-1">
              Date: {label}
            </p>
            <div className="flex items-center justify-between">
              <span className="flex items-center space-x-1.5 text-slate-500 dark:text-slate-400">
                <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
                <span>Daily Avg:</span>
              </span>
              <span className="font-bold text-rose-600 dark:text-rose-400">
                {dayData.avgHeartRate ?? "—"} bpm
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center space-x-1.5 text-slate-500 dark:text-slate-400">
                <span className="w-2 h-2 rounded-full bg-sky-400 inline-block" />
                <span>Resting:</span>
              </span>
              <span className="font-bold text-sky-500">
                {dayData.restingHeartRate ?? "—"} bpm
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center space-x-1.5 text-slate-500 dark:text-slate-400">
                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                <span>Peak:</span>
              </span>
              <span className="font-bold text-amber-500">
                {dayData.maxHeartRate ?? "—"} bpm
              </span>
            </div>
          </div>
        );
      }
    }
    return null;
  };

  return (
    <div className="bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col justify-between shadow-xs transition-colors duration-200">
      <div>
        {/* Header with Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-500 dark:text-rose-400 border border-rose-500/20">
              <Heart className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">Heart Rate</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {viewMode === "intraday" ? "Intraday 24h continuous readings" : "7-Day resting, avg & peak heart rate"}
              </p>
            </div>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800/80 rounded-lg p-1 border border-slate-200 dark:border-slate-700/60 self-start sm:self-auto">
            <button
              onClick={() => setViewMode("intraday")}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                viewMode === "intraday"
                  ? "bg-rose-600 text-white shadow-xs"
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
                  ? "bg-rose-600 text-white shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>7-Day Trend</span>
            </button>
          </div>
        </div>

        {/* Dynamic Highlight Cards */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-4 text-xs">
          {viewMode === "intraday" ? (
            <>
              <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-2.5 border border-slate-200 dark:border-slate-800">
                <span className="text-slate-500 block">Resting HR</span>
                <span className="text-base font-bold text-slate-800 dark:text-slate-200">
                  {restingHeartRate !== null ? `${restingHeartRate} bpm` : "—"}
                </span>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-2.5 border border-slate-200 dark:border-slate-800">
                <span className="text-slate-500 block">Average HR</span>
                <span className="text-base font-bold text-rose-600 dark:text-rose-400">
                  {avgHeartRate !== null ? `${avgHeartRate} bpm` : "—"}
                </span>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-2.5 border border-slate-200 dark:border-slate-800">
                <span className="text-slate-500 block">Peak Today</span>
                <span className="text-base font-bold text-amber-600 dark:text-amber-400">
                  {maxHeartRate !== null ? `${maxHeartRate} bpm` : "—"}
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-2.5 border border-slate-200 dark:border-slate-800">
                <span className="text-slate-500 block">7-Day Avg Resting</span>
                <span className="text-base font-bold text-sky-600 dark:text-sky-400">
                  {weeklyAvgResting !== null ? `${weeklyAvgResting} bpm` : "—"}
                </span>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-2.5 border border-slate-200 dark:border-slate-800">
                <span className="text-slate-500 block">7-Day Avg HR</span>
                <span className="text-base font-bold text-rose-600 dark:text-rose-400">
                  {weeklyAvgBpm !== null ? `${weeklyAvgBpm} bpm` : "—"}
                </span>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-2.5 border border-slate-200 dark:border-slate-800">
                <span className="text-slate-500 block">7-Day Peak HR</span>
                <span className="text-base font-bold text-amber-600 dark:text-amber-400">
                  {weeklyPeakBpm ? `${weeklyPeakBpm} bpm` : "—"}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Chart Canvas */}
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            {viewMode === "intraday" ? (
              <AreaChart data={intradayHeartRate} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorBpm" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F43F5E" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#F43F5E" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis dataKey="time" stroke={axisStroke} fontSize={11} tickLine={false} interval={3} />
                <YAxis stroke={axisStroke} fontSize={11} tickLine={false} domain={[40, 160]} />
                <Tooltip content={<CustomTooltip />} />
                {restingHeartRate && (
                  <ReferenceLine
                    y={restingHeartRate}
                    stroke="#38BDF8"
                    strokeDasharray="3 3"
                    label={{ value: "Resting", fill: "#0284C7", fontSize: 10, position: "left" }}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="bpm"
                  stroke="#F43F5E"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorBpm)"
                />
              </AreaChart>
            ) : (
              <ComposedChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorAvgBpm" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F43F5E" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#F43F5E" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis dataKey="date" stroke={axisStroke} fontSize={11} tickLine={false} />
                <YAxis stroke={axisStroke} fontSize={11} tickLine={false} domain={[40, 180]} />
                <Tooltip content={<CustomTooltip />} />
                {weeklyAvgResting !== null && (
                  <ReferenceLine
                    y={weeklyAvgResting}
                    stroke="#38BDF8"
                    strokeDasharray="3 3"
                    label={{ value: "Avg Resting", fill: "#0284C7", fontSize: 10, position: "left" }}
                  />
                )}
                <Area
                  type="monotone"
                  name="Daily Avg"
                  dataKey="avgHeartRate"
                  stroke="#F43F5E"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#colorAvgBpm)"
                />
                <Line
                  type="monotone"
                  name="Resting HR"
                  dataKey="restingHeartRate"
                  stroke="#38BDF8"
                  strokeWidth={2}
                  strokeDasharray="3 3"
                  dot={{ r: 3.5, fill: "#38BDF8" }}
                />
                <Line
                  type="monotone"
                  name="Peak HR"
                  dataKey="maxHeartRate"
                  stroke="#F59E0B"
                  strokeWidth={1.5}
                  strokeDasharray="2 2"
                  dot={{ r: 3, fill: "#F59E0B" }}
                />
              </ComposedChart>
            )}
          </ResponsiveContainer>
        </div>

        {/* Weekly Mode Legend Pills */}
        {viewMode === "weekly" && (
          <div className="flex items-center justify-center space-x-4 mt-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
              <span>Daily Avg HR</span>
            </span>
            <span className="flex items-center space-x-1.5">
              <span className="w-2.5 h-0.5 bg-sky-400 inline-block border-t border-dashed border-sky-400" />
              <span>Resting HR</span>
            </span>
            <span className="flex items-center space-x-1.5">
              <span className="w-2.5 h-0.5 bg-amber-500 inline-block border-t border-dotted border-amber-500" />
              <span>Peak HR</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

