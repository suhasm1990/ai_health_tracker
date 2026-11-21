import { GOALS } from "../constants";
import { formatDistance } from "../goals/units";
import type { DistanceUnit, GoalView, SessionType, SessionView } from "../goals/types";
import { calculateReadiness } from "../readiness";
import type { DailyMetricSummary, PersonalBaseline, WellnessSignals, WorkoutSession } from "../types";
import { formatDuration } from "../utils";

/**
 * The coach's plan for today: one workout adjusted to how recovered the body is,
 * a bedtime that pays back recent sleep debt, and a short checklist that ticks
 * itself off as the wearable syncs. Pure and deterministic, so the dashboard and
 * the AI coach always describe the same plan.
 */

export type DayMode = "push" | "steady" | "recover" | "rest";
export type Intensity = "hard" | "moderate" | "easy" | "rest";

export interface PlannedWorkout {
  title: string;
  detail: string;
  intensity: Intensity;
  /** What the training plan had for today, when the coach changed it. */
  original: { title: string; detail: string } | null;
  /** Why the workout looks the way it does, in plain words. */
  reason: string;
  done: boolean;
  /** Comes from the user's training program rather than a general suggestion. */
  fromProgram: boolean;
}

export interface SleepPlan {
  /** e.g. "10:40 PM" */
  bedtime: string;
  /** Usual wake time, e.g. "7:00 AM" */
  wake: string;
  /** Time asleep to aim for, minutes. */
  targetMinutes: number;
  /** Shortfall against 8h over the last three nights, minutes. */
  debtMinutes: number;
  reason: string;
}

export interface PlanAction {
  id: "workout" | "move" | "sleep";
  label: string;
  detail: string;
  done: boolean;
}

export interface DayPlan {
  mode: DayMode;
  readinessScore: number;
  headline: string;
  summary: string;
  workout: PlannedWorkout;
  sleep: SleepPlan | null;
  actions: PlanAction[];
  /** One-tap follow-ups for the chat coach. */
  prompts: { label: string; prompt: string }[];
}

export interface DayPlanInput {
  today: DailyMetricSummary;
  history: DailyMetricSummary[];
  baseline: PersonalBaseline;
  signals?: WellnessSignals;
  goals?: GoalView[];
  todayWorkouts?: WorkoutSession[];
  /** Local hour 0-23, or null when unknown (server render). */
  hour: number | null;
}

const HARD_SESSIONS: SessionType[] = ["intervals", "tempo", "hills", "race_pace"];
const SLEEP_LATENCY_MIN = 15;

const MODE_COPY: Record<DayMode, { headline: string; summary: (score: number) => string }> = {
  push: { headline: "You're primed. Make today count.", summary: (s) => `Readiness is ${s}/100: recovery, sleep and resting heart rate all line up. This is a day to train hard.` },
  steady: { headline: "Solid recovery. Train as planned.", summary: (s) => `Readiness is ${s}/100, close to your usual. Normal training is fine; keep easy days easy.` },
  recover: { headline: "Go easy today. Recovery is the work.", summary: (s) => `Readiness is ${s}/100, below your usual. Easy movement helps you bounce back faster than a hard session would.` },
  rest: { headline: "Rest today. Several readings are off.", summary: () => "Several overnight readings moved away from your usual together. That often comes with stress, poor sleep, alcohol or getting run down." },
};

function modeFor(score: number, signals?: WellnessSignals): DayMode {
  if (signals?.illness) return "rest";
  if (score >= 85) return "push";
  if (score >= 65) return "steady";
  return "recover";
}

const round5 = (minutes: number) => Math.round(minutes / 5) * 5;

/** "42 min", "8h", "8h 15m" */
export function humanMinutes(total: number): string {
  const m = Math.round(total);
  if (m < 60) return `${m} min`;
  return m % 60 ? formatDuration(m) : `${m / 60}h`;
}

/** "7:22 AM" / "07:22 PM" -> minutes after midnight. */
export function parseClock(value: string | null | undefined): number | null {
  const match = value?.match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
  if (!match) return null;
  const h = Number(match[1]) % 12;
  return (match[3].toUpperCase() === "PM" ? h + 12 : h) * 60 + Number(match[2]);
}

export function formatClockMinutes(total: number): string {
  const m = ((Math.round(total) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** Nights with a recorded sleep, newest first; today's entry is last night. */
function recentNights(today: DailyMetricSummary, history: DailyMetricSummary[]): DailyMetricSummary[] {
  const prior = history.filter((d) => d.date < today.date).sort((a, b) => b.date.localeCompare(a.date));
  return [today, ...prior].filter((d) => d.sleepDurationMinutes > 0);
}

export function planSleep(today: DailyMetricSummary, history: DailyMetricSummary[], hardDay: boolean): SleepPlan | null {
  const nights = recentNights(today, history);
  const wakes = nights.map((d) => parseClock(d.sleepEndTime)).filter((m): m is number => m !== null && m < 14 * 60);
  if (wakes.length === 0) return null;
  const wake = round5(median(wakes));

  const debt = nights.slice(0, 3).reduce((sum, d) => sum + Math.max(0, GOALS.sleepMinutes - d.sleepDurationMinutes), 0);
  // Pay back about a third of recent debt tonight, never more than 45 minutes: a big jump just means lying awake.
  const payback = Math.min(45, round5(debt / 3));
  const strain = hardDay || today.activeZoneMinutes >= 60 ? 15 : 0;
  const target = GOALS.sleepMinutes + payback + strain;
  const bedtime = round5(wake - target - SLEEP_LATENCY_MIN);

  const parts = [`8h baseline`];
  if (payback > 0) parts.push(`+${payback} min to chip away at ${humanMinutes(debt)} of sleep debt from the last 3 nights`);
  if (strain > 0) parts.push("+15 min for a hard training day");
  const breakdown = parts.length > 1 ? ` (${parts.join(", ")})` : "";
  return {
    bedtime: formatClockMinutes(bedtime),
    wake: formatClockMinutes(wake),
    targetMinutes: target,
    debtMinutes: debt,
    reason: `Aims for ${humanMinutes(target)} asleep before your usual ${formatClockMinutes(wake)} wake-up${breakdown}, with ${SLEEP_LATENCY_MIN} minutes to fall asleep.`,
  };
}

function scaleKm(km: number, factor: number, unit: DistanceUnit) {
  return formatDistance(Math.max(km * factor, unit === "mi" ? 3.2 : 3), unit);
}

/** Adjusts the training plan's session for today's readiness. */
function adaptSession(session: SessionView, mode: DayMode, unit: DistanceUnit, score: number): PlannedWorkout {
  const km = session.adjustedKm ?? session.distanceKm;
  const original = { title: session.title, detail: session.details };
  const done = session.status === "done" || session.status === "partial";
  const base = { fromProgram: true, done };
  const isHard = HARD_SESSIONS.includes(session.type);
  const isLong = session.type === "long";

  if (session.type === "rest" || session.status === "covered" || km === 0) {
    const covered = session.status === "covered";
    return { ...base, title: covered ? "Rest: this week's distance is in" : session.title, detail: session.details, intensity: session.type === "strength" ? "moderate" : "rest", original: null, reason: covered ? "You already ran this week's planned distance, so today is optional." : "Rest days are when the training actually sinks in." };
  }
  if (done) {
    return { ...base, title: session.title, detail: session.details, intensity: isHard ? "hard" : "easy", original: null, reason: "Logged from your watch. Nice work." };
  }
  if (mode === "rest") {
    return { ...base, title: "Rest day instead", detail: "Skip today's run. If you feel fine, a relaxed 20-minute walk at most.", intensity: "rest", original, reason: "Several overnight readings shifted together. Training through that tends to make it last longer." };
  }
  if (mode === "recover" && (isHard || isLong)) {
    const factor = score < 50 ? 0.6 : 0.8;
    return {
      ...base,
      title: `Easy ${scaleKm(km, factor, unit)} instead`,
      detail: "Conversational pace, heart rate low. Save the quality work for a day you've recovered.",
      intensity: "easy",
      original,
      reason: `Readiness is ${score}/100. A hard session on a low day adds fatigue without much fitness, so the coach swapped it for an easy run.`,
    };
  }
  if (mode === "recover" && score < 50) {
    return { ...base, title: `Shorter: ${scaleKm(km, 0.7, unit)} easy`, detail: session.details, intensity: "easy", original, reason: `Readiness is ${score}/100, so the coach trimmed today's run by about a third.` };
  }
  const reason =
    mode === "push"
      ? isHard
        ? "You're well recovered: hit the target paces with confidence."
        : "Fully recovered. Keep it at the planned effort; the plan's easy days protect the hard ones."
      : isHard
        ? "Recovery is around your usual. Do the session, but stop early if your heart rate climbs faster than normal."
        : "On plan. Keep it relaxed.";
  return { ...base, title: session.title, detail: session.details, intensity: isHard ? "hard" : isLong ? "moderate" : "easy", original: null, reason };
}

const GENERAL_WORKOUTS: Record<DayMode, Omit<PlannedWorkout, "done" | "fromProgram" | "original">> = {
  push: { title: "Quality session, 30–40 min", detail: "Warm up 10 min, then 4 × 4 min hard with 3 min easy between. Or go for a strength PR.", intensity: "hard", reason: "You're well recovered, the best time to push." },
  steady: { title: "Zone 2 cardio, 30–45 min", detail: "Steady effort where you can still talk in full sentences, or a regular strength session.", intensity: "moderate", reason: "Recovery is around your usual: steady aerobic work builds fitness without digging a hole." },
  recover: { title: "Easy walk + mobility, 30 min", detail: "20-minute walk at an easy pace, then 10 minutes of stretching or mobility.", intensity: "easy", reason: "Light movement speeds recovery more than sitting still or training hard." },
  rest: { title: "Rest and recover", detail: "No training today. Fluids, an early night, and a short walk only if you feel up to it.", intensity: "rest", reason: "Several overnight readings shifted together. Give your body room to bounce back." },
};

export function buildDayPlan({ today, history, baseline, signals, goals = [], todayWorkouts = [], hour }: DayPlanInput): DayPlan {
  const readiness = calculateReadiness(today, history, baseline);
  const score = readiness.score;
  const mode = modeFor(score, signals);
  const program = goals.find((g) => g.kind === "program");
  const session = program?.kind === "program" ? program.todaySession : null;

  let workout: PlannedWorkout;
  if (session && program?.kind === "program") {
    workout = adaptSession(session, mode, program.goal.unit, score);
  } else {
    const logged = todayWorkouts.length > 0;
    workout = logged
      ? { title: `${todayWorkouts[0].activityType} logged`, detail: `${humanMinutes(todayWorkouts[0].durationMinutes)} recorded today.`, intensity: "moderate", reason: "Already done. Anything more today is a bonus, not a requirement.", done: true, original: null, fromProgram: false }
      : { ...GENERAL_WORKOUTS[mode], done: false, original: null, fromProgram: false };
  }

  // Late in the day an unfinished session costs more sleep than it builds fitness.
  if (!workout.done && hour !== null && hour >= 21 && workout.intensity !== "rest") {
    workout = { ...workout, reason: `${workout.reason} It's getting late: if you haven't started, skip it tonight so it doesn't cut into sleep.` };
  }

  const sleep = planSleep(today, history, workout.intensity === "hard");
  const stepsLeft = Math.max(0, today.stepsGoal - today.steps);
  const actions: PlanAction[] = [
    { id: "workout", label: workout.intensity === "rest" ? "Rest day" : workout.title, detail: workout.done ? "Done" : workout.intensity === "rest" ? "Recovery counts as training" : "From your watch once it syncs", done: workout.done || workout.intensity === "rest" },
    { id: "move", label: `${today.stepsGoal.toLocaleString()} steps`, detail: stepsLeft === 0 ? `${today.steps.toLocaleString()} today` : `${stepsLeft.toLocaleString()} to go`, done: stepsLeft === 0 },
  ];
  if (sleep) actions.push({ id: "sleep", label: `In bed by ${sleep.bedtime}`, detail: `For ${humanMinutes(sleep.targetMinutes)} of sleep`, done: false });

  const prompts = [
    workout.original
      ? { label: "Why the change?", prompt: "Why did you change today's workout from my training plan?" }
      : { label: "Why this plan?", prompt: "Explain today's plan: why this workout and this bedtime?" },
    { label: "Plan my week", prompt: "Looking at my recovery and goals, how should I train for the rest of this week?" },
    sleep && sleep.debtMinutes > 0 ? { label: "Fix my sleep debt", prompt: "How do I pay back my sleep debt this week?" } : { label: "Fuel for today", prompt: "What should I eat and drink today to support today's plan?" },
  ];

  return { mode, readinessScore: score, headline: MODE_COPY[mode].headline, summary: MODE_COPY[mode].summary(score), workout, sleep, actions, prompts };
}
