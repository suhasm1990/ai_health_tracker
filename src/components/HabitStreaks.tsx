"use client";

import React, { useState, useMemo } from "react";
import {
  Flame,
  Moon,
  Zap,
  Trophy,
  Award,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { DailyMetricSummary } from "@/lib/types";

interface HabitStreaksProps {
  today: DailyMetricSummary;
  history7Days: DailyMetricSummary[];
}

export const HabitStreaks: React.FC<HabitStreaksProps> = ({ today, history7Days }) => {
  const [activeTab, setActiveTab] = useState<"streaks" | "milestones">("streaks");
  const [selectedStreak, setSelectedStreak] = useState<string | null>(null);

  // Combine chronological history (oldest to newest) plus today
  const fullSequence = useMemo(() => {
    const list = [...history7Days];
    // Sort oldest first if not already
    list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    // Append today if not already in list
    if (!list.some((d) => d.date === today.date)) {
      list.push(today);
    }
    return list;
  }, [today, history7Days]);

  // Streak calculations
  const streakStats = useMemo(() => {
    // 1. Step streak: count backwards from latest
    let stepStreak = 0;
    for (let i = fullSequence.length - 1; i >= 0; i--) {
      const day = fullSequence[i];
      const goal = day.stepsGoal || 10000;
      // Allow 75% of goal or 8,000 steps minimum to maintain streak resilience
      if (day.steps >= Math.min(goal, 8000)) {
        stepStreak++;
      } else if (i === fullSequence.length - 1) {
        // If today is in progress, check if yesterday had streak
        continue;
      } else {
        break;
      }
    }

    // 2. Sleep streak (7+ hours or score >= 75)
    let sleepStreak = 0;
    for (let i = fullSequence.length - 1; i >= 0; i--) {
      const day = fullSequence[i];
      if (day.sleepScore >= 75 || day.sleepDurationMinutes >= 420) {
        sleepStreak++;
      } else if (i === fullSequence.length - 1 && day.sleepDurationMinutes === 0) {
        continue;
      } else {
        break;
      }
    }

    // 3. Active Zone streak (>= 20 mins)
    let azmStreak = 0;
    for (let i = fullSequence.length - 1; i >= 0; i--) {
      const day = fullSequence[i];
      if (day.activeZoneMinutes >= 20) {
        azmStreak++;
      } else if (i === fullSequence.length - 1) {
        continue;
      } else {
        break;
      }
    }

    // 4. Weekly Goal Consistency (days where at least 1 primary goal was met)
    const completedDaysCount = fullSequence.filter(
      (d) => d.steps >= 8000 || d.activeZoneMinutes >= 20 || d.sleepScore >= 75
    ).length;

    // Is today completely smashed?
    const isTodayAllStars =
      today.steps >= (today.stepsGoal || 10000) &&
      today.activeZoneMinutes >= (today.activeZoneMinutesGoal || 30);

    return {
      stepStreak: Math.max(stepStreak, 1),
      sleepStreak: Math.max(sleepStreak, 1),
      azmStreak: Math.max(azmStreak, 1),
      completedDaysCount,
      totalDays: fullSequence.length,
      isTodayAllStars,
    };
  }, [fullSequence, today]);

  const STREAKS = [
    {
      id: "steps",
      title: "Daily Steps Streak",
      count: streakStats.stepStreak,
      unit: "days",
      icon: Flame,
      color: "text-amber-500 dark:text-amber-400",
      bgColor: "bg-amber-500/10 dark:bg-amber-500/15 border-amber-500/20",
      accentGlow: "from-amber-500/20 to-orange-500/5",
      description: "Hit 8,000+ steps daily to keep momentum alive",
      milestone: streakStats.stepStreak >= 7 ? "🏆 7-Day Iron Walker" : "🎯 Next: 7-Day Iron Walker",
      progress: Math.min(100, Math.round((streakStats.stepStreak / 7) * 100)),
    },
    {
      id: "sleep",
      title: "Restorative Sleep",
      count: streakStats.sleepStreak,
      unit: "days",
      icon: Moon,
      color: "text-indigo-500 dark:text-indigo-400",
      bgColor: "bg-indigo-500/10 dark:bg-indigo-500/15 border-indigo-500/20",
      accentGlow: "from-indigo-500/20 to-purple-500/5",
      description: "7+ hours or Sleep Score >= 75",
      milestone: streakStats.sleepStreak >= 5 ? "🛡️ Circadian Master" : "🎯 Next: 5-Day Master",
      progress: Math.min(100, Math.round((streakStats.sleepStreak / 5) * 100)),
    },
    {
      id: "cardio",
      title: "Active Zone Minutes",
      count: streakStats.azmStreak,
      unit: "days",
      icon: Zap,
      color: "text-teal-500 dark:text-teal-400",
      bgColor: "bg-teal-500/10 dark:bg-teal-500/15 border-teal-500/20",
      accentGlow: "from-teal-500/20 to-emerald-500/5",
      description: "20+ minutes of fat burn or cardio daily",
      milestone: streakStats.azmStreak >= 5 ? "⚡ High Endurance" : "🎯 Next: 5-Day Surge",
      progress: Math.min(100, Math.round((streakStats.azmStreak / 5) * 100)),
    },
    {
      id: "weekly",
      title: "Weekly Consistency",
      count: streakStats.completedDaysCount,
      unit: `/${streakStats.totalDays} days`,
      icon: Trophy,
      color: "text-emerald-500 dark:text-emerald-400",
      bgColor: "bg-emerald-500/10 dark:bg-emerald-500/15 border-emerald-500/20",
      accentGlow: "from-emerald-500/20 to-teal-500/5",
      description: "Days with primary wellness goal satisfied",
      milestone: "🎖️ Consistency Leader",
      progress: Math.min(100, Math.round((streakStats.completedDaysCount / streakStats.totalDays) * 100)),
    },
  ];

  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-400 text-white shadow-sm shadow-amber-500/20">
            <Flame className="w-4 h-4 animate-bounce" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Habit Streaks & Milestone Badges
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                Resilience Engine
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Consistent daily micro-habits compound into long-term vitality
            </p>
          </div>
        </div>

        {/* 7-Day Day Dots Preview */}
        <div className="flex items-center space-x-1.5 bg-slate-100 dark:bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700/60">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mr-1">
            Last 7 Days:
          </span>
          {fullSequence.slice(-7).map((d, idx) => {
            const isCompleted = (d.steps || 0) >= 8000 || (d.activeZoneMinutes || 0) >= 20;
            const isCurrentDay = d.date === today.date;
            return (
              <div
                key={d.date || idx}
                title={`${d.date}: ${d.steps.toLocaleString()} steps`}
                className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold transition-all ${
                  isCompleted
                    ? "bg-emerald-500 text-white shadow-xs"
                    : isCurrentDay
                    ? "bg-teal-500/20 text-teal-600 dark:text-teal-400 border border-teal-500/40"
                    : "bg-slate-200 dark:bg-slate-700 text-slate-400"
                }`}
              >
                {isCompleted ? "✓" : isCurrentDay ? "•" : "–"}
              </div>
            );
          })}
        </div>
      </div>

      {/* Grid of 4 Streaks */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {STREAKS.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.id}
              className={`relative overflow-hidden rounded-xl border p-3.5 transition-all duration-200 hover:shadow-md ${item.bgColor}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-2">
                  <div className={`p-1.5 rounded-lg bg-white dark:bg-slate-800 shadow-xs ${item.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {item.title}
                    </h4>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                      {item.description}
                    </span>
                  </div>
                </div>
              </div>

              {/* Big Count */}
              <div className="mt-3 flex items-baseline space-x-1.5">
                <span className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                  {item.count}
                </span>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {item.unit}
                </span>
              </div>

              {/* Milestone Progress Bar */}
              <div className="mt-2.5">
                <div className="flex items-center justify-between text-[10px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                  <span>{item.milestone}</span>
                  <span>{item.progress}%</span>
                </div>
                <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-700/80 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ease-out bg-gradient-to-r ${item.accentGlow.replace(
                      "/20",
                      ""
                    )}`}
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
