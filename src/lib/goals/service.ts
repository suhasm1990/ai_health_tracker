import { and, eq, gte, lte } from "drizzle-orm";
import type { AuthState } from "../auth";
import { dailyMetrics, getDb, workouts } from "../db";
import { fetchRecentWorkouts, getAllHealthMetrics } from "../health";
import type { WorkoutSession } from "../types";
import type { HealthMetricsPayload } from "../types";
import { calculateReadiness } from "../readiness";
import { isoToCivil, shiftIso, todayIso } from "../utils";
import { classifyWorkout, type ActivityData, type ActivityWorkout } from "./activity";
import { adaptProgram } from "./adapt";
import { goalView } from "./progress";
import { goalStore } from "./store";
import type { DistanceUnit, Goal, GoalSuggestion, GoalsPayload, GoalView } from "./types";

export interface GoalContext {
  state: AuthState;
  clientDate?: string;
  clientTz?: string;
  /** Guest cookie id for signed-out visitors (see guest.ts). */
  guestId?: string;
}

/** History is read back to the earliest goal start, but never further than this. */
const MAX_LOOKBACK_DAYS = 400;
/** With no goals yet, enough history to size suggestions and a first plan. */
const DEFAULT_LOOKBACK_DAYS = 35;

/** Days of workouts read live from Google on top of stored history. */
const RECENT_WORKOUT_DAYS = 14;

const toWorkout = (date: string, w: Pick<WorkoutSession, "activityType" | "rawType" | "distanceKm" | "durationMinutes">): ActivityWorkout => ({
  date,
  kind: classifyWorkout(w.activityType, w.rawType),
  label: w.activityType,
  distanceKm: w.distanceKm ?? 0,
  minutes: w.durationMinutes,
});

const US_TIME_ZONES = /^(America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit|Boise|Juneau|Sitka|Nome|Adak|Menominee|Yakutat|Metlakatla|Indiana|Kentucky|North_Dakota)|Pacific\/Honolulu|Europe\/London)/;

/** Miles where people run in miles, km elsewhere; used when the user has not said. */
export const defaultUnit = (timeZone?: string): DistanceUnit => (timeZone && US_TIME_ZONES.test(timeZone) ? "mi" : "km");

/**
 * Activity from `fromIso` through today: stored days and workouts, overlaid with the live
 * payload (the last 7 days and today's workouts), which is fresher than storage.
 */
export async function loadActivity(ctx: GoalContext, fromIso: string): Promise<ActivityData> {
  const { state } = ctx;
  let payload: HealthMetricsPayload | null = null;
  try {
    payload = await getAllHealthMetrics({ clientDate: ctx.clientDate, clientTz: ctx.clientTz }, state);
  } catch (err) {
    // Goals still render from stored history when Google is unreachable.
    console.error("Goals: live metrics unavailable:", err);
  }
  const today = payload?.today.date ?? ctx.clientDate ?? todayIso(ctx.clientTz);
  const from = fromIso < shiftIso(today, -MAX_LOOKBACK_DAYS) ? shiftIso(today, -MAX_LOOKBACK_DAYS) : fromIso;
  const data: ActivityData = { today, days: new Map(), workouts: [], readiness: null };

  const db = getDb();
  const userId = state.session?.user?.id;
  if (db && userId && !state.isDemo) {
    try {
      const [dayRows, workoutRows] = await Promise.all([
        db
          .select({ date: dailyMetrics.date, steps: dailyMetrics.steps, distanceKm: dailyMetrics.distanceKm, activeMinutes: dailyMetrics.activeZoneMinutes })
          .from(dailyMetrics)
          .where(and(eq(dailyMetrics.userId, userId), gte(dailyMetrics.date, from), lte(dailyMetrics.date, today))),
        db
          .select({ date: workouts.date, activityType: workouts.activityType, minutes: workouts.durationMinutes, session: workouts.data })
          .from(workouts)
          .where(and(eq(workouts.userId, userId), gte(workouts.date, from), lte(workouts.date, today))),
      ]);
      for (const { date, ...day } of dayRows) data.days.set(date, day);
      data.workouts = workoutRows.map((w) => toWorkout(w.date, { ...w.session, activityType: w.activityType, durationMinutes: w.minutes }));
    } catch (err) {
      console.error("Goals: loading stored activity failed:", err);
    }
  }

  if (payload) {
    // Readiness only counts when last night's readings are in; a carried-over reading says nothing about today.
    const t = payload.today;
    if (!payload.freshness.fallbackDate && (t.sleepDurationMinutes > 0 || t.heartRateVariability !== null)) {
      const r = calculateReadiness(t, payload.history7Days, payload.baseline);
      data.readiness = { score: r.score, label: r.tier.label };
    }
    for (const d of [...payload.history7Days, payload.today]) {
      if (d.date >= from) data.days.set(d.date, { steps: d.steps, distanceKm: d.distanceKm, activeMinutes: d.activeZoneMinutes });
    }
    // Today's workouts come live; anything stored for today is an older copy of the same sessions.
    data.workouts = [...data.workouts.filter((w) => w.date !== today), ...(payload.todayWorkouts ?? []).map((w) => toWorkout(today, w))];
  }

  // Storage is filled by the nightly import, so the last days are read straight from Google:
  // a run recorded in Google Health or Apple Fitness counts as soon as the device has synced.
  if (state.isAuthenticated && !state.isDemo) {
    try {
      const recent = (await fetchRecentWorkouts(state, today, ctx.clientTz, RECENT_WORKOUT_DAYS)).filter((w) => w.date >= from && w.date < today);
      // A day Google returned replaces its stored copy; a day it returned nothing for keeps what is stored (a failed read is also empty).
      const fresh = new Set(recent.map((w) => w.date));
      data.workouts = [...data.workouts.filter((w) => !fresh.has(w.date)), ...recent.map((w) => toWorkout(w.date, w.session))];
    } catch (err) {
      console.error("Goals: recent workouts unavailable:", err);
    }
  }
  return data;
}

const earliestStart = (goals: Goal[], today: string) => goals.reduce((min, g) => (g.startDate < min ? g.startDate : min), shiftIso(today, -DEFAULT_LOOKBACK_DAYS));

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Prompts the chat offers: sized from the user's own recent activity so targets are a stretch, not a fantasy. */
export function suggestGoals(views: GoalView[], data: ActivityData, unit: DistanceUnit): GoalSuggestion[] {
  const { today } = data;
  const out: GoalSuggestion[] = [];
  const hasProgram = views.some((v) => v.kind === "program");
  if (views.length) {
    out.push({ label: "How am I tracking on my goals?", prompt: "How am I tracking on my goals?", icon: "chart" });
    if (hasProgram) out.push({ label: "What's my workout today?", prompt: "What's my training plan workout today, and how is this week going?", icon: "run" });
  }

  // The month still worth a goal: this one, unless it is nearly over.
  const { year, month, day } = isoToCivil(today);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const target = daysInMonth - day >= 7 ? { year, month } : month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  const monthName = MONTHS[target.month - 1];
  const monthDays = new Date(Date.UTC(target.year, target.month, 0)).getUTCDate();

  const recent = Array.from({ length: 28 }, (_, i) => data.days.get(shiftIso(today, -(i + 1)))).filter((d) => d && d.steps > 0);
  const avgSteps = recent.length ? recent.reduce((sum, d) => sum + d!.steps, 0) / recent.length : 8000;
  const stepTarget = Math.max(150_000, Math.round((avgSteps * 1.1 * monthDays) / 10_000) * 10_000);
  const has = (metric: string) => views.some((v) => v.kind === "activity" && v.goal.metric === metric);

  if (!has("steps")) out.push({ label: `${monthName} ${Math.round(stepTarget / 1000)}k steps`, prompt: `Create a ${monthName} goal of ${stepTarget.toLocaleString("en-US")} total steps`, icon: "steps" });
  if (!hasProgram) out.push({ label: "Train for a race", prompt: "I want to train for a race. Build me a training plan.", icon: "trophy" });

  const cutoff = shiftIso(today, -28);
  const runKm = data.workouts.filter((w) => w.kind === "run" && w.date >= cutoff).reduce((sum, w) => sum + w.distanceKm, 0);
  const perUnit = unit === "mi" ? 1.609344 : 1;
  if (!has("run_distance") && !hasProgram) {
    const monthly = Math.max(unit === "mi" ? 20 : 30, Math.ceil((runKm / perUnit) * 1.15 / 5) * 5);
    out.push({ label: `Run ${monthly} ${unit} in ${monthName}`, prompt: `Create a goal to run ${monthly} ${unit === "mi" ? "miles" : "km"} in ${monthName}`, icon: "run" });
  }
  if (!has("distance") && !has("walk_distance")) {
    const walk = unit === "mi" ? 60 : 100;
    out.push({ label: `Walk ${walk} ${unit} in ${monthName}`, prompt: `Create a goal to cover ${walk} ${unit === "mi" ? "miles" : "km"} of total distance in ${monthName}`, icon: "walk" });
  }
  if (!has("workouts")) out.push({ label: `12 workouts in ${monthName}`, prompt: `Create a goal to log 12 workouts in ${monthName}`, icon: "zap" });
  return out.slice(0, 5);
}

/** Everything the dashboard's goals panel needs, in one call. */
export async function loadGoals(ctx: GoalContext): Promise<GoalsPayload> {
  const store = goalStore(ctx.state, ctx.clientTz, ctx.guestId);
  const goals = await store.list();
  const today = ctx.clientDate ?? todayIso(ctx.clientTz);
  const data = await loadActivity(ctx, earliestStart(goals, today));
  const views = await Promise.all(
    goals.map(async (g) => {
      const view = goalView(g, data);
      if (g.kind !== "program" || view.kind !== "program") return view;
      // Keep the plan in step with what is actually being run; an adjustment is saved once and shown on the card.
      const adapted = adaptProgram(g, view, data.today);
      if (!adapted) return view;
      await store.update(adapted).catch((err) => console.error("Goals: saving the adjusted plan failed:", err));
      return goalView(adapted, data);
    })
  );
  // Programs first, then goals ending soonest.
  views.sort((a, b) => (a.kind === b.kind ? a.goal.endDate.localeCompare(b.goal.endDate) : a.kind === "program" ? -1 : 1));
  return { today: data.today, goals: views, suggestions: suggestGoals(views, data, defaultUnit(ctx.clientTz)), persistent: store.persistent };
}
