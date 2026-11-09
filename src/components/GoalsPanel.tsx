"use client";

import { BarChart3, Dumbbell, Footprints, PartyPopper, PersonStanding, Plus, Target, Trophy, Zap, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ActivityCard } from "@/components/goals/ActivityCard";
import { BadgeMedal, sortBadges } from "@/components/goals/BadgeMedal";
import { ProgramCard } from "@/components/goals/ProgramCard";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import type { Badge, GoalSuggestion, GoalsPayload } from "@/lib/goals/types";

const SEEN_BADGES_KEY = "health-app-seen-badges";

export const SUGGESTION_ICONS: Record<GoalSuggestion["icon"], LucideIcon> = { run: PersonStanding, walk: Footprints, steps: Footprints, trophy: Trophy, zap: Zap, chart: BarChart3 };

function readSeen(): Set<string> | null {
  try {
    const raw = localStorage.getItem(SEEN_BADGES_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}

/** Badges earned since this browser last looked; remembered so each one celebrates once. */
function useNewBadges(earned: Badge[]): { fresh: Badge[]; dismiss: () => void } {
  const [fresh, setFresh] = useState<Badge[]>([]);
  const key = earned.map((b) => b.id).join("|");
  useEffect(() => {
    const seen = readSeen();
    const unseen = earned.filter((b) => !seen?.has(b.id));
    // Storage is the external system being synced; state mirrors what it says is new.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFresh(unseen);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the stable identity of `earned`
  }, [key]);
  const dismiss = () => {
    try {
      localStorage.setItem(SEEN_BADGES_KEY, JSON.stringify(earned.map((b) => b.id)));
    } catch {
      /* private mode: the banner simply shows again next visit */
    }
    setFresh([]);
  };
  return { fresh, dismiss };
}

function SuggestionChips({ suggestions, onAsk }: { suggestions: GoalSuggestion[]; onAsk: (text: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {suggestions.map((s) => {
        const Icon = SUGGESTION_ICONS[s.icon];
        return (
          <button key={s.prompt} onClick={() => onAsk(s.prompt)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors shadow-xs">
            <Icon className="w-3.5 h-3.5 text-emerald-500" />
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

interface GoalsPanelProps {
  data: GoalsPayload | null;
  error: string | null;
  onAsk: (text: string) => void;
  onOpenChat: () => void;
  onRemove: (id: string) => void;
}

export function GoalsPanel({ data, error, onAsk, onOpenChat, onRemove }: GoalsPanelProps) {
  const goals = useMemo(() => data?.goals ?? [], [data]);
  const earned = useMemo(() => sortBadges(goals.flatMap((g) => g.badges).filter((b) => b.earned)), [goals]);
  const total = goals.reduce((sum, g) => sum + g.badges.length, 0);
  const { fresh, dismiss } = useNewBadges(earned);
  const freshIds = useMemo(() => new Set(fresh.map((b) => b.id)), [fresh]);

  if (!data) {
    return (
      <Panel>
        <PanelHeader icon={Target} iconClass="bg-emerald-500/10 text-emerald-500 border-emerald-500/20" title="Goals & Training" subtitle={error ?? "Loading your goals…"} />
        {!error && <div className="h-24 rounded-xl bg-slate-100 dark:bg-slate-800/60 animate-pulse" />}
      </Panel>
    );
  }

  const programs = goals.filter((g) => g.kind === "program");
  const activities = goals.filter((g) => g.kind === "activity");

  return (
    <Panel>
      <PanelHeader
        icon={Target}
        iconClass="bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
        title="Goals & Training"
        subtitle={goals.length ? "Tracked automatically from your wearable" : "Set a goal in chat and it is tracked here automatically"}
      >
        {earned.length > 0 && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
            <Trophy className="w-3.5 h-3.5" />
            {earned.length}/{total} badges
          </span>
        )}
        <button onClick={onOpenChat} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow transition-colors">
          <Plus className="w-3.5 h-3.5" />
          New goal
        </button>
      </PanelHeader>

      {fresh.length > 0 && (
        <div role="status" className="mb-3 flex items-center gap-2.5 rounded-xl border border-amber-400/40 bg-gradient-to-r from-amber-400/15 via-yellow-300/10 to-transparent px-3 py-2 animate-in fade-in slide-in-from-top duration-300">
          <PartyPopper className="w-5 h-5 text-amber-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-slate-900 dark:text-white">{fresh.length === 1 ? "New badge unlocked!" : `${fresh.length} new badges unlocked!`}</div>
            <div className="flex gap-1 overflow-x-auto pt-2 pb-0.5 px-1">
              {fresh.slice(0, 6).map((b) => (
                <BadgeMedal key={b.id} badge={b} size="sm" isNew />
              ))}
            </div>
          </div>
          <button onClick={dismiss} className="shrink-0 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-white text-[11px] font-semibold transition-colors">
            Nice!
          </button>
        </div>
      )}

      {goals.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-5 sm:p-6 text-center">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-md">
            <Dumbbell className="w-6 h-6" />
          </div>
          <h4 className="mt-3 text-sm font-bold text-slate-900 dark:text-white">What do you want to work toward?</h4>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 max-w-md mx-auto">Train for a race, or set a walking, running or step goal. Tell the coach in your own words; it builds the plan, tracks it from your watch and awards badges along the way.</p>
          <div className="mt-4 flex justify-center">
            <SuggestionChips suggestions={data.suggestions} onAsk={onAsk} />
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          {programs.map((view) => view.kind === "program" && <ProgramCard key={view.goal.id} view={view} today={data.today} newBadgeIds={freshIds} onAsk={onAsk} onRemove={() => onRemove(view.goal.id)} />)}
          {activities.map((view) => view.kind === "activity" && <ActivityCard key={view.goal.id} view={view} today={data.today} newBadgeIds={freshIds} onAsk={onAsk} onRemove={() => onRemove(view.goal.id)} />)}
        </div>
      )}

      {!data.persistent && goals.length > 0 && <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">These goals are kept for this session only. Connect your Google account (with a database configured) to keep them.</p>}
    </Panel>
  );
}
