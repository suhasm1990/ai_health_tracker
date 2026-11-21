"use client";

import { Brain, Coffee, Dumbbell, Flame, Leaf, NotebookPen, Plane, Smartphone, Thermometer, TrendingDown, TrendingUp, Utensils, Wine, X, Zap, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { HABIT_KEYS, HABITS, type CoachMemory, type HabitIcon, type HabitKey } from "@/lib/journal/habits";
import type { JournalPayload } from "@/lib/journal/service";
import { shiftIso } from "@/lib/utils";

const ICONS: Record<HabitIcon, LucideIcon> = {
  wine: Wine,
  coffee: Coffee,
  utensils: Utensils,
  smartphone: Smartphone,
  zap: Zap,
  dumbbell: Dumbbell,
  plane: Plane,
  leaf: Leaf,
  flame: Flame,
  thermometer: Thermometer,
};

interface JournalCardProps {
  data: JournalPayload | null;
  error: string | null;
  onToggle: (date: string, habit: HabitKey) => void;
}

/** One-tap habit log for yesterday or today, and what those habits do to the next morning. */
export function JournalCard({ data, error, onToggle }: JournalCardProps) {
  const [day, setDay] = useState<"yesterday" | "today">("yesterday");
  const today = data?.today;
  const date = today ? (day === "today" ? today : shiftIso(today, -1)) : null;
  const logged = new Set(data?.recent.filter((e) => e.date === date).map((e) => e.habit));
  const insights = data?.insights ?? [];

  return (
    <Panel>
      <PanelHeader icon={NotebookPen} iconClass="bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20" title="Habit journal" subtitle="Log what you did; see what it does to your next morning">
        <div className="flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold" role="radiogroup" aria-label="Day to log">
          {(["yesterday", "today"] as const).map((d) => (
            <button
              key={d}
              role="radio"
              aria-checked={day === d}
              onClick={() => setDay(d)}
              className={`px-2.5 py-1 rounded-md capitalize transition-colors ${day === d ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs" : "text-slate-500 dark:text-slate-400"}`}
            >
              {d}
            </button>
          ))}
        </div>
      </PanelHeader>

      {error && !data && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}

      <div className="flex flex-wrap gap-2">
        {HABIT_KEYS.map((key) => {
          const { label, icon } = HABITS[key];
          const Icon = ICONS[icon];
          const on = logged.has(key);
          return (
            <button
              key={key}
              disabled={!date}
              onClick={() => date && onToggle(date, key)}
              aria-pressed={on}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                on
                  ? "bg-violet-600 text-white border-violet-600 shadow-sm"
                  : "bg-white dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-violet-400"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">Or just tell the coach, like &ldquo;had 2 beers last night&rdquo;.</p>

      <div className="mt-5">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">What your habits do</div>
        {insights.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Log habits for a couple of weeks and the patterns in your own recovery show up here.</p>
        ) : (
          <ul className="space-y-2">
            {insights.slice(0, 4).map((i) => {
              const top = i.effects[0];
              const Icon = ICONS[HABITS[i.habit].icon];
              const tone = !i.ready || !top ? "neutral" : top.better ? "good" : "bad";
              return (
                <li key={i.habit} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/50">
                  <span className="mt-0.5 w-7 h-7 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-800 dark:text-slate-100">{i.headline}</p>
                    {i.ready && i.effects.length > 1 && (
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {i.effects
                          .slice(1, 3)
                          .map((e) => `${e.metric} ${e.changePct > 0 ? "+" : ""}${e.changePct}%`)
                          .join(" · ")}
                        {` · ${i.yesMornings} vs ${i.noMornings} mornings`}
                      </p>
                    )}
                  </div>
                  {tone !== "neutral" && top && (
                    <span className={`shrink-0 inline-flex items-center gap-1 text-xs font-bold tabular-nums ${tone === "bad" ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                      {top.changePct > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                      {top.changePct > 0 ? "+" : ""}
                      {top.changePct}%
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">Patterns in your own data, not proof of cause.</p>
      </div>
    </Panel>
  );
}

interface MemoryCardProps {
  memories: CoachMemory[];
  persistent: boolean;
  onForget: (id: string) => void;
  onTell: () => void;
}

const CATEGORY_LABEL: Record<CoachMemory["category"], string> = { goal: "Goal", injury: "Injury", health: "Health", schedule: "Schedule", preference: "Preference", other: "Note" };

/** What the coach has saved about the user, visible and deletable. */
export function MemoryCard({ memories, persistent, onForget, onTell }: MemoryCardProps) {
  return (
    <Panel className="flex flex-col">
      <PanelHeader icon={Brain} iconClass="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" title="Your coach remembers" subtitle="Used in every conversation. Remove anything anytime." />
      {memories.length === 0 ? (
        <div className="flex-1 text-sm text-slate-500 dark:text-slate-400 space-y-3">
          <p>Nothing yet. Tell your coach what matters, and it will plan around it:</p>
          <ul className="space-y-1 text-xs italic">
            <li>&ldquo;Remember my left knee gets sore on downhills&rdquo;</li>
            <li>&ldquo;I can only train before 7 AM on weekdays&rdquo;</li>
            <li>&ldquo;I&apos;d rather cycle than run&rdquo;</li>
          </ul>
        </div>
      ) : (
        <ul className="flex-1 space-y-1.5">
          {memories.map((m) => (
            <li key={m.id} className="group flex items-start gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/50">
              <span className="shrink-0 mt-0.5 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">{CATEGORY_LABEL[m.category]}</span>
              <span className="flex-1 min-w-0 text-sm text-slate-800 dark:text-slate-100">{m.text}</span>
              <button onClick={() => onForget(m.id)} aria-label={`Forget: ${m.text}`} className="shrink-0 p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-500/10 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex items-center justify-between gap-2">
        <button onClick={onTell} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors">
          Tell your coach something
        </button>
        {!persistent && <span className="text-[11px] text-slate-400 dark:text-slate-500 text-right">Kept for this session only. Connect your account to keep it.</span>}
      </div>
    </Panel>
  );
}
