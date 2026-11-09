"use client";

import { AlertTriangle, BedDouble, CheckCircle2, ChevronDown, Info, PlayCircle, Trash2, type LucideIcon } from "lucide-react";
import { useState } from "react";
import type { Nudge } from "@/lib/goals/types";

const TONES: Record<Nudge["tone"], { icon: LucideIcon; box: string; iconClass: string }> = {
  go: { icon: PlayCircle, box: "bg-emerald-500/10 border-emerald-500/30", iconClass: "text-emerald-600 dark:text-emerald-400" },
  done: { icon: CheckCircle2, box: "bg-teal-500/10 border-teal-500/30", iconClass: "text-teal-600 dark:text-teal-400" },
  rest: { icon: BedDouble, box: "bg-sky-500/10 border-sky-500/30", iconClass: "text-sky-600 dark:text-sky-400" },
  behind: { icon: AlertTriangle, box: "bg-amber-500/10 border-amber-500/30", iconClass: "text-amber-600 dark:text-amber-400" },
  info: { icon: Info, box: "bg-slate-500/10 border-slate-500/20", iconClass: "text-slate-500 dark:text-slate-400" },
};

/** The one thing to do (or celebrate) right now. */
export function NudgeBanner({ nudge, className = "", compact = false, action }: { nudge: Nudge; className?: string; compact?: boolean; action?: { label: string; onClick: () => void } }) {
  const tone = TONES[nudge.tone];
  const Icon = tone.icon;
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border ${compact ? "p-2.5" : "p-3"} ${tone.box} ${className}`}>
      <Icon className={`${compact ? "w-4 h-4" : "w-5 h-5"} shrink-0 mt-0.5 ${tone.iconClass}`} />
      <div className="min-w-0 flex-1">
        <div className={`${compact ? "text-xs" : "text-sm"} font-semibold text-slate-900 dark:text-white`}>{nudge.headline}</div>
        <p className={`${compact ? "text-[11px]" : "text-xs"} text-slate-600 dark:text-slate-400 mt-0.5`}>{nudge.detail}</p>
      </div>
      {action && (
        <button onClick={action.onClick} className="hidden sm:block shrink-0 self-center px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:border-emerald-500 transition-colors">
          {action.label}
        </button>
      )}
    </div>
  );
}

/** Two taps to remove, so a slip never deletes a goal. */
export function RemoveButton({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <button onClick={() => setConfirming(true)} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors">
        <Trash2 className="w-3.5 h-3.5" />
        {label}
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px]">
      <button onClick={onConfirm} className="px-2 py-1 rounded-md bg-rose-600 hover:bg-rose-500 text-white font-semibold">
        Remove
      </button>
      <button onClick={() => setConfirming(false)} className="px-2 py-1 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold">
        Keep
      </button>
    </span>
  );
}

/** Open/closed state of a card's details, remembered per browser so the dashboard opens the way it was left. */
export function useStoredToggle(key: string, initial = false): [boolean, () => void] {
  const [open, setOpen] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved === null ? initial : saved === "1";
    } catch {
      return initial;
    }
  });
  const toggle = () => {
    const next = !open;
    try {
      localStorage.setItem(key, next ? "1" : "0");
    } catch {
      /* private mode: the choice just lasts for this visit */
    }
    setOpen(next);
  };
  return [open, toggle];
}

/** The same "more / less" control on every goal card, phone or desktop. */
export function DetailsToggle({ open, onToggle, label = "details" }: { open: boolean; onToggle: () => void; label?: string }) {
  return (
    <button onClick={onToggle} aria-expanded={open} className="w-full flex items-center justify-center gap-1 py-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 border-t border-slate-100 dark:border-slate-800 transition-colors">
      {open ? "Hide" : "Show"} {label}
      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
  );
}
