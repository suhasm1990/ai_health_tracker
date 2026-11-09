/** Distance units a goal is shown in; everything is stored in km. */
export type DistanceUnit = "km" | "mi";

export type RaceDistance = "5k" | "10k" | "half" | "marathon";

/** What an activity goal counts. */
export type GoalMetric = "steps" | "distance" | "walk_distance" | "run_distance" | "active_minutes" | "workouts" | "runs";

export type SessionType = "rest" | "strength" | "easy" | "recovery" | "long" | "tempo" | "intervals" | "hills" | "race_pace" | "shakeout" | "race";

export type Phase = "Base" | "Build" | "Peak" | "Taper" | "Race";

export interface PlanSession {
  date: string;
  type: SessionType;
  /** Planned running distance in km; 0 for rest and strength. */
  distanceKm: number;
  title: string;
  details: string;
}

export interface PlanWeek {
  index: number;
  /** Monday of the week */
  startDate: string;
  phase: Phase;
  isDownWeek: boolean;
  plannedKm: number;
  longRunKm: number;
  focus: string;
  sessions: PlanSession[];
}

export interface PaceRange {
  label: string;
  /** Seconds per km; null when the plan has no goal time. */
  fastSecPerKm: number | null;
  slowSecPerKm: number | null;
  feel: string;
}

export interface TrainingPlan {
  raceName: string;
  raceDate: string;
  distance: RaceDistance;
  raceDistanceKm: number;
  /** Goal finish time in seconds, if any. */
  goalTimeSec: number | null;
  /** How the goal time was set: given by the user, or predicted from a recent race. */
  goalTimeSource: "user" | "predicted" | null;
  startingWeeklyKm: number;
  peakWeeklyKm: number;
  peakLongRunKm: number;
  weeks: PlanWeek[];
  paces: PaceRange[];
  warnings: string[];
}

/** Everything a plan is generated from; stored with the goal so it can be rebuilt when the user changes something. */
export interface PlanInput {
  raceName: string;
  raceDate: string;
  distance: RaceDistance;
  /** First day of training. */
  startDate: string;
  unit: DistanceUnit;
  currentWeeklyKm?: number | null;
  longestRecentRunKm?: number | null;
  goalTimeSec?: number | null;
  goalTimeSource?: "user" | "predicted" | null;
  runDaysPerWeek?: number | null;
  /** Day of the long run; Saturday unless the user prefers Sunday. */
  longRunDay?: "saturday" | "sunday" | null;
  /** User's own ceiling for weekly distance, km. */
  peakWeeklyKm?: number | null;
  /** Weeks already trained before these ones (set when re-planning mid-program) so phases and down weeks carry on. */
  elapsedWeeks?: number;
}

/** One automatic change to a plan, made because actual running drifted from it. */
export interface PlanAdaptation {
  date: string;
  direction: "eased" | "raised";
  message: string;
}

interface GoalBase {
  id: string;
  title: string;
  unit: DistanceUnit;
  startDate: string;
  endDate: string;
  status: "active" | "archived";
  createdAt: string;
}

export interface ProgramGoal extends GoalBase {
  kind: "program";
  input: PlanInput;
  plan: TrainingPlan;
  /** Automatic re-levelling the plan has applied, newest last. */
  adaptations?: PlanAdaptation[];
}

export interface ActivityGoal extends GoalBase {
  kind: "activity";
  metric: GoalMetric;
  /** In the metric's base unit: steps, km, minutes or sessions. */
  target: number;
}

export type Goal = ProgramGoal | ActivityGoal;

/* ---------- views sent to the dashboard ---------- */

export type BadgeTier = "bronze" | "silver" | "gold" | "legend";
export type BadgeIcon = "footprints" | "flag" | "flame" | "medal" | "trophy" | "mountain" | "zap" | "crown" | "star" | "target" | "rocket" | "calendar";

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: BadgeIcon;
  tier: BadgeTier;
  earned: boolean;
  earnedOn: string | null;
  /** 0..1 progress toward a locked badge, when measurable. */
  progress: number | null;
}

/** "covered": the week's distance is already in, so this run became optional. */
export type SessionStatus = "done" | "partial" | "missed" | "today" | "upcoming" | "covered" | "rest" | "before_start";

export interface SessionView extends PlanSession {
  status: SessionStatus;
  /** Distance credited to this session (the run may have happened on another day of the week). */
  actualKm: number;
  /** Distance actually run on this calendar day, whatever was planned. */
  ranKm: number;
  /** The day the credited run happened, when it was not this session's own day. */
  coveredOn: string | null;
  /** This week's re-balanced distance when it differs from the plan; 0 means the session is no longer needed. */
  adjustedKm: number | null;
  /** Why the session looks different from the plan, in plain words. */
  note: string | null;
  /** Other imported activity that day (a walk, a ride), shown as cross-training. */
  crossTraining: string | null;
}

export interface WeekView extends Omit<PlanWeek, "sessions"> {
  sessions: SessionView[];
  actualKm: number;
  longestRunKm: number;
  /** actual / planned, null for future weeks */
  completion: number | null;
  state: "done" | "partial" | "missed" | "current" | "upcoming";
}

export interface Nudge {
  tone: "go" | "done" | "rest" | "behind" | "info";
  headline: string;
  detail: string;
}

export interface ProgramView {
  kind: "program";
  goal: Omit<ProgramGoal, "plan" | "input" | "adaptations">;
  /** The most recent automatic adjustment, while it is still news. */
  adaptation: PlanAdaptation | null;
  plan: Omit<TrainingPlan, "weeks">;
  daysToRace: number;
  currentWeekIndex: number | null;
  weeks: WeekView[];
  currentWeek: { week: WeekView; sessions: SessionView[] } | null;
  todaySession: SessionView | null;
  nextSession: SessionView | null;
  totals: {
    plannedKm: number;
    plannedToDateKm: number;
    actualKm: number;
    longestRunKm: number;
    weeksCompleted: number;
    /** Consecutive completed weeks up to now. */
    weekStreak: number;
    /** Distance run / distance that was due so far (0..1+); null before anything was due. */
    adherence: number | null;
  };
  nudge: Nudge;
  badges: Badge[];
}

export interface ActivityView {
  kind: "activity";
  goal: ActivityGoal;
  current: number;
  /** Where a steady pace would be by today. */
  expectedByToday: number;
  percent: number;
  daysLeft: number;
  /** Needed per remaining day (including today) to finish; 0 once complete. */
  perDayNeeded: number;
  completedOn: string | null;
  daily: { date: string; value: number }[];
  nudge: Nudge;
  badges: Badge[];
}

export type GoalView = ProgramView | ActivityView;

export interface GoalSuggestion {
  label: string;
  prompt: string;
  icon: "run" | "walk" | "steps" | "trophy" | "zap" | "chart";
}

export interface GoalsPayload {
  today: string;
  goals: GoalView[];
  suggestions: GoalSuggestion[];
  /** False when goals live only in server memory (no database or demo mode). */
  persistent: boolean;
}

/** Chat tools whose success changes what the goals panel shows; the client refetches after them. */
export const GOAL_MUTATION_TOOLS: readonly string[] = ["create_training_plan", "update_training_plan", "create_activity_goal", "update_activity_goal", "archive_goal"];
