"use client";

import { useCallback, useEffect, useState } from "react";
import type { HabitKey } from "@/lib/journal/habits";
import type { JournalPayload } from "@/lib/journal/service";
import { clientLocale } from "@/lib/utils";

async function fetchJournal(): Promise<JournalPayload> {
  const { clientDate, tz } = clientLocale();
  const params = new URLSearchParams({ clientDate });
  if (tz) params.set("tz", tz);
  const res = await fetch(`/api/journal?${params}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Could not load journal (${res.status})`);
  return body as JournalPayload;
}

async function post(body: Record<string, unknown>) {
  const { clientDate, tz } = clientLocale();
  const res = await fetch("/api/journal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, clientDate, tz }) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Could not save");
}

/** Journal entries, habit insights and coach memories; `scope` changing reloads them. */
export function useJournal(scope: string) {
  const [data, setData] = useState<JournalPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    () =>
      fetchJournal().then(
        (payload) => (setData(payload), setError(null)),
        (err: unknown) => setError(err instanceof Error ? err.message : "Could not load journal")
      ),
    []
  );

  useEffect(() => {
    let live = true;
    fetchJournal().then(
      (payload) => live && (setData(payload), setError(null)),
      (err: unknown) => live && setError(err instanceof Error ? err.message : "Could not load journal")
    );
    return () => {
      live = false;
    };
  }, [scope]);

  /** Optimistic toggle; the refetch brings back fresh insights. */
  const toggle = useCallback(
    async (date: string, habit: HabitKey) => {
      const logged = data?.recent.some((e) => e.date === date && e.habit === habit) ?? false;
      setData((prev) =>
        prev && { ...prev, recent: logged ? prev.recent.filter((e) => !(e.date === date && e.habit === habit)) : [...prev.recent, { date, habit, amount: null, note: null }] }
      );
      await post({ action: logged ? "unlog" : "log", date, habit }).catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not save"));
      await refresh();
    },
    [data, refresh]
  );

  const forget = useCallback(
    async (id: string) => {
      setData((prev) => prev && { ...prev, memories: prev.memories.filter((m) => m.id !== id) });
      await post({ action: "forget", id }).catch(() => null);
      await refresh();
    },
    [refresh]
  );

  return { data, error, refresh, toggle, forget };
}
