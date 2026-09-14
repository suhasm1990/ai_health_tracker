"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  Sparkles,
  Zap,
  Moon,
  Footprints,
  Flame,
  TrendingUp,
  Activity,
  Heart,
} from "lucide-react";
import { DailyMetricSummary } from "@/lib/types";
import { calculateIndustryStandardReadiness } from "@/lib/readiness";

interface ReadinessScoreProps {
  today: DailyMetricSummary;
  history7Days: DailyMetricSummary[];
  userName?: string;
}

export const ReadinessScore: React.FC<ReadinessScoreProps> = ({
  today,
  history7Days,
  userName = "there",
}) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Trigger smooth ring sweep animation upon mounting
    const timer = setTimeout(() => setMounted(true), 150);
    return () => clearTimeout(timer);
  }, []);

  // Industry-Standard Clinical Readiness Formulation (0 - 100)
  const breakdown = useMemo(() => {
    return calculateIndustryStandardReadiness(today, history7Days);
  }, [today, history7Days]);

  const readinessScore = breakdown.score;
  const tier = breakdown.tier;
  const factors = breakdown.factors;

  // Concentric Rings Configuration (Move, Energy, Recovery)
  // Ring 1 (Outer): Move / Steps
  const movePct = Math.min(100, Math.round(((today.steps || 0) / (today.stepsGoal || 10000)) * 100));
  // Ring 2 (Middle): Calories / Energy
  const energyPct = Math.min(100, Math.round(((today.caloriesBurned || 0) / (today.caloriesGoal || 2400)) * 100));
  // Ring 3 (Inner): Sleep / Recovery
  const sleepPct = Math.min(100, Math.round(((today.sleepDurationMinutes || 0) / 480) * 100));

  // Geometry for concentric rings (viewBox 220 x 220)
  const center = 110;
  const strokeWidth = 10;
  const gap = 4;

  const rMove = center - strokeWidth / 2 - 8; // 97
  const rEnergy = rMove - strokeWidth - gap; // 83
  const rSleep = rEnergy - strokeWidth - gap; // 69

  const circMove = 2 * Math.PI * rMove;
  const circEnergy = 2 * Math.PI * rEnergy;
  const circSleep = 2 * Math.PI * rSleep;

  const offsetMove = circMove * (1 - (mounted ? movePct / 100 : 0));
  const offsetEnergy = circEnergy * (1 - (mounted ? energyPct / 100 : 0));
  const offsetSleep = circSleep * (1 - (mounted ? sleepPct / 100 : 0));

  return (
    <div className="relative overflow-hidden bg-white/80 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 sm:p-7 shadow-xs backdrop-blur-md transition-all duration-300">
      {/* Fluid Ambient Glow Background */}
      <div
        className={`absolute -top-24 -left-24 w-96 h-96 rounded-full bg-gradient-to-br ${tier.glow} blur-3xl pointer-events-none opacity-80 dark:opacity-50`}
      />
      <div className="absolute -bottom-24 -right-24 w-80 h-80 rounded-full bg-gradient-to-tl from-indigo-500/10 via-purple-500/5 to-transparent blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-6 lg:gap-8">
        {/* Left: Score & Guidance Section */}
        <div className="flex-1 space-y-4 w-full">
          {/* Header Row */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-white shadow-md shadow-emerald-500/20">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                  Daily Readiness & Recovery
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Multivariate physiological recovery synthesis
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {factors.autonomic.isPeak && (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-500/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/30 flex items-center space-x-1 shadow-xs animate-pulse">
                  <Activity className="w-3.5 h-3.5" />
                  <span>HRV Peak ({factors.autonomic.hrvMs} ms)</span>
                </span>
              )}
              <span
                className={`text-xs font-semibold px-3 py-1 rounded-full border shadow-xs ${tier.badgeBg} flex items-center space-x-1.5`}
              >
                <span className="w-2 h-2 rounded-full bg-current animate-pulse inline-block" />
                <span>{tier.label}</span>
              </span>
            </div>
          </div>

          {/* Actionable Guidance Card */}
          <div className="bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/50 rounded-2xl p-4 transition-all">
            <div className="flex items-start space-x-3">
              <div className="p-1.5 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0">
                <Zap className="w-4 h-4" />
              </div>
              <div className="flex-1 text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                <span className="font-semibold text-slate-900 dark:text-white block sm:inline mr-1">
                  Clinical Recommendation:
                </span>
                {tier.guidance}
              </div>
            </div>
          </div>

          {/* 4-Pillar Industry Standard Breakdown Bars */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1 text-xs">
            {/* Factor 1: Autonomic HRV */}
            <div className="bg-slate-50/50 dark:bg-slate-800/30 rounded-xl p-2.5 border border-slate-200/40 dark:border-slate-800">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
                <span className="flex items-center space-x-1 text-[11px] font-medium">
                  <Activity className="w-3.5 h-3.5 text-purple-500" />
                  <span>Autonomic HRV</span>
                </span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {factors.autonomic.score}/40
                </span>
              </div>
              <div className="text-[10px] text-purple-600 dark:text-purple-400 font-medium mb-1.5 truncate">
                {factors.autonomic.valueFormatted} • {factors.autonomic.status}
              </div>
              <div className="w-full h-1.5 bg-slate-200/70 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-indigo-400 rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${(factors.autonomic.score / 40) * 100}%` }}
                />
              </div>
            </div>

            {/* Factor 2: Sleep Restoration */}
            <div className="bg-slate-50/50 dark:bg-slate-800/30 rounded-xl p-2.5 border border-slate-200/40 dark:border-slate-800">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
                <span className="flex items-center space-x-1 text-[11px] font-medium">
                  <Moon className="w-3.5 h-3.5 text-cyan-500" />
                  <span>Sleep Restore</span>
                </span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {factors.sleep.score}/35
                </span>
              </div>
              <div className="text-[10px] text-cyan-600 dark:text-cyan-400 font-medium mb-1.5 truncate">
                Score {factors.sleep.valueFormatted} • {factors.sleep.status}
              </div>
              <div className="w-full h-1.5 bg-slate-200/70 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-blue-400 rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${(factors.sleep.score / 35) * 100}%` }}
                />
              </div>
            </div>

            {/* Factor 3: Cardiac Rest */}
            <div className="bg-slate-50/50 dark:bg-slate-800/30 rounded-xl p-2.5 border border-slate-200/40 dark:border-slate-800">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
                <span className="flex items-center space-x-1 text-[11px] font-medium">
                  <Heart className="w-3.5 h-3.5 text-rose-500" />
                  <span>Cardiac Rest</span>
                </span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {factors.cardiac.score}/15
                </span>
              </div>
              <div className="text-[10px] text-rose-600 dark:text-rose-400 font-medium mb-1.5 truncate">
                {factors.cardiac.valueFormatted} • {factors.cardiac.status}
              </div>
              <div className="w-full h-1.5 bg-slate-200/70 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-rose-500 to-amber-400 rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${(factors.cardiac.score / 15) * 100}%` }}
                />
              </div>
            </div>

            {/* Factor 4: Vitality & Strain */}
            <div className="bg-slate-50/50 dark:bg-slate-800/30 rounded-xl p-2.5 border border-slate-200/40 dark:border-slate-800">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
                <span className="flex items-center space-x-1 text-[11px] font-medium">
                  <Flame className="w-3.5 h-3.5 text-amber-500" />
                  <span>Vitality & Strain</span>
                </span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {factors.vitality.score}/10
                </span>
              </div>
              <div className="text-[10px] text-amber-600 dark:text-amber-400 font-medium mb-1.5 truncate">
                {factors.vitality.status} • {factors.vitality.valueFormatted}
              </div>
              <div className="w-full h-1.5 bg-slate-200/70 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-400 to-emerald-400 rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${(factors.vitality.score / 10) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right: Concentric Rings & Big Score Visualization */}
        <div className="flex flex-col sm:flex-row items-center gap-5 sm:gap-7 shrink-0 w-full sm:w-auto justify-center">
          {/* SVG Concentric Rings */}
          <div className="relative w-48 h-48 sm:w-52 sm:h-52 flex items-center justify-center">
            <svg
              className="w-full h-full -rotate-90 transform"
              viewBox="0 0 220 220"
            >
              <defs>
                {/* Gradients for Glowing Rings */}
                <linearGradient id="moveGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#FB7185" />
                  <stop offset="100%" stopColor="#F43F5E" />
                </linearGradient>
                <linearGradient id="energyGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#FBBF24" />
                  <stop offset="100%" stopColor="#34D399" />
                </linearGradient>
                <linearGradient id="sleepGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#38BDF8" />
                  <stop offset="100%" stopColor="#6366F1" />
                </linearGradient>
              </defs>

              {/* Background Tracks */}
              <circle
                cx={center}
                cy={center}
                r={rMove}
                fill="none"
                stroke="currentColor"
                strokeWidth={strokeWidth}
                className="text-rose-500/15 dark:text-rose-500/20"
              />
              <circle
                cx={center}
                cy={center}
                r={rEnergy}
                fill="none"
                stroke="currentColor"
                strokeWidth={strokeWidth}
                className="text-amber-500/15 dark:text-amber-500/20"
              />
              <circle
                cx={center}
                cy={center}
                r={rSleep}
                fill="none"
                stroke="currentColor"
                strokeWidth={strokeWidth}
                className="text-indigo-500/15 dark:text-indigo-500/20"
              />

              {/* Animated Progress Rings */}
              {/* Ring 1: Move / Steps */}
              <circle
                cx={center}
                cy={center}
                r={rMove}
                fill="none"
                stroke="url(#moveGradient)"
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={circMove}
                strokeDashoffset={offsetMove}
                className="transition-all duration-1000 ease-out"
              />

              {/* Ring 2: Energy / Calories */}
              <circle
                cx={center}
                cy={center}
                r={rEnergy}
                fill="none"
                stroke="url(#energyGradient)"
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={circEnergy}
                strokeDashoffset={offsetEnergy}
                className="transition-all duration-1000 ease-out delay-100"
              />

              {/* Ring 3: Sleep / Recovery */}
              <circle
                cx={center}
                cy={center}
                r={rSleep}
                fill="none"
                stroke="url(#sleepGradient)"
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={circSleep}
                strokeDashoffset={offsetSleep}
                className="transition-all duration-1000 ease-out delay-200"
              />
            </svg>

            {/* Centered Big Readiness Score */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center select-none pointer-events-none">
              <span className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight leading-none">
                {readinessScore}
              </span>
              <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mt-1">
                Readiness
              </span>
            </div>
          </div>

          {/* Ring Legend Labels */}
          <div className="space-y-2.5 text-xs">
            {/* Legend 1: Move */}
            <div className="flex items-center space-x-2.5">
              <div className="w-3 h-3 rounded-full bg-gradient-to-tr from-rose-500 to-orange-400 shrink-0 shadow-xs" />
              <div>
                <div className="flex items-center space-x-1.5">
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {(today.steps || 0).toLocaleString()}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    / {(today.stepsGoal || 10000).toLocaleString()} steps
                  </span>
                </div>
                <div className="text-[10px] text-rose-500 dark:text-rose-400 font-medium">
                  {movePct}% of Move Goal
                </div>
              </div>
            </div>

            {/* Legend 2: Energy */}
            <div className="flex items-center space-x-2.5">
              <div className="w-3 h-3 rounded-full bg-gradient-to-tr from-amber-400 to-emerald-400 shrink-0 shadow-xs" />
              <div>
                <div className="flex items-center space-x-1.5">
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {(today.caloriesBurned || 0).toLocaleString()}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    / {(today.caloriesGoal || 2400).toLocaleString()} kcal
                  </span>
                </div>
                <div className="text-[10px] text-emerald-500 dark:text-emerald-400 font-medium">
                  {energyPct}% of Energy Goal
                </div>
              </div>
            </div>

            {/* Legend 3: Sleep */}
            <div className="flex items-center space-x-2.5">
              <div className="w-3 h-3 rounded-full bg-gradient-to-tr from-cyan-400 to-indigo-500 shrink-0 shadow-xs" />
              <div>
                <div className="flex items-center space-x-1.5">
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {Math.floor((today.sleepDurationMinutes || 0) / 60)}h{" "}
                    {(today.sleepDurationMinutes || 0) % 60}m
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    / 8h optimal
                  </span>
                </div>
                <div className="text-[10px] text-indigo-500 dark:text-indigo-400 font-medium">
                  {sleepPct}% of Sleep Goal
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
