"use client";

import { Dumbbell, HeartPulse, Sparkles, Sun, type LucideIcon } from "lucide-react";
import type { Tab } from "@/hooks/useTab";

const ITEMS: { tab: Tab; label: string; icon: LucideIcon }[] = [
  { tab: "today", label: "Today", icon: Sun },
  { tab: "training", label: "Training", icon: Dumbbell },
  { tab: "health", label: "Health", icon: HeartPulse },
];

interface AppNavProps {
  tab: Tab;
  onChange: (tab: Tab) => void;
  onOpenCoach: () => void;
}

/** Segmented tabs under the header on tablet and desktop. */
export function TopTabs({ tab, onChange }: Omit<AppNavProps, "onOpenCoach">) {
  return (
    <nav aria-label="Sections" className="hidden sm:flex items-center gap-1 p-1 rounded-2xl bg-slate-200/60 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 w-fit">
      {ITEMS.map(({ tab: value, label, icon: Icon }) => {
        const active = tab === value;
        return (
          <button
            key={value}
            onClick={() => onChange(value)}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              active ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Icon className={`w-4 h-4 ${active ? "text-emerald-500" : ""}`} />
            {label}
          </button>
        );
      })}
    </nav>
  );
}

/** Thumb-reach tab bar on phones, with the coach one tap away in the middle. */
export function BottomTabBar({ tab, onChange, onOpenCoach }: AppNavProps) {
  const [first, ...rest] = ITEMS;
  const item = ({ tab: value, label, icon: Icon }: (typeof ITEMS)[number]) => {
    const active = tab === value;
    return (
      <button
        key={value}
        onClick={() => onChange(value)}
        aria-current={active ? "page" : undefined}
        className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold transition-colors ${active ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500 dark:text-slate-400"}`}
      >
        <Icon className="w-5 h-5" strokeWidth={active ? 2.4 : 2} />
        {label}
      </button>
    );
  };
  return (
    <nav
      aria-label="Sections"
      className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-white/90 dark:bg-slate-950/90 backdrop-blur-xl border-t border-slate-200 dark:border-slate-800 pb-[env(safe-area-inset-bottom)]"
    >
      <div className="flex items-stretch px-2">
        {item(first)}
        <button onClick={onOpenCoach} className="flex-1 flex flex-col items-center gap-0.5 py-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200" aria-label="Open AI coach">
          <span className="-mt-5 w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shadow-lg shadow-emerald-900/30 ring-4 ring-white dark:ring-slate-950">
            <Sparkles className="w-5 h-5" />
          </span>
          Coach
        </button>
        {rest.map(item)}
      </div>
    </nav>
  );
}
