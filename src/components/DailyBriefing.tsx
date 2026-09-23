"use client";

import { ChevronRight, Coffee, Heart, Moon, RefreshCw, Sparkles, Sun, Sunset, Zap, type LucideIcon } from "lucide-react";
import { useMemo, useState, useSyncExternalStore } from "react";
import { renderInline } from "@/lib/markdown";
import type { DailyMetricSummary } from "@/lib/types";
import { formatDuration, meanOf, restorativeMinutes, withUnit } from "@/lib/utils";

interface DailyBriefingProps {
  today: DailyMetricSummary;
  history7Days: DailyMetricSummary[];
  userName?: string;
  onOpenChatWithPrompt: (prompt: string) => void;
}

type Period = "morning" | "afternoon" | "evening" | "night";

const PERIODS: { until: number; period: Period; word: string; icon: LucideIcon; label: string }[] = [
  { until: 12, period: "morning", word: "morning", icon: Coffee, label: "Morning Edition" },
  { until: 17, period: "afternoon", word: "afternoon", icon: Sun, label: "Afternoon Edition" },
  { until: 22, period: "evening", word: "evening", icon: Sunset, label: "Evening Edition" },
  { until: 24, period: "night", word: "evening", icon: Moon, label: "Late Night Edition" },
];

interface StepContext {
  steps: string;
  pct: number;
  remaining: number;
}

/** Movement coaching by progress bucket and time of day. */
const MOVEMENT_TIPS: Record<"done" | "half" | "start", Record<Period, (c: StepContext) => string>> = {
  done: {
    morning: (c) => `Outstanding work! You've already reached your daily movement goal with **${c.steps} steps** (${c.pct}%). Stay hydrated and maintain your active momentum through the day.`,
    afternoon: (c) => `Outstanding work! You've already reached your daily movement goal with **${c.steps} steps** (${c.pct}%). Stay hydrated and maintain your active momentum through the day.`,
    evening: (c) => `Outstanding work! You've crushed your daily movement goal with **${c.steps} steps** (${c.pct}%). Transition into gentle stretching and an easy evening wind-down.`,
    night: (c) => `Outstanding work! You've crushed your daily movement goal with **${c.steps} steps** (${c.pct}%). Transition into gentle stretching and an easy evening wind-down.`,
  },
  half: {
    morning: (c) => `Strong start! You're already over halfway to your goal with **${c.steps} steps** (${c.pct}%). Steady movement through your day will easily close the remaining **${c.remaining.toLocaleString()} steps**.`,
    afternoon: (c) => `You're over halfway to your goal with **${c.steps} steps** (${c.pct}%). A brisk 25-minute afternoon walk will comfortably close the remaining **${c.remaining.toLocaleString()} steps**.`,
    evening: (c) => `You're over halfway to your goal with **${c.steps} steps** (${c.pct}%). A calm 25-minute evening stroll can comfortably bank another **${Math.min(c.remaining, 2500).toLocaleString()} steps** before your bedtime wind-down.`,
    night: (c) => `You've logged **${c.steps} steps** (${c.pct}%) today. If you're heading out for a late walk, keep the pace relaxed and conversational so your heart rate settles before sleep.`,
  },
  start: {
    morning: (c) => `You're currently at **${c.steps} steps** (${c.pct}% of goal). Plenty of day ahead—short 5-minute movement breaks each hour will steadily build toward your target.`,
    afternoon: (c) => `You're currently at **${c.steps} steps** (${c.pct}% of goal). An active 20-minute walk this afternoon will bank **${Math.min(c.remaining, 3000).toLocaleString()} more steps** before dinner.`,
    evening: (c) => `You've logged **${c.steps} steps** (${c.pct}% of goal) today. An easy 20-minute evening walk aids digestion, reduces stress, and adds a healthy boost to today's count.`,
    night: (c) => `You've logged **${c.steps} steps** today. If you take a late-night stroll, keep it light so your core temperature can cool down before bedtime.`,
  },
};

const noopSubscribe = () => () => {};
/** Current hour on the client, null during server rendering so markup matches on hydration. */
const useClientHour = () => useSyncExternalStore(noopSubscribe, () => new Date().getHours(), () => null);

const BOLD = { strong: "text-white font-semibold" };
const BOLD_ACCENT = { strong: "text-emerald-300 font-semibold" };

export function DailyBriefing({ today, history7Days, userName, onOpenChatWithPrompt }: DailyBriefingProps) {
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [, setEdition] = useState(0); // bumping re-renders, which re-reads the clock
  const hour = useClientHour();

  const greeting = useMemo(() => {
    const name = userName?.split(" ")[0] || "there";
    if (hour === null) return { ...PERIODS[0], icon: Sparkles, label: "Daily Edition", text: `Hello, ${name}` };
    const slot = PERIODS.find((p) => hour < p.until) ?? PERIODS[3];
    return { ...slot, text: `Good ${slot.word}, ${name}` };
  }, [userName, hour]);

  const synthesis = useMemo(() => {
    const stepPct = Math.round((today.steps / today.stepsGoal) * 100);
    const ctx: StepContext = { steps: today.steps.toLocaleString(), pct: stepPct, remaining: today.stepsGoal - today.steps };
    const bucket = stepPct >= 100 ? "done" : stepPct >= 50 ? "half" : "start";
    const actionTip = MOVEMENT_TIPS[bucket][greeting.period](ctx);

    const rhr = today.restingHeartRate;
    const baselineRhr = meanOf(history7Days, (d) => d.restingHeartRate);
    let hrTrendText = rhr ? `Resting heart rate logged at **${rhr} bpm**.` : "";
    if (rhr && baselineRhr) {
      const diff = rhr - baselineRhr;
      hrTrendText =
        diff <= -2
          ? `Your resting heart rate is **${rhr} bpm**, running **${Math.abs(diff)} bpm lower than your 7-day average (${baselineRhr} bpm)**, signaling strong parasympathetic autonomic recovery.`
          : diff >= 3
            ? `Your resting heart rate is **${rhr} bpm** (slightly elevated by **${diff} bpm** vs your 7-day baseline of ${baselineRhr} bpm), suggesting mild physiological strain or delayed recovery.`
            : `Your resting heart rate of **${rhr} bpm** aligns closely with your 7-day baseline (${baselineRhr} bpm), reflecting balanced cardiovascular homeostasis.`;
    }

    const sleepMins = today.sleepDurationMinutes;
    let sleepText = "No overnight sleep session recorded on your synced wearable yet. If you took a power nap or synced recently, metrics will refresh automatically.";
    if (sleepMins > 0) {
      sleepText = `You logged **${formatDuration(sleepMins)}** of sleep with a Sleep Score of **${today.sleepScore}/100**. `;
      const restorative = restorativeMinutes(today.sleepStages);
      if (restorative > 0) sleepText += `Restorative stages (Deep + REM) accounted for **${Math.round((restorative / sleepMins) * 100)}%** (${formatDuration(restorative)}) of your night.`;
    }

    const prompts = [
      {
        id: "sleep-opt",
        title: "Optimize Tonight's Sleep",
        icon: Moon,
        color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20 hover:bg-indigo-500/20",
        prompt: `Based on my sleep data today (${formatDuration(sleepMins)}, score: ${today.sleepScore}) and resting HR (${withUnit(rhr, "bpm")}), give me a tailored 3-step evening wind-down routine to maximize deep sleep tonight.`,
      },
      {
        id: "workout-plan",
        title: "Plan Today's Movement",
        icon: Zap,
        color: "text-amber-400 bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/20",
        prompt: `I have logged ${ctx.steps} steps so far today out of my ${today.stepsGoal.toLocaleString()} goal. What specific workout or walking routine should I do today given my current recovery score?`,
      },
      {
        id: "hr-analysis",
        title: "Analyze My Cardiac Recovery",
        icon: Heart,
        color: "text-rose-400 bg-rose-500/10 border-rose-500/20 hover:bg-rose-500/20",
        prompt: `Analyze my resting heart rate trend (${rhr ? `${rhr} bpm` : "recent readings"} vs 7-day average ${baselineRhr ? `${baselineRhr} bpm` : "baseline"}). What does this mean for my cardiovascular fitness and stress recovery?`,
      },
    ];

    return { sleepText, hrTrendText, actionTip, prompts };
  }, [today, history7Days, greeting.period]);

  const regenerate = () => {
    setIsRegenerating(true);
    setTimeout(() => {
      setEdition((e) => e + 1);
      setIsRegenerating(false);
    }, 600);
  };

  const GreetingIcon = greeting.icon;
  const lines = [
    { dot: "bg-teal-400", text: synthesis.sleepText, styles: BOLD },
    { dot: "bg-rose-400", text: synthesis.hrTrendText, styles: BOLD },
    { dot: "bg-amber-400", text: synthesis.actionTip, styles: BOLD_ACCENT },
  ].filter((line) => line.text);

  return (
    <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900/90 via-slate-900/80 to-slate-950/90 dark:from-slate-900/95 dark:via-slate-950/90 dark:to-black border border-slate-700/50 dark:border-slate-800/80 p-5 sm:p-6 shadow-xl backdrop-blur-md transition-all duration-300 hover:border-slate-600/60">
      <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-gradient-to-br from-teal-500/15 via-indigo-500/10 to-transparent blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full bg-gradient-to-tr from-emerald-500/10 via-cyan-500/10 to-transparent blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800/70">
        <div className="flex items-center space-x-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-tr from-teal-500 to-emerald-400 text-slate-950 shadow-md shadow-teal-500/20">
            <Sparkles className="w-4 h-4 fill-slate-950" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-sm font-semibold text-white tracking-wide">AI Daily Health Briefing</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1 animate-pulse" />
                Live Telemetry Synthesis
              </span>
            </div>
            <div className="flex items-center space-x-1.5 text-xs text-slate-400 mt-0.5">
              <GreetingIcon className="w-3.5 h-3.5 text-amber-400" />
              <span>{greeting.text}</span>
              <span className="text-slate-600">•</span>
              <span>{greeting.label}</span>
            </div>
          </div>
        </div>
        <button onClick={regenerate} disabled={isRegenerating} title="Refresh AI briefing synthesis" className="inline-flex items-center space-x-1.5 px-2.5 py-1 text-xs font-medium text-slate-400 hover:text-slate-200 bg-slate-800/60 hover:bg-slate-800 rounded-lg border border-slate-700/60 transition-colors">
          <RefreshCw className={`w-3 h-3 ${isRegenerating ? "animate-spin text-teal-400" : ""}`} />
          <span>{isRegenerating ? "Synthesizing..." : "Refresh"}</span>
        </button>
      </div>

      <div className="relative z-10 mt-4 space-y-3">
        <div className="text-sm text-slate-200 leading-relaxed space-y-2">
          {lines.map((line, i) => (
            <p key={i} className="flex items-start gap-2">
              <span className={`inline-block w-1.5 h-1.5 rounded-full mt-2 shrink-0 ${line.dot}`} />
              <span>{renderInline(line.text, line.styles)}</span>
            </p>
          ))}
        </div>

        <div className="pt-3 border-t border-slate-800/60">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Deep-Dive with AI Coach:</span>
            <span className="text-[10px] text-slate-500">1-click automated inquiry</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {synthesis.prompts.map(({ id, title, icon: Icon, color, prompt }) => (
              <button key={id} onClick={() => onOpenChatWithPrompt(prompt)} className={`flex items-center justify-between p-2.5 rounded-xl border text-left text-xs transition-all duration-200 group ${color}`}>
                <div className="flex items-center space-x-2 truncate">
                  <Icon className="w-4 h-4 shrink-0 transition-transform group-hover:scale-110" />
                  <span className="font-medium truncate text-slate-200 group-hover:text-white">{title}</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-white transition-transform group-hover:translate-x-0.5 shrink-0 ml-1" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
