"use client";

import React, { useState, useMemo } from "react";
import {
  Sparkles,
  Moon,
  Zap,
  Heart,
  RefreshCw,
  ChevronRight,
  Coffee,
  Sun,
  Sunset,
} from "lucide-react";
import { DailyMetricSummary } from "@/lib/types";

interface DailyBriefingProps {
  today: DailyMetricSummary;
  history7Days: DailyMetricSummary[];
  userName?: string;
  onOpenChatWithPrompt?: (prompt: string) => void;
}

export const DailyBriefing: React.FC<DailyBriefingProps> = ({
  today,
  history7Days,
  userName = "there",
  onOpenChatWithPrompt,
}) => {
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenCount, setRegenCount] = useState(0);

  // Time of day greeting
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    const name = userName ? userName.split(" ")[0] : "there";
    if (hour < 12) return { text: `Good morning, ${name}`, icon: Coffee, period: "morning" };
    if (hour < 17) return { text: `Good afternoon, ${name}`, icon: Sun, period: "afternoon" };
    return { text: `Good evening, ${name}`, icon: Sunset, period: "evening" };
  }, [userName]);

  // Analytical synthesis of user metrics
  const synthesis = useMemo(() => {
    const steps = today.steps || 0;
    const stepsGoal = today.stepsGoal || 10000;
    const stepPct = Math.round((steps / stepsGoal) * 100);

    // Sleep analysis
    const sleepMins = today.sleepDurationMinutes || 0;
    const sleepHrs = Math.floor(sleepMins / 60);
    const sleepRemMins = sleepMins % 60;
    const sleepScore = today.sleepScore || 0;

    // Heart rate & 7-day trend
    const hr = today.restingHeartRate;
    const validHRHistory = history7Days.filter((h) => h.restingHeartRate && h.restingHeartRate > 0);
    const avgRestingHR = validHRHistory.length
      ? Math.round(validHRHistory.reduce((s, h) => s + (h.restingHeartRate || 0), 0) / validHRHistory.length)
      : null;

    let hrTrendText = "";
    if (hr && avgRestingHR) {
      const diff = hr - avgRestingHR;
      if (diff <= -2) {
        hrTrendText = `Your resting heart rate is **${hr} bpm**, running **${Math.abs(diff)} bpm lower than your 7-day average (${avgRestingHR} bpm)**, signaling strong parasympathetic autonomic recovery.`;
      } else if (diff >= 3) {
        hrTrendText = `Your resting heart rate is **${hr} bpm** (slightly elevated by **${diff} bpm** vs your 7-day baseline of ${avgRestingHR} bpm), suggesting mild physiological strain or delayed recovery.`;
      } else {
        hrTrendText = `Your resting heart rate of **${hr} bpm** aligns closely with your 7-day baseline (${avgRestingHR} bpm), reflecting balanced cardiovascular homeostasis.`;
      }
    } else if (hr) {
      hrTrendText = `Resting heart rate logged at **${hr} bpm**.`;
    }

    // Sleep statement
    let sleepText = "";
    if (sleepMins > 0) {
      sleepText = `You logged **${sleepHrs}h ${sleepRemMins}m** of sleep with a Sleep Score of **${sleepScore}/100**. `;
      const deepMins = today.sleepStages?.find((s) => s.stage === "Deep")?.durationMinutes || 0;
      const remMins = today.sleepStages?.find((s) => s.stage === "REM")?.durationMinutes || 0;
      const restorativeMins = deepMins + remMins;
      if (restorativeMins > 0) {
        const restorativePct = Math.round((restorativeMins / sleepMins) * 100);
        sleepText += `Restorative stages (Deep + REM) accounted for **${restorativePct}%** (${Math.floor(restorativeMins / 60)}h ${restorativeMins % 60}m) of your night.`;
      }
    } else {
      sleepText = "No overnight sleep session recorded on your synced wearable yet. If you took a power nap or synced recently, metrics will refresh automatically.";
    }

    // Actionable coaching recommendation based on step progress & time of day
    let actionTip = "";
    if (stepPct >= 100) {
      actionTip = `Outstanding work! You've already smashed your daily movement goal with **${steps.toLocaleString()} steps** (${stepPct}%). Focus on hydration, post-workout stretching, and an easy evening wind-down.`;
    } else if (stepPct >= 50) {
      const remaining = stepsGoal - steps;
      actionTip = `You're over halfway to your goal with **${steps.toLocaleString()} steps** (${stepPct}%). A brisk 25-minute afternoon walk will comfortably close the remaining **${remaining.toLocaleString()} steps**.`;
    } else {
      const remaining = stepsGoal - steps;
      actionTip = `You're currently at **${steps.toLocaleString()} steps** (${stepPct}% of goal). Taking short 5-minute movement breaks every hour this afternoon will easily bank **${Math.min(remaining, 3000).toLocaleString()} more steps** before dinner.`;
    }

    // Curated quick-dive prompts tailored to current health status
    const dynamicPrompts = [
      {
        id: "sleep-opt",
        title: "Optimize Tonight's Sleep",
        prompt: `Based on my sleep data today (${sleepHrs}h ${sleepRemMins}m, score: ${sleepScore}) and resting HR (${hr || "N/A"} bpm), give me a tailored 3-step evening wind-down routine to maximize deep sleep tonight.`,
        icon: Moon,
        color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20 hover:bg-indigo-500/20",
      },
      {
        id: "workout-plan",
        title: "Plan Today's Movement",
        prompt: `I have logged ${steps.toLocaleString()} steps so far today out of my ${stepsGoal.toLocaleString()} goal. What specific workout or walking routine should I do today given my current recovery score?`,
        icon: Zap,
        color: "text-amber-400 bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/20",
      },
      {
        id: "hr-analysis",
        title: "Analyze My Cardiac Recovery",
        prompt: `Analyze my resting heart rate trend (${hr ? hr + " bpm" : "recent readings"} vs 7-day average ${avgRestingHR ? avgRestingHR + " bpm" : "baseline"}). What does this mean for my cardiovascular fitness and stress recovery?`,
        icon: Heart,
        color: "text-rose-400 bg-rose-500/10 border-rose-500/20 hover:bg-rose-500/20",
      },
    ];

    return {
      sleepText,
      hrTrendText,
      actionTip,
      dynamicPrompts,
    };
  }, [today, history7Days, regenCount]);

  const handleRegenerate = () => {
    setIsRegenerating(true);
    setTimeout(() => {
      setRegenCount((c) => c + 1);
      setIsRegenerating(false);
    }, 600);
  };

  const GreetingIcon = greeting.icon;

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900/90 via-slate-900/80 to-slate-950/90 dark:from-slate-900/95 dark:via-slate-950/90 dark:to-black border border-slate-700/50 dark:border-slate-800/80 p-5 sm:p-6 shadow-xl backdrop-blur-md transition-all duration-300 hover:border-slate-600/60">
      {/* Ambient glowing gradient accent */}
      <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-gradient-to-br from-teal-500/15 via-indigo-500/10 to-transparent blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full bg-gradient-to-tr from-emerald-500/10 via-cyan-500/10 to-transparent blur-3xl pointer-events-none" />

      {/* Header bar */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800/70">
        <div className="flex items-center space-x-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-tr from-teal-500 to-emerald-400 text-slate-950 shadow-md shadow-teal-500/20">
            <Sparkles className="w-4 h-4 fill-slate-950" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-sm font-semibold text-white tracking-wide">
                AI Daily Health Briefing
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1 animate-pulse" />
                Live Telemetry Synthesis
              </span>
            </div>
            <div className="flex items-center space-x-1.5 text-xs text-slate-400 mt-0.5">
              <GreetingIcon className="w-3.5 h-3.5 text-amber-400" />
              <span>{greeting.text}</span>
              <span className="text-slate-600">•</span>
              <span className="text-slate-400 capitalize">{greeting.period} Briefing</span>
            </div>
          </div>
        </div>

        {/* Regenerate Action */}
        <button
          onClick={handleRegenerate}
          disabled={isRegenerating}
          title="Refresh AI briefing synthesis"
          className="inline-flex items-center space-x-1.5 px-2.5 py-1 text-xs font-medium text-slate-400 hover:text-slate-200 bg-slate-800/60 hover:bg-slate-800 rounded-lg border border-slate-700/60 transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3 h-3 ${isRegenerating ? "animate-spin text-teal-400" : ""}`} />
          <span>{isRegenerating ? "Synthesizing..." : "Refresh"}</span>
        </button>
      </div>

      {/* Synthesis Content Body */}
      <div className="relative z-10 mt-4 space-y-3">
        <div className="text-sm text-slate-200 leading-relaxed space-y-2">
          <p className="flex items-start gap-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-teal-400 mt-2 shrink-0" />
            <span
              dangerouslySetInnerHTML={{
                __html: synthesis.sleepText.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>'),
              }}
            />
          </p>

          {synthesis.hrTrendText && (
            <p className="flex items-start gap-2">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-400 mt-2 shrink-0" />
              <span
                dangerouslySetInnerHTML={{
                  __html: synthesis.hrTrendText.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>'),
                }}
              />
            </p>
          )}

          <p className="flex items-start gap-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 mt-2 shrink-0" />
            <span
              dangerouslySetInnerHTML={{
                __html: synthesis.actionTip.replace(/\*\*(.*?)\*\*/g, '<strong class="text-emerald-300 font-semibold">$1</strong>'),
              }}
            />
          </p>
        </div>

        {/* Interactive Quick-Dive Prompts */}
        <div className="pt-3 border-t border-slate-800/60">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Deep-Dive with AI Coach:
            </span>
            <span className="text-[10px] text-slate-500">1-click automated inquiry</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {synthesis.dynamicPrompts.map((item) => {
              const ItemIcon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => onOpenChatWithPrompt?.(item.prompt)}
                  className={`flex items-center justify-between p-2.5 rounded-xl border text-left text-xs transition-all duration-200 group cursor-pointer ${item.color}`}
                >
                  <div className="flex items-center space-x-2 truncate">
                    <ItemIcon className="w-4 h-4 shrink-0 transition-transform group-hover:scale-110" />
                    <span className="font-medium truncate text-slate-200 group-hover:text-white">
                      {item.title}
                    </span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-white transition-transform group-hover:translate-x-0.5 shrink-0 ml-1" />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
