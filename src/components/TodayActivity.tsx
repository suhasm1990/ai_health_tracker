"use client";

import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowUpRight,
  Bike,
  CheckCircle2,
  Clock,
  Dumbbell,
  Flame,
  Footprints,
  Gauge,
  Heart,
  HeartPulse,
  Sparkles,
  Timer,
  TrendingUp,
  Watch,
  Waves,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { StatTile } from "@/components/ui/StatTile";
import type { DailyMetricSummary, WorkoutSession } from "@/lib/types";
import { formatDuration } from "@/lib/utils";

interface TodayActivityProps {
  workouts?: WorkoutSession[];
  today: DailyMetricSummary;
}

interface WorkoutMetricTile {
  id: string;
  icon: LucideIcon;
  iconClass: string;
  label: string;
  value: string;
  valueClass?: string;
  sub: string;
}

function getActivityIcon(type: string, raw?: string) {
  const t = `${raw || ""} ${type || ""}`.toLowerCase();
  if (t.includes("bik") || t.includes("cycl")) return Bike;
  if (t.includes("run") || t.includes("jog") || t.includes("walk") || t.includes("hike") || t.includes("treadmill")) return Footprints;
  if (t.includes("strength") || t.includes("weight") || t.includes("lift") || t.includes("gym")) return Dumbbell;
  if (t.includes("swim")) return Waves;
  if (t.includes("yoga") || t.includes("pilates") || t.includes("stretch")) return Sparkles;
  if (t.includes("hiit") || t.includes("interval") || t.includes("intensity")) return Flame;
  return Activity;
}

function getActivityTheme(type: string, raw?: string) {
  const t = `${raw || ""} ${type || ""}`.toLowerCase();
  if (t.includes("bik") || t.includes("cycl")) {
    return {
      chip: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
      glow: "from-cyan-500/10 via-blue-500/5 to-transparent",
    };
  }
  if (t.includes("run") || t.includes("walk") || t.includes("hike")) {
    return {
      chip: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
      glow: "from-emerald-500/10 via-teal-500/5 to-transparent",
    };
  }
  if (t.includes("strength") || t.includes("weight") || t.includes("gym") || t.includes("lift")) {
    return {
      chip: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
      glow: "from-purple-500/10 via-indigo-500/5 to-transparent",
    };
  }
  if (t.includes("hiit") || t.includes("interval") || t.includes("intensity")) {
    return {
      chip: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
      glow: "from-rose-500/10 via-orange-500/5 to-transparent",
    };
  }
  // Universal athletic theme for tennis, cardio, swimming, general workouts
  return {
    chip: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
    glow: "from-indigo-500/10 via-rose-500/5 to-transparent",
  };
}

/**
 * Dynamically constructs the most important metrics for ANY workout type.
 * Inspects what metrics the session actually logged (duration, HR, calories,
 * intensity, distance, speed/pace, steps, elevation) rather than hardcoding
 * activity-specific rules or synthetic filler tiles.
 */
function getWorkoutTiles(workout: WorkoutSession, today: DailyMetricSummary): WorkoutMetricTile[] {
  const tiles: WorkoutMetricTile[] = [];

  // 1. Duration (Universal for every workout)
  tiles.push({
    id: "duration",
    icon: Clock,
    iconClass: "text-indigo-500",
    label: "Duration",
    value: formatDuration(workout.durationMinutes),
    sub:
      workout.activeMinutes && workout.activeMinutes !== workout.durationMinutes
        ? `${workout.activeMinutes}m active movement`
        : "Session length",
  });

  // 2. Heart Rate (Universal if recorded)
  if (workout.averageHeartRate || workout.peakHeartRate) {
    tiles.push({
      id: "heartRate",
      icon: HeartPulse,
      iconClass: "text-rose-500",
      label: "Heart Rate",
      valueClass: "text-rose-600 dark:text-rose-400",
      value: workout.averageHeartRate ? `${workout.averageHeartRate} bpm` : "—",
      sub: workout.peakHeartRate
        ? `Peak: ${workout.peakHeartRate} bpm`
        : workout.heartRateZones?.cardioMinutes
          ? `${workout.heartRateZones.cardioMinutes}m cardio zone`
          : "Average workout HR",
    });
  }

  // 3. Active Calories (Energy burned during session)
  if (workout.caloriesBurned) {
    tiles.push({
      id: "calories",
      icon: Zap,
      iconClass: "text-amber-500",
      label: "Active Calories",
      valueClass: "text-amber-600 dark:text-amber-400",
      value: `${workout.caloriesBurned.toLocaleString()} kcal`,
      sub: "Energy expended",
    });
  }

  // 4. Active Zone Minutes (Effort intensity)
  const azm = workout.activeZoneMinutes ?? today.activeZoneMinutes;
  if (azm !== undefined && azm !== null && azm > 0) {
    tiles.push({
      id: "azm",
      icon: Flame,
      iconClass: "text-teal-500",
      label: "Active Zone",
      valueClass: "text-teal-600 dark:text-teal-400",
      value: `${azm} AZM`,
      sub: "Cardio & fat burn effort",
    });
  }

  // 5. Distance (if recorded by GPS/odometer)
  if (workout.distanceKm && workout.distanceKm > 0) {
    tiles.push({
      id: "distance",
      icon: ArrowUpRight,
      iconClass: "text-emerald-500",
      label: "Distance",
      valueClass: "text-emerald-600 dark:text-emerald-400",
      value: `${workout.distanceKm} km`,
      sub: "Total distance covered",
    });
  }

  // 6. Pace or Speed (dynamic: runners prefer pace, cyclists/rowers prefer speed)
  const isPacePrimary =
    workout.activityType.toLowerCase().includes("run") ||
    workout.activityType.toLowerCase().includes("walk") ||
    workout.activityType.toLowerCase().includes("hike");

  if (isPacePrimary && workout.paceFormatted) {
    tiles.push({
      id: "pace",
      icon: Gauge,
      iconClass: "text-emerald-500",
      label: "Average Pace",
      valueClass: "text-emerald-600 dark:text-emerald-400",
      value: workout.paceFormatted,
      sub: workout.speedKmh ? `Speed: ${workout.speedKmh} km/h` : "Moving rate",
    });
  } else if (workout.speedKmh && workout.speedKmh > 0) {
    tiles.push({
      id: "speed",
      icon: Gauge,
      iconClass: "text-cyan-500",
      label: "Average Speed",
      valueClass: "text-cyan-600 dark:text-cyan-400",
      value: `${workout.speedKmh} km/h`,
      sub: workout.paceFormatted ? `Pace: ${workout.paceFormatted}` : "Sustained moving speed",
    });
  } else if (workout.paceFormatted) {
    tiles.push({
      id: "pace",
      icon: Gauge,
      iconClass: "text-emerald-500",
      label: "Average Pace",
      valueClass: "text-emerald-600 dark:text-emerald-400",
      value: workout.paceFormatted,
      sub: "Moving rate",
    });
  }

  // 7. Steps (if logged, e.g. tennis, walking, hiking, running)
  if (workout.steps && workout.steps > 0 && tiles.length < 6) {
    tiles.push({
      id: "steps",
      icon: Footprints,
      iconClass: "text-indigo-500",
      label: "Steps",
      valueClass: "text-indigo-600 dark:text-indigo-400",
      value: workout.steps.toLocaleString(),
      sub: workout.cadenceSpm ? `${workout.cadenceSpm} spm cadence` : "Steps during session",
    });
  }

  // 8. Elevation Gain (if climbing ascent occurred)
  if (workout.elevationGainMeters && workout.elevationGainMeters > 0 && tiles.length < 6) {
    tiles.push({
      id: "elevation",
      icon: TrendingUp,
      iconClass: "text-indigo-500",
      label: "Elevation Gain",
      valueClass: "text-indigo-600 dark:text-indigo-400",
      value: `${workout.elevationGainMeters} m`,
      sub: "Total climbing ascent",
    });
  }

  return tiles;
}

export function TodayActivity({ workouts = [], today }: TodayActivityProps) {
  const [selectedIdx, setSelectedIdx] = useState(0);

  const hasWorkouts = workouts.length > 0;
  const currentWorkout = hasWorkouts ? workouts[Math.min(selectedIdx, workouts.length - 1)] : null;

  const ActivityIcon = currentWorkout ? getActivityIcon(currentWorkout.activityType, currentWorkout.rawType) : Zap;
  const theme = currentWorkout ? getActivityTheme(currentWorkout.activityType, currentWorkout.rawType) : getActivityTheme("general");

  const totalWorkoutMinutes = workouts.reduce((acc, w) => acc + w.durationMinutes, 0);
  const workoutTiles = currentWorkout ? getWorkoutTiles(currentWorkout, today) : [];

  const gridColsClass =
    workoutTiles.length <= 2
      ? "grid-cols-2"
      : workoutTiles.length === 3
        ? "grid-cols-1 sm:grid-cols-3"
        : workoutTiles.length === 4
          ? "grid-cols-2 sm:grid-cols-4"
          : workoutTiles.length === 5
            ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
            : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6";

  const hasZoneData = Boolean(
    currentWorkout?.heartRateZones &&
      ((currentWorkout.heartRateZones.peakMinutes ?? 0) > 0 ||
        (currentWorkout.heartRateZones.cardioMinutes ?? 0) > 0 ||
        (currentWorkout.heartRateZones.fatBurnMinutes ?? 0) > 0)
  );

  return (
    <Panel className="relative overflow-hidden">
      {/* Background ambient glow */}
      {currentWorkout && (
        <div className={`absolute top-0 right-0 w-96 h-96 bg-gradient-to-br ${theme.glow} rounded-full blur-3xl -z-10 pointer-events-none opacity-60`} />
      )}

      <PanelHeader
        icon={Activity}
        iconClass="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
        title="Today's Activity & Workouts"
        subtitle={
          hasWorkouts
            ? `${workouts.length} recorded ${workouts.length === 1 ? "workout session" : "workout sessions"} today • ${formatDuration(totalWorkoutMinutes)} total training`
            : "Live tracking of exercise sessions, training duration & cardio zones"
        }
      >
        {hasWorkouts && (
          <div className="flex items-center space-x-2">
            <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>
                {workouts.length} {workouts.length === 1 ? "Workout Logged" : "Workouts Logged"}
              </span>
            </span>
          </div>
        )}
      </PanelHeader>

      {/* Multi-workout Selector Tabs (if > 1 workout completed today) */}
      {workouts.length > 1 && (
        <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1 scrollbar-none">
          {workouts.map((w, idx) => {
            const Icon = getActivityIcon(w.activityType, w.rawType);
            const isSelected = idx === selectedIdx;
            return (
              <button
                key={w.id}
                onClick={() => setSelectedIdx(idx)}
                className={`flex items-center space-x-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-all shrink-0 border ${
                  isSelected
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-transparent shadow-xs"
                    : "bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700/60 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{w.activityType}</span>
                <span className="text-[10px] opacity-75 font-mono">({formatDuration(w.durationMinutes)})</span>
              </button>
            );
          })}
        </div>
      )}

      {currentWorkout ? (
        <div className="space-y-4">
          {/* Main Workout Showcase Banner */}
          <div className="rounded-2xl p-4 sm:p-5 bg-gradient-to-br from-slate-50/90 to-white dark:from-slate-800/50 dark:to-slate-900/60 border border-slate-200/80 dark:border-slate-800 shadow-xs transition-all">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200/70 dark:border-slate-800/80">
              <div className="flex items-center space-x-3.5">
                <div className={`p-3 rounded-2xl border shadow-sm ${theme.chip}`}>
                  <ActivityIcon className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h4 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                      {currentWorkout.activityType}
                    </h4>
                    <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Completed
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400 mt-1">
                    <span className="flex items-center space-x-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {currentWorkout.startTime} – {currentWorkout.endTime}
                      </span>
                    </span>
                    {currentWorkout.sourceDevice && (
                      <span className="flex items-center space-x-1 text-slate-500">
                        <span>•</span>
                        <Watch className="w-3.5 h-3.5 text-indigo-500" />
                        <span className="font-medium text-indigo-600 dark:text-indigo-400">{currentWorkout.sourceDevice}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Quick Highlight Pills */}
              <div className="flex items-center gap-2 self-start sm:self-auto">
                {currentWorkout.averageHeartRate && (
                  <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 dark:bg-rose-500/15 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs font-semibold shadow-2xs">
                    <HeartPulse className="w-4 h-4 text-rose-500" />
                    <span>
                      {currentWorkout.averageHeartRate} bpm {currentWorkout.peakHeartRate ? `(Peak ${currentWorkout.peakHeartRate})` : "avg"}
                    </span>
                  </div>
                )}
                <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 text-slate-700 dark:text-slate-200 text-xs font-semibold">
                  <Timer className="w-3.5 h-3.5 text-indigo-500" />
                  <span>{formatDuration(currentWorkout.durationMinutes)}</span>
                </div>
              </div>
            </div>

            {/* Dynamic Workout Metrics Grid (Data-driven for any workout type) */}
            <div className={`grid gap-2.5 sm:gap-3 pt-4 ${gridColsClass}`}>
              {workoutTiles.map((tile) => (
                <StatTile
                  key={tile.id}
                  size="lg"
                  icon={tile.icon}
                  iconClass={tile.iconClass}
                  label={tile.label}
                  value={tile.value}
                  valueClass={tile.valueClass}
                  sub={tile.sub}
                />
              ))}
            </div>

            {/* Heart Rate Intensity Zone Distribution Bar (rendered when zone telemetry exists) */}
            {hasZoneData && currentWorkout.heartRateZones && (
              <div className="mt-4 pt-3.5 border-t border-slate-200/60 dark:border-slate-800/60">
                <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 mb-2">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center space-x-1.5">
                    <Heart className="w-3.5 h-3.5 text-rose-500" />
                    <span>Heart Rate Zone Intensity Breakdown</span>
                  </span>
                  <span className="text-[11px] text-slate-400">Cardiovascular Demand Distribution</span>
                </div>

                {/* Progress bar */}
                <div className="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex shadow-inner">
                  {currentWorkout.heartRateZones.peakMinutes ? (
                    <div
                      style={{
                        width: `${Math.round(((currentWorkout.heartRateZones.peakMinutes ?? 0) / (currentWorkout.durationMinutes || 1)) * 100)}%`,
                      }}
                      className="bg-rose-500 h-full"
                      title={`Peak Zone: ${currentWorkout.heartRateZones.peakMinutes}m`}
                    />
                  ) : null}
                  {currentWorkout.heartRateZones.cardioMinutes ? (
                    <div
                      style={{
                        width: `${Math.round(((currentWorkout.heartRateZones.cardioMinutes ?? 0) / (currentWorkout.durationMinutes || 1)) * 100)}%`,
                      }}
                      className="bg-purple-500 h-full"
                      title={`Cardio Zone: ${currentWorkout.heartRateZones.cardioMinutes}m`}
                    />
                  ) : null}
                  {currentWorkout.heartRateZones.fatBurnMinutes ? (
                    <div
                      style={{
                        width: `${Math.round(((currentWorkout.heartRateZones.fatBurnMinutes ?? 0) / (currentWorkout.durationMinutes || 1)) * 100)}%`,
                      }}
                      className="bg-amber-400 h-full"
                      title={`Fat Burn Zone: ${currentWorkout.heartRateZones.fatBurnMinutes}m`}
                    />
                  ) : null}
                </div>

                {/* Zone Legend */}
                <div className="flex flex-wrap items-center justify-between gap-2 mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                  <div className="flex items-center space-x-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
                    <span>Peak Zone ({currentWorkout.heartRateZones.peakMinutes ?? 0}m)</span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block" />
                    <span>Cardio Zone ({currentWorkout.heartRateZones.cardioMinutes ?? 0}m)</span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
                    <span>Fat Burn Zone ({currentWorkout.heartRateZones.fatBurnMinutes ?? 0}m)</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Empty State when no specific workout session was logged today */
        <div className="rounded-2xl p-4 sm:p-5 bg-slate-50/70 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800 text-center sm:text-left flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0 mx-auto sm:mx-0">
              <Timer className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">No Dedicated Workout Session Logged Today</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                General movement is tracked automatically. Start an exercise on your Apple Watch or Fitbit to capture duration, heart rate, and training load.
              </p>
            </div>
          </div>

          {/* Today's movement overview */}
          <div className="flex items-center justify-center sm:justify-end gap-3 text-xs shrink-0 border-t sm:border-t-0 sm:border-l border-slate-200 dark:border-slate-700/60 pt-3 sm:pt-0 sm:pl-4">
            <div className="text-center sm:text-right">
              <span className="text-[11px] text-slate-400 block">Daily Active Zone</span>
              <span className="font-bold text-teal-600 dark:text-teal-400 text-sm">{today.activeZoneMinutes} AZM</span>
            </div>
            <div className="text-center sm:text-right">
              <span className="text-[11px] text-slate-400 block">Day Max HR</span>
              <span className="font-bold text-rose-500 text-sm">{today.maxHeartRate ? `${today.maxHeartRate} bpm` : "—"}</span>
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}
