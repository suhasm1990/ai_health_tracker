import { and, asc, desc, eq, gte } from "drizzle-orm";
import type { AuthState } from "../auth";
import { coachMemories, getDb, journalEntries } from "../db";
import { ensureUser } from "../history";
import type { CoachMemory, HabitKey, JournalEntry, MemoryCategory } from "../journal/habits";
import { lastDays, shiftIso, todayIso } from "../utils";

/** Enough to cover what matters without bloating every chat prompt. */
export const MAX_MEMORIES = 30;
const MAX_MEMORY_CHARS = 280;

export interface CoachStore {
  /** False when data lives only in this server process (demo mode or no database). */
  persistent: boolean;
  memories(): Promise<CoachMemory[]>;
  remember(category: MemoryCategory, text: string): Promise<CoachMemory>;
  forget(id: string): Promise<boolean>;
  /** Entries on or after `fromIso`, oldest first. */
  journal(fromIso: string): Promise<JournalEntry[]>;
  log(entry: JournalEntry): Promise<void>;
  unlog(date: string, habit: HabitKey): Promise<boolean>;
}

interface Scope {
  memories: CoachMemory[];
  journal: JournalEntry[];
}

const g = globalThis as unknown as { __ghCoach?: Map<string, Scope> };
const scopes = (g.__ghCoach ??= new Map<string, Scope>());
const MAX_MEMORY_SCOPES = 500;

const newId = () => `mem_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const clean = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, MAX_MEMORY_CHARS);

/**
 * Demo visitors start with a few sample journal entries so the habit insights have
 * something to show; they line up with the demo's lower-HRV mornings (Mon and Fri).
 */
function demoJournal(today: string): JournalEntry[] {
  const [sun, , tue, , thu] = lastDays(shiftIso(today, -1), 6);
  return [
    { date: sun, habit: "alcohol", amount: 2, note: "Sample entry" },
    { date: tue, habit: "alcohol", amount: 1, note: "Sample entry" },
    { date: thu, habit: "alcohol", amount: 3, note: "Sample entry" },
    { date: thu, habit: "late_meal", amount: null, note: "Sample entry" },
  ];
}

function memoryStore(key: string, isDemo: boolean, timeZone?: string): CoachStore {
  const get = (): Scope => {
    let scope = scopes.get(key);
    if (!scope) scope = { memories: [], journal: isDemo ? demoJournal(todayIso(timeZone)) : [] };
    scopes.delete(key); // re-insert so the most recently used scope is evicted last
    scopes.set(key, scope);
    if (scopes.size > MAX_MEMORY_SCOPES) scopes.delete(scopes.keys().next().value!);
    return scope;
  };
  return {
    persistent: false,
    memories: async () => [...get().memories],
    remember: async (category, text) => {
      const memory = { id: newId(), category, text: clean(text), createdAt: new Date().toISOString() };
      const scope = get();
      scope.memories = [...scope.memories, memory].slice(-MAX_MEMORIES);
      return memory;
    },
    forget: async (id) => {
      const scope = get();
      const before = scope.memories.length;
      scope.memories = scope.memories.filter((m) => m.id !== id);
      return scope.memories.length < before;
    },
    journal: async (fromIso) => get().journal.filter((e) => e.date >= fromIso).sort((a, b) => a.date.localeCompare(b.date)),
    log: async (entry) => {
      const scope = get();
      scope.journal = [...scope.journal.filter((e) => !(e.date === entry.date && e.habit === entry.habit)), entry];
    },
    unlog: async (date, habit) => {
      const scope = get();
      const before = scope.journal.length;
      scope.journal = scope.journal.filter((e) => !(e.date === date && e.habit === habit));
      return scope.journal.length < before;
    },
  };
}

const isMissingTable = (err: unknown): boolean => {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "42P01" || e?.cause?.code === "42P01";
};
let warnedMissingTable = false;

/** Postgres for connected accounts; otherwise in memory, like goals. */
export function coachStore(state: AuthState, timeZone?: string, guest?: string): CoachStore {
  const db = getDb();
  const userId = state.session?.user?.id;
  const fallback = memoryStore(state.isAuthenticated ? `user:${state.scope}` : `guest:${guest ?? "shared"}`, state.isDemo, timeZone);
  if (!db || !userId || state.isDemo) return fallback;

  const orMemory = async <T>(run: () => Promise<T>, inMemory: () => Promise<T>): Promise<T> => {
    try {
      return await run();
    } catch (err) {
      if (!isMissingTable(err)) throw err;
      if (!warnedMissingTable) console.warn("Coach memory tables do not exist yet: run `npm run db:migrate`. Keeping them in memory until then.");
      warnedMissingTable = true;
      store.persistent = false;
      return inMemory();
    }
  };

  const store: CoachStore = {
    persistent: true,
    memories: () =>
      orMemory(async () => {
        const rows = await db.select().from(coachMemories).where(eq(coachMemories.userId, userId)).orderBy(asc(coachMemories.createdAt)).limit(MAX_MEMORIES);
        return rows.map((r) => ({ id: r.id, category: r.category as MemoryCategory, text: r.text, createdAt: r.createdAt.toISOString() }));
      }, fallback.memories),
    remember: (category, text) =>
      orMemory(async () => {
        await ensureUser(db, state, timeZone);
        const existing = await db.select({ id: coachMemories.id }).from(coachMemories).where(eq(coachMemories.userId, userId)).orderBy(desc(coachMemories.createdAt));
        // Oldest facts give way once the list is full.
        for (const { id } of existing.slice(MAX_MEMORIES - 1)) await db.delete(coachMemories).where(and(eq(coachMemories.userId, userId), eq(coachMemories.id, id)));
        const memory = { id: newId(), category, text: clean(text), createdAt: new Date().toISOString() };
        await db.insert(coachMemories).values({ id: memory.id, userId, category, text: memory.text });
        return memory;
      }, () => fallback.remember(category, text)),
    forget: (id) =>
      orMemory(async () => {
        const rows = await db.delete(coachMemories).where(and(eq(coachMemories.userId, userId), eq(coachMemories.id, id))).returning({ id: coachMemories.id });
        return rows.length > 0;
      }, () => fallback.forget(id)),
    journal: (fromIso) =>
      orMemory(async () => {
        const rows = await db.select().from(journalEntries).where(and(eq(journalEntries.userId, userId), gte(journalEntries.date, fromIso))).orderBy(asc(journalEntries.date));
        return rows.map((r) => ({ date: r.date, habit: r.habit as HabitKey, amount: r.amount, note: r.note }));
      }, () => fallback.journal(fromIso)),
    log: (entry) =>
      orMemory(async () => {
        await ensureUser(db, state, timeZone);
        await db
          .insert(journalEntries)
          .values({ userId, ...entry })
          .onConflictDoUpdate({ target: [journalEntries.userId, journalEntries.date, journalEntries.habit], set: { amount: entry.amount, note: entry.note } });
      }, () => fallback.log(entry)),
    unlog: (date, habit) =>
      orMemory(async () => {
        const rows = await db
          .delete(journalEntries)
          .where(and(eq(journalEntries.userId, userId), eq(journalEntries.date, date), eq(journalEntries.habit, habit)))
          .returning({ habit: journalEntries.habit });
        return rows.length > 0;
      }, () => fallback.unlog(date, habit)),
  };
  return store;
}
