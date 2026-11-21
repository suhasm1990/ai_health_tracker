"use client";

import { useMemo } from "react";
import { useClientHour } from "@/hooks/useClientHour";
import { buildDayPlan, type DayPlanInput } from "@/lib/coach/dayPlan";

/** The coach's plan for today, recomputed as data syncs and the hour rolls over. */
export function useDayPlan({ today, history, baseline, signals, goals, todayWorkouts, loggedYesterday }: Omit<DayPlanInput, "hour">) {
  const hour = useClientHour();
  const plan = useMemo(() => buildDayPlan({ today, history, baseline, signals, goals, todayWorkouts, hour, loggedYesterday }), [today, history, baseline, signals, goals, todayWorkouts, hour, loggedYesterday]);
  return { plan, hour };
}
