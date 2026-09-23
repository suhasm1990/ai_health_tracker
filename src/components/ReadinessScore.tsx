"use client";

import { Activity, Flame, Heart, Moon, Sparkles, Zap, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { GOALS } from "@/lib/constants";
import { calculateReadiness, type ReadinessBreakdown, type ReadinessFactor, type ReadinessTheme } from "@/lib/readiness";
import type { DailyMetricSummary } from "@/lib/types";
import { formatDuration, pct } from "@/lib/utils";

interface ReadinessScoreProps {
  today: DailyMetricSummary;
  history7Days: DailyMetricSummary[];
}

const TIER_STYLES: Record<ReadinessTheme, { badge: string; glow: string }> = {
  emerald: { badge: "bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30", glow: "from-emerald-500/20 via-teal-500/10 to-transparent" },
  teal: { badge: "bg-teal-500/10 dark:bg-teal-500/20 text-teal-600 dark:text-teal-400 border-teal-500/30", glow: "from-teal-500/20 via-cyan-500/10 to-transparent" },
  amber: { badge: "bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30", glow: "from-amber-500/20 via-orange-500/10 to-transparent" },
};

type FactorKey = keyof ReadinessBreakdown["factors"];

const FACTORS: { key: FactorKey; label: string; icon: LucideIcon; iconClass: string; textClass: string; bar: string; detail: (f: ReadinessFactor) => string }[] = [
  { key: "autonomic", label: "Autonomic HRV", icon: Activity, iconClass: "text-purple-500", textClass: "text-purple-600 dark:text-purple-400", bar: "from-purple-500 to-indigo-400", detail: (f) => `${f.valueFormatted} • ${f.status}` },
  { key: "sleep", label: "Sleep Restore", icon: Moon, iconClass: "text-cyan-500", textClass: "text-cyan-600 dark:text-cyan-400", bar: "from-cyan-500 to-blue-400", detail: (f) => `Score ${f.valueFormatted} • ${f.status}` },
  { key: "cardiac", label: "Cardiac Rest", icon: Heart, iconClass: "text-rose-500", textClass: "text-rose-600 dark:text-rose-400", bar: "from-rose-500 to-amber-400", detail: (f) => `${f.valueFormatted} • ${f.status}` },
  { key: "vitality", label: "Vitality & Strain", icon: Flame, iconClass: "text-amber-500", textClass: "text-amber-600 dark:text-amber-400", bar: "from-amber-400 to-emerald-400", detail: (f) => `${f.status} • ${f.valueFormatted}` },
];

/** Concentric rings, outermost first. */
const RINGS = [
  { id: "move", name: "Move", stops: ["#FB7185", "#F43F5E"], track: "text-rose-500/15 dark:text-rose-500/20", swatch: "from-rose-500 to-orange-400", text: "text-rose-500 dark:text-rose-400" },
  { id: "energy", name: "Energy", stops: ["#FBBF24", "#34D399"], track: "text-amber-500/15 dark:text-amber-500/20", swatch: "from-amber-400 to-emerald-400", text: "text-emerald-500 dark:text-emerald-400" },
  { id: "sleep", name: "Sleep", stops: ["#38BDF8", "#6366F1"], track: "text-indigo-500/15 dark:text-indigo-500/20", swatch: "from-cyan-400 to-indigo-500", text: "text-indigo-500 dark:text-indigo-400" },
];
const CENTER = 110;
const STROKE = 10;
const OUTER_RADIUS = CENTER - STROKE / 2 - 8;
const RING_GAP = STROKE + 4;

export function ReadinessScore({ today, history7Days }: ReadinessScoreProps) {
  // Rings sweep in after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 150);
    return () => clearTimeout(timer);
  }, []);

  const { score, tier, factors } = useMemo(() => calculateReadiness(today, history7Days), [today, history7Days]);
  const styles = TIER_STYLES[tier.theme];

  const rings = [
    { ...RINGS[0], pct: pct(today.steps, today.stepsGoal), value: today.steps.toLocaleString(), target: `/ ${today.stepsGoal.toLocaleString()} steps` },
    { ...RINGS[1], pct: pct(today.caloriesBurned, today.caloriesGoal), value: today.caloriesBurned.toLocaleString(), target: `/ ${today.caloriesGoal.toLocaleString()} kcal` },
    { ...RINGS[2], pct: pct(today.sleepDurationMinutes, GOALS.sleepMinutes), value: formatDuration(today.sleepDurationMinutes), target: "/ 8h optimal" },
  ].map((ring, i) => {
    const radius = OUTER_RADIUS - i * RING_GAP;
    const circumference = 2 * Math.PI * radius;
    return { ...ring, radius, circumference, offset: circumference * (1 - (mounted ? ring.pct / 100 : 0)), delay: `delay-${i * 100}` };
  });

  return (
    <section className="relative overflow-hidden bg-white/80 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-4 sm:p-7 shadow-xs backdrop-blur-md transition-all duration-300">
      <div className={`absolute -top-24 -left-24 w-96 h-96 rounded-full bg-gradient-to-br ${styles.glow} blur-3xl pointer-events-none opacity-80 dark:opacity-50`} />
      <div className="absolute -bottom-24 -right-24 w-80 h-80 rounded-full bg-gradient-to-tl from-indigo-500/10 via-purple-500/5 to-transparent blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-6 lg:gap-8">
        <div className="flex-1 space-y-3 sm:space-y-4 w-full">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-white shadow-md shadow-emerald-500/20">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight">Daily Readiness & Recovery</h2>
                <p className="hidden sm:block text-xs text-slate-500 dark:text-slate-400">Multivariate physiological recovery synthesis</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {factors.autonomic.isPeak && (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-500/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/30 flex items-center space-x-1 shadow-xs animate-pulse">
                  <Activity className="w-3.5 h-3.5" />
                  <span>HRV Peak ({factors.autonomic.hrvMs} ms)</span>
                </span>
              )}
              <span className={`text-xs font-semibold px-3 py-1 rounded-full border shadow-xs flex items-center space-x-1.5 ${styles.badge}`}>
                <span className="w-2 h-2 rounded-full bg-current animate-pulse inline-block" />
                <span>{tier.label}</span>
              </span>
            </div>
          </div>

          <div className="bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/50 rounded-2xl p-3 sm:p-4">
            <div className="flex items-start space-x-3">
              <div className="p-1.5 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0">
                <Zap className="w-4 h-4" />
              </div>
              <p className="flex-1 text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                <span className="font-semibold text-slate-900 dark:text-white block sm:inline mr-1">Clinical Recommendation:</span>
                {tier.guidance}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5 pt-1 text-xs">
            {FACTORS.map(({ key, label, icon: Icon, iconClass, textClass, bar, detail }) => {
              const factor = factors[key];
              return (
                <div key={key} className="bg-slate-50/50 dark:bg-slate-800/30 rounded-xl p-2.5 border border-slate-200/40 dark:border-slate-800">
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
                    <span className="flex items-center space-x-1 text-[11px] font-medium">
                      <Icon className={`w-3.5 h-3.5 ${iconClass}`} />
                      <span>{label}</span>
                    </span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {factor.score}/{factor.max}
                    </span>
                  </div>
                  <div className={`text-[10px] font-medium mb-1.5 truncate ${textClass}`}>{detail(factor)}</div>
                  <div className="w-full h-1.5 bg-slate-200/70 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div className={`h-full bg-gradient-to-r rounded-full transition-all duration-1000 ease-out ${bar}`} style={{ width: `${(factor.score / factor.max) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-row items-center gap-4 sm:gap-7 shrink-0 w-full sm:w-auto justify-center">
          <div className="relative w-36 h-36 sm:w-52 sm:h-52 shrink-0 flex items-center justify-center">
            <svg className="w-full h-full -rotate-90 transform" viewBox={`0 0 ${CENTER * 2} ${CENTER * 2}`} aria-label={`Readiness ${score} out of 100`}>
              <defs>
                {rings.map((ring) => (
                  <linearGradient key={ring.id} id={`ring-${ring.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor={ring.stops[0]} />
                    <stop offset="100%" stopColor={ring.stops[1]} />
                  </linearGradient>
                ))}
              </defs>
              {rings.map((ring) => (
                <circle key={`${ring.id}-track`} cx={CENTER} cy={CENTER} r={ring.radius} fill="none" stroke="currentColor" strokeWidth={STROKE} className={ring.track} />
              ))}
              {rings.map((ring) => (
                <circle
                  key={ring.id}
                  cx={CENTER}
                  cy={CENTER}
                  r={ring.radius}
                  fill="none"
                  stroke={`url(#ring-${ring.id})`}
                  strokeWidth={STROKE}
                  strokeLinecap="round"
                  strokeDasharray={ring.circumference}
                  strokeDashoffset={ring.offset}
                  className={`transition-all duration-1000 ease-out ${ring.delay}`}
                />
              ))}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center select-none pointer-events-none">
              <span className="text-2xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight leading-none">{score}</span>
              <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mt-1">Readiness</span>
            </div>
          </div>

          <div className="space-y-2.5 text-xs">
            {rings.map((ring) => (
              <div key={ring.id} className="flex items-center space-x-2.5">
                <div className={`w-3 h-3 rounded-full bg-gradient-to-tr shrink-0 shadow-xs ${ring.swatch}`} />
                <div>
                  <div className="flex items-center space-x-1.5">
                    <span className="font-semibold text-slate-900 dark:text-white">{ring.value}</span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">{ring.target}</span>
                  </div>
                  <div className={`text-[10px] font-medium ${ring.text}`}>
                    {ring.pct}% of {ring.name} Goal
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
