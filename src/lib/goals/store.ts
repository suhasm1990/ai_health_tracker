import { and, eq } from "drizzle-orm";
import type { AuthState } from "../auth";
import { getDb, goals } from "../db";
import { ensureUser } from "../history";
import type { Goal } from "./types";

/** Enough for a program plus a handful of monthly goals, and it keeps the dashboard readable. */
export const MAX_ACTIVE_GOALS = 12;

export interface GoalStore {
  /** False when goals live only in this server process (demo mode or no database). */
  persistent: boolean;
  list(): Promise<Goal[]>;
  create(goal: Goal): Promise<void>;
  /** Replaces a goal's content (same id). */
  update(goal: Goal): Promise<void>;
  archive(id: string): Promise<boolean>;
}

const memory = (globalThis as unknown as { __ghGoals?: Map<string, Goal[]> }).__ghGoals ??= new Map<string, Goal[]>();
(globalThis as unknown as { __ghGoals?: Map<string, Goal[]> }).__ghGoals = memory;

/** Demo goals are throwaway; cap how many visitors' lists one server process holds. */
const MAX_MEMORY_SCOPES = 500;

function memoryStore(scope: string): GoalStore {
  const mine = () => memory.get(scope) ?? [];
  const save = (goals: Goal[]) => {
    memory.delete(scope); // re-insert so the most recently used scope is the last evicted
    memory.set(scope, goals);
    if (memory.size > MAX_MEMORY_SCOPES) memory.delete(memory.keys().next().value!);
  };
  return {
    persistent: false,
    list: async () => mine().filter((g) => g.status === "active"),
    create: async (goal) => save([...mine(), goal]),
    update: async (goal) => save(mine().map((g) => (g.id === goal.id ? goal : g))),
    archive: async (id) => {
      const before = mine();
      save(before.filter((g) => g.id !== id));
      return before.some((g) => g.id === id);
    },
  };
}

/** Postgres "undefined_table": the goals migration has not been applied to this database yet. */
const isMissingTable = (err: unknown): boolean => {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "42P01" || e?.cause?.code === "42P01";
};
let warnedMissingTable = false;

/** Postgres for connected accounts; otherwise an in-memory list so demo mode and database-less setups still work. */
export function goalStore(state: AuthState, timeZone?: string, guest?: string): GoalStore {
  const db = getDb();
  const userId = state.session?.user?.id;
  // Signed-out visitors are told apart by their guest cookie, never pooled under one key.
  const fallback = memoryStore(state.isAuthenticated ? `user:${state.scope}` : `guest:${guest ?? "shared"}`);
  if (!db || !userId || state.isDemo) return fallback;

  /** Until `npm run db:migrate` has created the table, goals work from memory instead of failing the dashboard. */
  const orMemory = async <T>(run: () => Promise<T>, inMemory: () => Promise<T>): Promise<T> => {
    try {
      return await run();
    } catch (err) {
      if (!isMissingTable(err)) throw err;
      if (!warnedMissingTable) console.warn('The "goals" table does not exist yet: run `npm run db:migrate`. Goals are kept in memory until then.');
      warnedMissingTable = true;
      store.persistent = false;
      return inMemory();
    }
  };

  const store: GoalStore = {
    persistent: true,
    list: () =>
      orMemory(async () => {
        const rows = await db.select({ data: goals.data }).from(goals).where(and(eq(goals.userId, userId), eq(goals.status, "active"))).orderBy(goals.createdAt);
        return rows.map((r) => r.data);
      }, fallback.list),
    create: (goal) =>
      orMemory(async () => {
        // The goals table references users; a goal can be the first thing a new account stores.
        await ensureUser(db, state, timeZone);
        await db.insert(goals).values({ id: goal.id, userId, kind: goal.kind, status: goal.status, startDate: goal.startDate, endDate: goal.endDate, data: goal });
      }, () => fallback.create(goal)),
    update: (goal) =>
      orMemory(async () => {
        await db.update(goals).set({ startDate: goal.startDate, endDate: goal.endDate, data: goal, updatedAt: new Date() }).where(and(eq(goals.userId, userId), eq(goals.id, goal.id)));
      }, () => fallback.update(goal)),
    archive: (id) =>
      orMemory(async () => {
        const rows = await db
          .update(goals)
          .set({ status: "archived", updatedAt: new Date() })
          .where(and(eq(goals.userId, userId), eq(goals.id, id), eq(goals.status, "active")))
          .returning({ id: goals.id });
        return rows.length > 0;
      }, () => fallback.archive(id)),
  };
  return store;
}

export const newGoalId = (): string => `goal_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
