"use client";

import { useCallback, useEffect, useState } from "react";
import type { GoalsPayload } from "@/lib/goals/types";
import { clientLocale } from "@/lib/utils";

function goalsUrl(extra: Record<string, string> = {}): string {
  const { clientDate, tz } = clientLocale();
  const params = new URLSearchParams({ clientDate, ...extra });
  if (tz) params.set("tz", tz);
  return `/api/goals?${params}`;
}

async function fetchGoals(): Promise<GoalsPayload> {
  const res = await fetch(goalsUrl());
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Could not load goals (${res.status})`);
  return body as GoalsPayload;
}

/** Loads goals with live progress; `scope` changing (demo toggled, account switched) reloads them. */
export function useGoals(scope: string) {
  const [data, setData] = useState<GoalsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    () =>
      fetchGoals().then(
        (payload) => {
          setData(payload);
          setError(null);
        },
        (err: unknown) => setError(err instanceof Error ? err.message : "Could not load goals")
      ),
    []
  );

  useEffect(() => {
    let live = true;
    fetchGoals().then(
      (payload) => live && (setData(payload), setError(null)),
      (err: unknown) => live && setError(err instanceof Error ? err.message : "Could not load goals")
    );
    return () => {
      live = false;
    };
  }, [scope]);

  const archive = useCallback(
    async (id: string) => {
      // Drop it right away; the refetch confirms.
      setData((prev) => (prev ? { ...prev, goals: prev.goals.filter((g) => g.goal.id !== id) } : prev));
      await fetch(goalsUrl({ id }), { method: "DELETE" }).catch(() => null);
      await refresh();
    },
    [refresh]
  );

  /** Marks a planned run as skipped (or undoes it), then reloads so the week re-balances. */
  const setSkipped = useCallback(
    async (goalId: string, date: string, skipped: boolean) => {
      const res = await fetch(goalsUrl(), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goalId, date, skipped }) }).catch(() => null);
      const body = res ? await res.json().catch(() => ({})) : {};
      await refresh();
      if (!res?.ok) throw new Error(body.error || "Could not update today's session");
    },
    [refresh]
  );

  return { data, error, isLoading: data === null && error === null, refresh, archive, setSkipped };
}
