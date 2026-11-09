"use client";

import { Check, ChevronDown, Flag, Minus, RefreshCw, Timer, X } from "lucide-react";
import { useState } from "react";
import type { Phase, ProgramView, SessionType, SessionView, WeekView } from "@/lib/goals/types";
import { RACE_LABEL, formatDistance, formatLongDate, formatPace, formatTime, toUnit } from "@/lib/goals/units";
import { WEEKDAY_SHORT, formatShortDate, isoToCivil } from "@/lib/utils";
import { BadgeRow } from "./BadgeMedal";
import { DetailsToggle, NudgeBanner, RemoveButton, useStoredToggle } from "./shared";

const SESSION_STYLE: Record<SessionType, { dot: string; text: string; short: string }> = {
  rest: { dot: "bg-slate-300 dark:bg-slate-600", text: "text-slate-500 dark:text-slate-400", short: "Rest" },
  strength: { dot: "bg-sky-500", text: "text-sky-600 dark:text-sky-400", short: "Gym" },
  easy: { dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400", short: "Easy" },
  recovery: { dot: "bg-teal-400", text: "text-teal-600 dark:text-teal-400", short: "Recov" },
  long: { dot: "bg-indigo-500", text: "text-indigo-600 dark:text-indigo-400", short: "Long" },
  tempo: { dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-400", short: "Tempo" },
  intervals: { dot: "bg-rose-500", text: "text-rose-600 dark:text-rose-400", short: "Speed" },
  hills: { dot: "bg-orange-500", text: "text-orange-600 dark:text-orange-400", short: "Hills" },
  race_pace: { dot: "bg-violet-500", text: "text-violet-600 dark:text-violet-400", short: "Pace" },
  shakeout: { dot: "bg-teal-400", text: "text-teal-600 dark:text-teal-400", short: "Shake" },
  race: { dot: "bg-fuchsia-500", text: "text-fuchsia-600 dark:text-fuchsia-400", short: "Race" },
};

const PHASE_BAR: Record<Phase, string> = {
  Base: "bg-emerald-400/50 dark:bg-emerald-500/30",
  Build: "bg-amber-400/50 dark:bg-amber-500/30",
  Peak: "bg-rose-400/50 dark:bg-rose-500/30",
  Taper: "bg-violet-400/50 dark:bg-violet-500/30",
  Race: "bg-fuchsia-500/60",
};
const PHASE_FILL: Record<Phase, string> = { Base: "bg-emerald-500", Build: "bg-amber-500", Peak: "bg-rose-500", Taper: "bg-violet-500", Race: "bg-fuchsia-500" };

type Unit = "km" | "mi";

const weekdayOf = (iso: string) => {
  const { year, month, day } = isoToCivil(iso);
  return WEEKDAY_SHORT[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
};
const bare = (km: number, unit: Unit) => formatDistance(km, unit).replace(` ${unit}`, "");

function StatusMark({ status }: { status: SessionView["status"] }) {
  const base = "w-4 h-4 rounded-full text-white flex items-center justify-center";
  if (status === "done") return <span className={`${base} bg-emerald-500`}><Check className="w-3 h-3" strokeWidth={3} /></span>;
  if (status === "covered") return <span className={`${base} bg-emerald-500/40`}><Check className="w-3 h-3" strokeWidth={3} /></span>;
  if (status === "partial") return <span className={`${base} bg-amber-500`}><Minus className="w-3 h-3" strokeWidth={3} /></span>;
  if (status === "missed") return <span className={`${base} bg-slate-300 dark:bg-slate-600`}><X className="w-3 h-3" strokeWidth={3} /></span>;
  return <span className="w-4 h-4" />;
}

function DayTile({ session, unit, selected, isToday, onSelect }: { session: SessionView; unit: Unit; selected: boolean; isToday: boolean; onSelect: () => void }) {
  const style = SESSION_STYLE[session.type];
  // A run on a day with none planned shows what was actually run.
  const bonus = session.distanceKm === 0 && session.ranKm > 0;
  const km = bonus ? session.ranKm : session.adjustedKm ?? session.distanceKm;
  const changed = session.adjustedKm !== null && session.status !== "covered";
  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      className={`relative flex flex-col items-center rounded-xl border px-0.5 py-1.5 min-w-0 transition-all ${
        selected ? "border-emerald-500 bg-emerald-500/10 shadow-sm" : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 hover:border-slate-300 dark:hover:border-slate-700"
      } ${session.status === "before_start" ? "opacity-40" : ""} ${isToday ? "ring-2 ring-emerald-500/40" : ""}`}
    >
      <span className={`text-[10px] font-semibold ${isToday ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500 dark:text-slate-400"}`}>{isToday ? "Today" : weekdayOf(session.date)}</span>
      <span className={`mt-0.5 text-xs font-bold truncate max-w-full ${session.status === "covered" ? "text-slate-400 line-through" : changed || bonus ? "text-emerald-600 dark:text-emerald-400" : "text-slate-900 dark:text-white"}`}>
        {km > 0 ? `${bonus ? "+" : ""}${bare(km, unit)}` : "–"}
      </span>
      <span className={`flex items-center gap-1 text-[9px] sm:text-[10px] font-medium truncate max-w-full ${style.text}`}>
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
        {bonus ? "Ran" : style.short}
      </span>
      <span className="mt-0.5"><StatusMark status={bonus ? "done" : session.status} /></span>
    </button>
  );
}

function SessionDetail({ session, unit, today }: { session: SessionView; unit: Unit; today: string }) {
  const style = SESSION_STYLE[session.type];
  const when = session.date === today ? "Today" : formatLongDate(session.date);
  const target = session.adjustedKm ?? session.distanceKm;
  const outcome =
    session.status === "done" && session.distanceKm > 0 ? (session.actualKm > 0 ? `Done: ${formatDistance(session.actualKm, unit)}` : "Done")
    : session.status === "partial" ? `Partly done: ${formatDistance(session.actualKm, unit)} of ${formatDistance(target, unit)}`
    : session.status === "missed" ? "Missed. Let it go; a run on any other day this week still counts."
    : null;
  return (
    <div className="mt-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className={`w-2 h-2 rounded-full ${style.dot}`} />
        <span className="text-xs font-semibold text-slate-900 dark:text-white">
          {when}: {session.title}
          {target > 0 ? `, ${formatDistance(target, unit)}` : ""}
        </span>
        {outcome && <span className={`text-[11px] font-medium ${session.status === "done" ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500 dark:text-slate-400"}`}>{outcome}</span>}
      </div>
      {session.note && <p className="mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">{session.note}</p>}
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{session.details}</p>
      {session.crossTraining && <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Also that day: {session.crossTraining}.</p>}
    </div>
  );
}

/** Every week of the plan as a bar: planned height, filled by what was actually run. */
function PlanChart({ weeks, selected, onSelect }: { weeks: WeekView[]; selected: number; onSelect: (i: number) => void }) {
  const max = Math.max(...weeks.map((w) => w.plannedKm), 1);
  return (
    <div>
      <div className="flex items-end gap-[2px] sm:gap-1 h-16">
        {weeks.map((w) => {
          const fill = w.plannedKm > 0 ? Math.min(1, w.actualKm / w.plannedKm) : 0;
          return (
            <button
              key={w.index}
              onClick={() => onSelect(w.index)}
              title={`Week ${w.index + 1} (${w.phase}), from ${formatShortDate(w.startDate)}`}
              aria-label={`Week ${w.index + 1}`}
              className={`relative flex-1 min-w-0 rounded-t-sm overflow-hidden ${PHASE_BAR[w.phase]} ${w.index === selected ? "outline outline-2 outline-emerald-500" : ""} ${w.state === "current" ? "ring-1 ring-slate-900/40 dark:ring-white/50" : ""}`}
              style={{ height: `${Math.max(8, (w.plannedKm / max) * 100)}%` }}
            >
              <span className={`absolute bottom-0 inset-x-0 ${PHASE_FILL[w.phase]}`} style={{ height: `${fill * 100}%` }} />
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-500 dark:text-slate-400">
        {(Object.keys(PHASE_FILL) as Phase[]).filter((p) => weeks.some((w) => w.phase === p)).map((p) => (
          <span key={p} className="inline-flex items-center gap-1">
            <span className={`w-2 h-2 rounded-sm ${PHASE_FILL[p]}`} />
            {p}
          </span>
        ))}
        <span className="ml-auto">Tap a week to see its workouts</span>
      </div>
    </div>
  );
}

/** How closely the runner is following the plan, in words. */
function adherenceLabel(share: number | null): { value: string; sub: string; className: string } {
  if (share === null) return { value: "—", sub: "nothing due yet", className: "" };
  const pct = Math.min(150, Math.round(share * 100));
  if (share >= 0.8) return { value: `${pct}%`, sub: "on track", className: "text-emerald-600 dark:text-emerald-400" };
  if (share >= 0.6) return { value: `${pct}%`, sub: "slipping a little", className: "text-amber-600 dark:text-amber-400" };
  return { value: `${pct}%`, sub: "behind: the plan will re-level", className: "text-rose-600 dark:text-rose-400" };
}

interface ProgramCardProps {
  view: ProgramView;
  today: string;
  newBadgeIds: Set<string>;
  onAsk: (text: string) => void;
  onRemove: () => void;
}

/**
 * Collapsed, the card answers "what do I do today and how is this week going";
 * everything else (stats, the whole plan, badges, paces) opens underneath.
 */
export function ProgramCard({ view, today, newBadgeIds, onAsk, onRemove }: ProgramCardProps) {
  const { goal, plan, weeks, totals, daysToRace } = view;
  const unit = goal.unit;
  const [open, toggleOpen] = useStoredToggle(`health-app-goal-open:${goal.id}`);
  const [weekIndex, setWeekIndex] = useState(view.currentWeekIndex ?? (daysToRace < 0 ? weeks.length - 1 : 0));
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const [showPlan, setShowPlan] = useState(false);
  const week = weeks[Math.min(weekIndex, weeks.length - 1)];
  const isThisWeek = week.index === view.currentWeekIndex;
  // Collapsed, a day's detail shows only once it is tapped; opened, there is always one on show.
  const fallback = week.sessions.find((s) => s.date === today) ?? week.sessions.find((s) => s.distanceKm > 0 && s.status !== "before_start") ?? week.sessions[0];
  const session = week.sessions.find((s) => s.date === pickedDate) ?? (open ? fallback : null);
  const weekPct = week.plannedKm > 0 ? Math.min(100, Math.round((week.actualKm / week.plannedKm) * 100)) : 0;
  const planPct = totals.plannedKm > 0 ? Math.min(100, Math.round((totals.actualKm / totals.plannedKm) * 100)) : 0;
  const adherence = adherenceLabel(totals.adherence);
  const earned = view.badges.filter((b) => b.earned).length;
  const selectWeek = (i: number) => {
    setWeekIndex(i);
    setPickedDate(null);
  };

  return (
    <article className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      <div className="p-3 sm:p-4 bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent">
        <button onClick={toggleOpen} aria-expanded={open} className="w-full flex items-center justify-between gap-3 text-left">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-md shrink-0">
              <Flag className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">{plan.raceName}</h4>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate">
                {formatLongDate(plan.raceDate)}, {isoToCivil(plan.raceDate).year} · {RACE_LABEL[plan.distance]}
                {plan.goalTimeSec ? ` · goal ${formatTime(plan.goalTimeSec)}` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="text-right">
              <div className="text-lg sm:text-xl font-black tracking-tight text-emerald-600 dark:text-emerald-400 leading-none">{Math.max(0, daysToRace)}</div>
              <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">days to go</div>
            </div>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
          </div>
        </button>
        <NudgeBanner nudge={view.nudge} compact className="mt-2.5" action={{ label: "Ask coach", onClick: () => onAsk("What's my training plan workout today, and how is this week going?") }} />
      </div>

      <div className="px-3 sm:px-4 pt-3 pb-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 mb-1.5">
          <div className="text-xs font-semibold text-slate-900 dark:text-white">
            Week {week.index + 1} of {weeks.length} · {week.phase}
            {week.isDownWeek ? " · down week" : ""}
            <span className="ml-1.5 font-normal text-slate-500 dark:text-slate-400">{isThisWeek ? "this week" : `from ${formatShortDate(week.startDate)}`}</span>
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400">
            <strong className="text-slate-900 dark:text-white">{formatDistance(week.actualKm, unit)}</strong> of {formatDistance(week.plannedKm, unit)}
          </div>
        </div>
        <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden mb-2">
          <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-700" style={{ width: `${weekPct}%` }} />
        </div>
        <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
          {week.sessions.map((s) => (
            <DayTile key={s.date} session={s} unit={unit} selected={s.date === session?.date} isToday={s.date === today} onSelect={() => setPickedDate(pickedDate === s.date && !open ? null : s.date)} />
          ))}
        </div>
        {session && <SessionDetail session={session} unit={unit} today={today} />}
        {!isThisWeek && view.currentWeekIndex !== null && (
          <button onClick={() => selectWeek(view.currentWeekIndex!)} className="mt-2 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:underline">
            Back to this week
          </button>
        )}
      </div>

      {view.adaptation && (
        <div className="mx-3 sm:mx-4 mb-3 flex items-start gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 p-2.5">
          <RefreshCw className="w-4 h-4 shrink-0 mt-0.5 text-sky-600 dark:text-sky-400" />
          <div className="min-w-0 text-[11px] text-slate-600 dark:text-slate-400">
            <span className="font-semibold text-slate-900 dark:text-white">Plan {view.adaptation.direction} on {formatShortDate(view.adaptation.date)}. </span>
            {view.adaptation.message}{" "}
            <button onClick={() => onAsk(`About my ${plan.raceName} plan adjustment: `)} className="font-semibold text-emerald-700 dark:text-emerald-400 hover:underline">
              Change it
            </button>
          </div>
        </div>
      )}

      {open && (
        <div className="px-3 sm:px-4 pb-4 space-y-4 animate-in fade-in duration-200">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {week.focus} Runs are imported from Google Health when your device syncs, and count on whichever day you do them.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {[
              { label: "Plan adherence", ...adherence },
              { label: "Week streak", value: `${totals.weekStreak}`, sub: `${totals.weeksCompleted} of ${weeks.length} weeks hit`, className: "" },
              { label: "Longest run", value: totals.longestRunKm > 0 ? formatDistance(totals.longestRunKm, unit) : "—", sub: `builds to ${formatDistance(plan.peakLongRunKm, unit, 0)}`, className: "" },
              { label: "Distance logged", value: formatDistance(totals.actualKm, unit, 0), sub: `of ${formatDistance(totals.plannedKm, unit, 0)} (${planPct}%)`, className: "" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-2.5">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">{s.label}</div>
                <div className={`text-base font-bold ${s.className || "text-slate-900 dark:text-white"}`}>{s.value}</div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">{s.sub}</div>
              </div>
            ))}
          </div>

          <PlanChart weeks={weeks} selected={week.index} onSelect={selectWeek} />
          <BadgeRow badges={view.badges} newIds={newBadgeIds} />

          {plan.warnings.length > 0 && (
            <ul className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl p-2.5 space-y-0.5">
              {plan.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button onClick={() => setShowPlan((v) => !v)} aria-expanded={showPlan} className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline">
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showPlan ? "rotate-180" : ""}`} />
                Training paces and every week
              </button>
              <div className="flex items-center gap-1">
                <button onClick={() => onAsk(`Change my ${plan.raceName} plan: `)} className="px-2 py-1 rounded-lg text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-emerald-600 hover:bg-emerald-500/10 transition-colors">
                  Change plan
                </button>
                <RemoveButton label="Stop plan" onConfirm={onRemove} />
              </div>
            </div>
            {showPlan && (
              <div className="mt-3 grid grid-cols-1 lg:grid-cols-5 gap-3 animate-in fade-in duration-200">
                <div className="lg:col-span-2 rounded-xl border border-slate-200 dark:border-slate-800 p-3">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-white mb-2">
                    <Timer className="w-3.5 h-3.5 text-emerald-500" /> Training paces
                  </div>
                  {plan.goalTimeSec ? (
                    <table className="w-full text-[11px]">
                      <tbody>
                        {plan.paces.map((p) => (
                          <tr key={p.label} className="border-t border-slate-100 dark:border-slate-800 first:border-0">
                            <td className="py-1 pr-2 font-medium text-slate-700 dark:text-slate-300">{p.label}</td>
                            <td className="py-1 text-right font-mono text-slate-900 dark:text-white whitespace-nowrap">
                              {p.fastSecPerKm && p.slowSecPerKm ? `${formatPace(p.fastSecPerKm, unit).replace(` /${unit}`, "")}–${formatPace(p.slowSecPerKm, unit)}` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      No goal time yet, so workouts go by effort.{" "}
                      <button onClick={() => onAsk(`Add a goal time to my ${plan.raceName} plan. My recent race result is: `)} className="font-semibold text-emerald-700 dark:text-emerald-400 hover:underline">
                        Add one with the coach
                      </button>
                    </p>
                  )}
                  {plan.goalTimeSource === "predicted" && <p className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">Goal time predicted from your recent race. Re-test mid-plan and tell the coach your new result.</p>}
                </div>
                <div className="lg:col-span-3 rounded-xl border border-slate-200 dark:border-slate-800 max-h-64 overflow-y-auto">
                  <table className="w-full text-[11px]">
                    <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400">
                      <tr>
                        <th className="text-left font-semibold px-2.5 py-1.5">Week</th>
                        <th className="text-left font-semibold px-2 py-1.5">Phase</th>
                        <th className="text-right font-semibold px-2 py-1.5">Plan</th>
                        <th className="text-right font-semibold px-2 py-1.5">Long</th>
                        <th className="text-right font-semibold px-2.5 py-1.5">Done</th>
                      </tr>
                    </thead>
                    <tbody>
                      {weeks.map((w) => (
                        <tr key={w.index} onClick={() => selectWeek(w.index)} className={`cursor-pointer border-t border-slate-100 dark:border-slate-800 hover:bg-emerald-500/5 ${w.index === week.index ? "bg-emerald-500/10" : ""}`}>
                          <td className="px-2.5 py-1 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            {w.index + 1} · {formatShortDate(w.startDate)}
                          </td>
                          <td className="px-2 py-1 text-slate-500 dark:text-slate-400">
                            {w.phase}
                            {w.isDownWeek ? " ↓" : ""}
                          </td>
                          <td className="px-2 py-1 text-right font-mono text-slate-900 dark:text-white">{toUnit(w.plannedKm, unit).toFixed(0)}</td>
                          <td className="px-2 py-1 text-right font-mono text-slate-600 dark:text-slate-400">{toUnit(w.longRunKm, unit).toFixed(0)}</td>
                          <td className="px-2.5 py-1 text-right font-mono">
                            {w.completion === null ? <span className="text-slate-300 dark:text-slate-600">·</span> : <span className={w.state === "done" ? "text-emerald-600 dark:text-emerald-400" : "text-slate-600 dark:text-slate-400"}>{Math.round(w.completion * 100)}%</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      <DetailsToggle open={open} onToggle={toggleOpen} label={open ? "details" : `stats, full plan and badges (${earned}/${view.badges.length})`} />
    </article>
  );
}
