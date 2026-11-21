import { coachStore } from "../coach/store";
import { getDb } from "../db";
import type { GoalContext } from "../goals/service";
import { getAllHealthMetrics } from "../health";
import { loadDays } from "../history";
import type { DailyMetricSummary } from "../types";
import { shiftIso, todayIso } from "../utils";
import type { CoachMemory, JournalEntry } from "./habits";
import { habitInsights, type HabitInsight } from "./insights";

/** Window used for habit insights. */
export const INSIGHT_WINDOW_DAYS = 90;

export interface JournalPayload {
  today: string;
  /** Entries from the last 14 days, oldest first, for the logging UI. */
  recent: JournalEntry[];
  insights: HabitInsight[];
  memories: CoachMemory[];
  /** False when journal and memories live only in server memory. */
  persistent: boolean;
}

/** Stored history plus the live 7-day window (fresher), joined by date. */
async function daysFor(ctx: GoalContext, fromIso: string): Promise<{ today: string; days: DailyMetricSummary[] }> {
  const live = await getAllHealthMetrics({ clientDate: ctx.clientDate, clientTz: ctx.clientTz }, ctx.state).catch(() => null);
  const today = live?.today.date ?? ctx.clientDate ?? todayIso(ctx.clientTz);
  const byDate = new Map<string, DailyMetricSummary>();
  const db = getDb();
  const userId = ctx.state.session?.user?.id;
  if (db && userId && !ctx.state.isDemo) {
    for (const d of await loadDays(db, userId, fromIso, today).catch(() => [])) byDate.set(d.date, d);
  }
  for (const d of live?.history7Days ?? []) byDate.set(d.date, d);
  return { today, days: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)) };
}

export async function loadJournal(ctx: GoalContext): Promise<JournalPayload> {
  const store = coachStore(ctx.state, ctx.clientTz, ctx.guestId);
  const anchor = ctx.clientDate ?? todayIso(ctx.clientTz);
  const from = shiftIso(anchor, -INSIGHT_WINDOW_DAYS);
  const [{ today, days }, entries, memories] = await Promise.all([daysFor(ctx, from), store.journal(from), store.memories()]);
  const recentFrom = shiftIso(today, -13);
  return {
    today,
    recent: entries.filter((e) => e.date >= recentFrom),
    insights: habitInsights(entries, days),
    memories,
    persistent: store.persistent,
  };
}
