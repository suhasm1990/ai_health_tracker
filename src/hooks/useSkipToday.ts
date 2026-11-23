"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import type { GoalView } from "@/lib/goals/types";

const storageKey = (date: string) => `skipped-workout:${date}`;

/** Local skips change only through this hook (or another tab), so a tiny listener set is all it takes. */
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
};

function readLocal(date: string): boolean {
  try {
    return window.localStorage.getItem(storageKey(date)) === "1";
  } catch {
    return false;
  }
}

/**
 * Skipping today's workout. A training program records the skip on the plan (so the week
 * re-balances and the coach knows); a general suggestion only needs remembering on this device.
 */
export function useSkipToday({
  date,
  goals,
  saveProgramSkip,
}: {
  date: string;
  goals: GoalView[] | undefined;
  saveProgramSkip: (goalId: string, date: string, skipped: boolean) => Promise<void>;
}) {
  const program = goals?.find((g) => g.kind === "program");
  const session = program?.kind === "program" ? program.todaySession : null;
  const onProgram = Boolean(program && session && session.distanceKm > 0);
  const localSkip = useSyncExternalStore(subscribe, () => readLocal(date), () => false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setSkipped = useCallback(
    async (skipped: boolean) => {
      setError(null);
      if (onProgram && program && session) {
        setPending(true);
        try {
          await saveProgramSkip(program.goal.id, session.date, skipped);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not update today's session");
        } finally {
          setPending(false);
        }
        return;
      }
      try {
        if (skipped) window.localStorage.setItem(storageKey(date), "1");
        else window.localStorage.removeItem(storageKey(date));
      } catch {
        setError("This browser won't save the skip. Try again outside private browsing.");
      }
      listeners.forEach((l) => l());
    },
    [onProgram, program, session, saveProgramSkip, date]
  );

  return { skippedToday: !onProgram && localSkip, setSkipped, pending, error };
}
