"use client";

import React, { useState } from "react";
import {
  Moon,
  Sparkles,
  Clock,
  ShieldCheck,
  Calendar,
  Activity,
  Zap,
} from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { SleepStageSegment, DailyMetricSummary } from "@/lib/types";
import { useTheme } from "@/lib/themeContext";

interface SleepTimelineProps {
  durationMinutes: number;
  sleepScore: number;
  sleepEfficiency?: number;
  sleepStages: SleepStageSegment[];
  history?: DailyMetricSummary[];
}

export const SleepTimeline: React.FC<SleepTimelineProps> = ({
  durationMinutes,
  sleepScore,
  sleepEfficiency,
  sleepStages,
  history = [],
}) => {
  const [viewMode, setViewMode] = useState<"today" | "weekly">("today");
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const gridStroke = isDark ? "#1E293B" : "#E2E8F0";
  const axisStroke = isDark ? "#64748B" : "#94A3B8";

  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;

  const getScoreRating = (score: number) => {
    if (score >= 90)
      return {
        label: "Excellent",
        color: "text-emerald-500 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
      };
    if (score >= 80)
      return {
        label: "Good",
        color: "text-blue-500 dark:text-blue-400 bg-blue-500/10 border-blue-500/20",
      };
    if (score >= 70)
      return {
        label: "Fair",
        color: "text-amber-500 dark:text-amber-400 bg-amber-500/10 border-amber-500/20",
      };
    return {
      label: "Poor",
      color: "text-rose-500 dark:text-rose-400 bg-rose-500/10 border-rose-500/20",
    };
  };

  const rating = getScoreRating(sleepScore);

  // Compute today's deep and rem restorative minutes
  const todayDeepMins = sleepStages.find((s) => s.stage === "Deep")?.durationMinutes || 0;
  const todayRemMins = sleepStages.find((s) => s.stage === "REM")?.durationMinutes || 0;
  const todayDeepRemTotal = todayDeepMins + todayRemMins;
  const todayDeepRemPct = Math.round((todayDeepRemTotal / (durationMinutes || 1)) * 100);

  // Compute 7-day statistics
  const validSleep = history.filter((h) => h.sleepDurationMinutes && h.sleepDurationMinutes > 0);
  const weeklyAvgDuration = validSleep.length
    ? Math.round(validSleep.reduce((sum, h) => sum + h.sleepDurationMinutes, 0) / validSleep.length)
    : durationMinutes;
  const weeklyAvgHours = Math.floor(weeklyAvgDuration / 60);
  const weeklyAvgMins = weeklyAvgDuration % 60;

  const weeklyAvgScore = validSleep.length
    ? Math.round(validSleep.reduce((sum, h) => sum + h.sleepScore, 0) / validSleep.length)
    : sleepScore;
  const weeklyRating = getScoreRating(weeklyAvgScore);

  const totalDeepMins = validSleep.reduce(
    (sum, h) => sum + (h.sleepStages?.find((s) => s.stage === "Deep")?.durationMinutes || 0),
    0
  );
  const totalRemMins = validSleep.reduce(
    (sum, h) => sum + (h.sleepStages?.find((s) => s.stage === "REM")?.durationMinutes || 0),
    0
  );
  const weeklyDeepRemPct = validSleep.length
    ? Math.round(((totalDeepMins + totalRemMins) / (weeklyAvgDuration * validSleep.length || 1)) * 100)
    : todayDeepRemPct;

  const weeklyAvgEfficiency = validSleep.length
    ? Math.round(
        validSleep.reduce((sum, h) => sum + (h.sleepEfficiency || 95), 0) / validSleep.length
      )
    : (sleepEfficiency || 99);

  const weeklyRestingPts = validSleep.filter((h) => h.restingHeartRate && h.restingHeartRate > 0);
  const weeklyAvgRestingHR = weeklyRestingPts.length
    ? Math.round(weeklyRestingPts.reduce((sum, h) => sum + (h.restingHeartRate || 0), 0) / weeklyRestingPts.length)
    : null;

  // Format 7-day chart data
  const weeklyChartData = history.map((h) => {
    const deep = h.sleepStages?.find((s) => s.stage === "Deep")?.durationMinutes || 0;
    const rem = h.sleepStages?.find((s) => s.stage === "REM")?.durationMinutes || 0;
    const light = h.sleepStages?.find((s) => s.stage === "Light")?.durationMinutes || 0;
    const awake = h.sleepStages?.find((s) => s.stage === "Awake")?.durationMinutes || 0;
    const durationHours = Number(((h.sleepDurationMinutes || 0) / 60).toFixed(1));
    const deepHours = Number((deep / 60).toFixed(1));
    const remHours = Number((rem / 60).toFixed(1));
    const lightHours = Number((light / 60).toFixed(1));
    const awakeHours = Number((awake / 60).toFixed(1));

    return {
      date: h.date,
      durationMinutes: h.sleepDurationMinutes,
      durationHours,
      deepHours,
      remHours,
      lightHours,
      awakeHours,
      sleepScore: h.sleepScore,
      sleepEfficiency: h.sleepEfficiency,
      restingHeartRate: h.restingHeartRate,
    };
  });

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const h = Math.floor(data.durationMinutes / 60);
      const m = data.durationMinutes % 60;
      const scoreRating = getScoreRating(data.sleepScore);
      return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-xl shadow-xl text-xs space-y-2 min-w-[170px]">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-1.5">
            <span className="font-semibold text-slate-800 dark:text-slate-200">Date: {label}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium border ${scoreRating.color}`}>
              Score: {data.sleepScore}
            </span>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
              <span>Total Sleep:</span>
              <span className="font-bold text-slate-900 dark:text-white">
                {h}h {m}m
              </span>
            </div>

            {data.sleepEfficiency ? (
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                <span>Efficiency:</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">{data.sleepEfficiency}%</span>
              </div>
            ) : null}

            <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
              <span className="flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                <span>Deep:</span>
              </span>
              <span className="font-medium text-blue-500">{data.deepHours}h</span>
            </div>

            <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
              <span className="flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />
                <span>REM:</span>
              </span>
              <span className="font-medium text-purple-500">{data.remHours}h</span>
            </div>

            <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
              <span className="flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-sky-400 inline-block" />
                <span>Light:</span>
              </span>
              <span className="font-medium text-sky-400">{data.lightHours}h</span>
            </div>

            {data.awakeHours > 0 && (
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                <span className="flex items-center space-x-1">
                  <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                  <span>Awake:</span>
                </span>
                <span className="font-medium text-amber-400">{data.awakeHours}h</span>
              </div>
            )}

            {data.restingHeartRate && (
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
                <span>Resting HR:</span>
                <span className="font-bold text-rose-500">{data.restingHeartRate} bpm</span>
              </div>
            )}
          </div>
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
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
              <Moon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">Sleep & Recovery</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {viewMode === "today"
                  ? "Sleep stages & architecture analysis"
                  : "7-Day sleep duration, score & restorative recovery"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800/80 rounded-lg p-1 border border-slate-200 dark:border-slate-700/60">
              <button
                onClick={() => setViewMode("today")}
                className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                  viewMode === "today"
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Last Night</span>
              </button>
              <button
                onClick={() => setViewMode("weekly")}
                className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                  viewMode === "weekly"
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>7-Day Trend</span>
              </button>
            </div>

            {/* Score Badge */}
            <div
              className={`hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                viewMode === "today" ? rating.color : weeklyRating.color
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>
                {viewMode === "today"
                  ? `Score: ${sleepScore} • ${rating.label}`
                  : `7D Avg Score: ${weeklyAvgScore} • ${weeklyRating.label}`}
              </span>
            </div>
          </div>
        </div>

        {/* Dynamic Highlight Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-4 text-xs">
          {viewMode === "today" ? (
            <>
              <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-3 border border-slate-200 dark:border-slate-800">
                <div className="flex items-center space-x-1.5 text-slate-500 dark:text-slate-400 mb-1">
                  <Clock className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                  <span>Total Sleep Time</span>
                </div>
                <div className="text-xl font-bold text-slate-900 dark:text-white">
                  {hours}h {minutes}m
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-3 border border-slate-200 dark:border-slate-800">
                <div className="flex items-center space-x-1.5 text-slate-500 dark:text-slate-400 mb-1">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                  <span>Sleep Score</span>
                </div>
                <div className="text-xl font-bold text-indigo-600 dark:text-indigo-400">
                  {sleepScore} <span className="text-xs font-normal text-slate-400">/ 100</span>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-3 border border-slate-200 dark:border-slate-800">
                <div className="flex items-center space-x-1.5 text-slate-500 dark:text-slate-400 mb-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                  <span>Clinical Efficiency</span>
                </div>
                <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                  {sleepEfficiency ?? (validSleep[validSleep.length - 1]?.sleepEfficiency || 99)}%
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-3 border border-slate-200 dark:border-slate-800">
                <div className="flex items-center space-x-1.5 text-slate-500 dark:text-slate-400 mb-1">
                  <Zap className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400" />
                  <span>Deep + REM Restorative</span>
                </div>
                <div className="text-xl font-bold text-purple-600 dark:text-purple-400">
                  {todayDeepRemPct}% ({Math.floor(todayDeepRemTotal / 60)}h {todayDeepRemTotal % 60}m)
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-3 border border-slate-200 dark:border-slate-800">
                <div className="flex items-center space-x-1.5 text-slate-500 dark:text-slate-400 mb-1">
                  <Clock className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                  <span>7-Day Daily Avg Sleep</span>
                </div>
                <div className="text-xl font-bold text-slate-900 dark:text-white">
                  {weeklyAvgHours}h {weeklyAvgMins}m
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-3 border border-slate-200 dark:border-slate-800">
                <div className="flex items-center space-x-1.5 text-slate-500 dark:text-slate-400 mb-1">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                  <span>7-Day Avg Sleep Score</span>
                </div>
                <div className="text-xl font-bold text-indigo-600 dark:text-indigo-400">
                  {weeklyAvgScore} <span className="text-xs font-normal text-slate-400">/ 100</span>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-3 border border-slate-200 dark:border-slate-800">
                <div className="flex items-center space-x-1.5 text-slate-500 dark:text-slate-400 mb-1">
                  <Zap className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400" />
                  <span>Restorative Deep + REM</span>
                </div>
                <div className="text-xl font-bold text-purple-600 dark:text-purple-400">
                  {weeklyDeepRemPct}% Avg
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-3 border border-slate-200 dark:border-slate-800">
                <div className="flex items-center space-x-1.5 text-slate-500 dark:text-slate-400 mb-1">
                  <Activity className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400" />
                  <span>Recovery Resting HR</span>
                </div>
                <div className="text-xl font-bold text-rose-600 dark:text-rose-400">
                  {weeklyAvgRestingHR !== null ? `${weeklyAvgRestingHR} bpm` : "—"}
                </div>
              </div>
            </>
          )}
        </div>

        {/* View Mode Content */}
        {viewMode === "today" ? (
          <>
            {/* Visual Stage Distribution Bar */}
            <div className="mb-4">
              <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
                <span>Sleep Stage Distribution (Last Night)</span>
                <span>100% of cycle ({hours}h {minutes}m total)</span>
              </div>
              <div className="w-full h-4 rounded-full overflow-hidden flex bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700/50">
                {sleepStages.map((stage, idx) => (
                  <div
                    key={idx}
                    style={{
                      width: `${stage.percentage}%`,
                      backgroundColor: stage.color,
                    }}
                    className="h-full relative group transition-all hover:opacity-90"
                    title={`${stage.stage}: ${stage.durationMinutes}m (${stage.percentage}%)`}
                  />
                ))}
              </div>
            </div>

            {/* Stage Cards Legend */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
              {sleepStages.map((stage, idx) => (
                <div
                  key={idx}
                  className="bg-slate-50 dark:bg-slate-800/30 rounded-lg p-2 border border-slate-200 dark:border-slate-800/60"
                >
                  <div className="flex items-center space-x-1.5 mb-1">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                    <span className="text-slate-700 dark:text-slate-300 font-medium">{stage.stage}</span>
                  </div>
                  <div className="text-slate-500 dark:text-slate-400 text-[11px]">
                    {Math.floor(stage.durationMinutes / 60)}h {stage.durationMinutes % 60}m ({stage.percentage}%)
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div>
            {/* 7-Day Composed Chart */}
            <div className="h-64 w-full mb-3">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={weeklyChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                  <XAxis dataKey="date" stroke={axisStroke} fontSize={11} tickLine={false} />
                  <YAxis
                    stroke={axisStroke}
                    fontSize={11}
                    tickLine={false}
                    domain={[0, 9]}
                    unit="h"
                    tickFormatter={(v) => `${v}h`}
                  />
                  <YAxis
                    yAxisId="score"
                    orientation="right"
                    stroke="#EC4899"
                    fontSize={11}
                    tickLine={false}
                    domain={[50, 100]}
                    tickFormatter={(v) => `${v}pt`}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine
                    y={7}
                    stroke="#10B981"
                    strokeDasharray="4 4"
                    label={{ value: "7h Target", fill: "#059669", fontSize: 10, position: "left" }}
                  />

                  {/* Stacked Bars for Stages */}
                  <Bar dataKey="deepHours" stackId="sleep" fill="#3B82F6" name="Deep" />
                  <Bar dataKey="remHours" stackId="sleep" fill="#8B5CF6" name="REM" />
                  <Bar dataKey="lightHours" stackId="sleep" fill="#60A5FA" name="Light" />
                  <Bar
                    dataKey="awakeHours"
                    stackId="sleep"
                    fill="#F59E0B"
                    name="Awake"
                    radius={[4, 4, 0, 0]}
                  />

                  {/* Sleep Score Line Overlay */}
                  <Line
                    yAxisId="score"
                    type="monotone"
                    dataKey="sleepScore"
                    stroke="#EC4899"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: "#EC4899" }}
                    name="Sleep Score"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Weekly Mode Legend Pills */}
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
                <span>Deep Sleep</span>
              </span>
              <span className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block" />
                <span>REM Sleep</span>
              </span>
              <span className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block" />
                <span>Light Sleep</span>
              </span>
              <span className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                <span>Awake Time</span>
              </span>
              <span className="flex items-center space-x-1.5">
                <span className="w-3 h-0.5 bg-pink-500 inline-block border-t-2 border-pink-500" />
                <span>Sleep Score (Right Axis)</span>
              </span>
              <span className="flex items-center space-x-1.5">
                <span className="w-3 h-0.5 bg-emerald-500 inline-block border-t border-dashed border-emerald-500" />
                <span>7h Optimal Target</span>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
