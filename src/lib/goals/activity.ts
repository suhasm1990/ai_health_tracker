/** One day of tracker totals, as far as goals care. */
export interface ActivityDay {
  steps: number;
  distanceKm: number;
  activeMinutes: number;
}

export type WorkoutKind = "run" | "walk" | "strength" | "other";

export interface ActivityWorkout {
  date: string;
  kind: WorkoutKind;
  /** Display name of the activity, e.g. "Walking". */
  label: string;
  /** 0 when the device recorded no distance (e.g. some treadmill runs). */
  distanceKm: number;
  minutes: number;
}

/** Everything goal progress is computed from; the same shape for stored history, live data and demo data. */
export interface ActivityData {
  today: string;
  days: Map<string, ActivityDay>;
  workouts: ActivityWorkout[];
  /** Today's readiness score, when today's recovery readings exist. */
  readiness: { score: number; label: string } | null;
}

export function classifyWorkout(activityType?: string | null, rawType?: string | null): WorkoutKind {
  const text = `${rawType ?? ""} ${activityType ?? ""}`.toLowerCase();
  if (/run|jog|treadmill/.test(text)) return "run";
  if (/walk|hik/.test(text)) return "walk";
  if (/strength|weight|core/.test(text)) return "strength";
  return "other";
}

export interface RunDay {
  km: number;
  longestKm: number;
  /** A run with no recorded distance happened this day. */
  untracked: boolean;
}

export function runsByDate(data: ActivityData): Map<string, RunDay> {
  const map = new Map<string, RunDay>();
  for (const w of data.workouts) {
    if (w.kind !== "run") continue;
    const day = map.get(w.date) ?? { km: 0, longestKm: 0, untracked: false };
    day.km += w.distanceKm;
    day.longestKm = Math.max(day.longestKm, w.distanceKm);
    if (w.distanceKm <= 0) day.untracked = true;
    map.set(w.date, day);
  }
  return map;
}
