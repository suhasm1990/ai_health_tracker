import { parseGoalRequest } from "../../goals/parse";
import { defaultUnit } from "../../goals/service";
import { coachStore } from "../../coach/store";
import { formatClock, shiftIso, todayIso } from "../../utils";
import type { AgentRun } from "../loop";
import { executeHealthTool, type ToolContext } from "../tools";
import type { ChatMessage, ToolExecutionSummary } from "../types";

const n = (value: unknown, unit: string) => (typeof value === "number" && value > 0 ? `**${value.toLocaleString()} ${unit}**` : "**—**");

const HABIT_PATTERNS: { habit: string; label: string; match: RegExp }[] = [
  { habit: "alcohol", label: "alcohol", match: /\b(had|drank|drinking)\b.*\b(beers?|drinks?|wine|alcohol|cocktails?|pints?|whisk(e)?y)\b/ },
  { habit: "late_caffeine", label: "late caffeine", match: /\b(coffee|caffeine|espresso|energy drink)\b.*\b([2-9]\s*(pm|p\.m\.)|afternoon|evening|late)\b/ },
  { habit: "late_meal", label: "a late meal", match: /\b(late (dinner|meal|snack)|ate late)\b/ },
  { habit: "stress", label: "a stressful day", match: /\b(stressful|stressed( out)?|so much stress)\b/ },
  { habit: "meditation", label: "meditation", match: /\b(meditated|meditation|breathwork)\b/ },
  { habit: "sauna", label: "sauna", match: /\b(sauna|hot bath)\b/ },
  { habit: "travel", label: "travel", match: /\b(flew|flight|jet ?lag(ged)?|travel(l)?ed)\b/ },
];

/* eslint-disable @typescript-eslint/no-explicit-any -- tool payloads are provider-facing JSON */
type Intent = { match: RegExp; run: () => Promise<AgentRun> };

/**
 * Offline advisor used when no LLM key is configured: routes the question to the
 * matching health tool and renders a compact, factual answer from real data.
 */
export async function runMockAdvisor(messages: ChatMessage[], ctx: ToolContext): Promise<AgentRun> {
  const question = [...messages].reverse().find((m) => m.role === "user")?.content.toLowerCase() ?? "";
  const toolsCalled: ToolExecutionSummary[] = [];
  const call = async (name: string, args: Record<string, unknown> = {}): Promise<any> => {
    const result = await executeHealthTool(name, args, ctx);
    toolsCalled.push(result.summary);
    return result.data;
  };

  // Memory and journal: explicit "remember …", "forget …", and habits mentioned in passing.
  const raw = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const store = coachStore(ctx.state, ctx.clientTz, ctx.guestId);
  const remember = raw.match(/^\s*(?:please\s+)?remember(?:\s+that)?\s+(.{3,})/i);
  if (remember) {
    const fact = remember[1].replace(/\.$/, "");
    const category = /injur|pain|sore|hurt|knee|ankle|back|shin|hip/i.test(fact) ? "injury" : /morning|evening|weekday|weekend|work|shift|schedule|kids/i.test(fact) ? "schedule" : /prefer|like|love|hate|don'?t|never|always/i.test(fact) ? "preference" : "other";
    await call("remember_fact", { fact, category });
    return { toolsCalled, text: `Got it. I'll remember that: *${fact}*. You can see or remove what I remember on the Today tab.` };
  }
  if (/what do you (know|remember) about me|what have you (saved|remembered)/.test(question)) {
    const memories = await store.memories();
    return { toolsCalled, text: memories.length ? `**What I remember**:\n${memories.map((m) => `- ${m.text}`).join("\n")}` : "I haven't saved anything about you yet. Tell me things like an injury, your schedule or your preferences, and I'll keep them in mind." };
  }
  const forget = question.match(/^\s*(?:please\s+)?forget(?:\s+(?:that|about))?\s+(.{3,})/);
  if (forget) {
    const words = forget[1].split(/\W+/).filter((w) => w.length > 3);
    const target = (await store.memories()).find((m) => words.some((w) => m.text.toLowerCase().includes(w)));
    if (!target) return { toolsCalled, text: "I couldn't find a saved fact matching that. Ask me what I remember to see the list." };
    await call("forget_fact", { id: target.id });
    return { toolsCalled, text: `Forgotten: *${target.text}*` };
  }
  const habitHits = HABIT_PATTERNS.filter((h) => h.match.test(question));
  if (habitHits.length && !/\?\s*$/.test(question)) {
    const day = /last night|yesterday/.test(question) ? shiftIso(ctx.clientDate ?? todayIso(ctx.clientTz), -1) : undefined;
    for (const h of habitHits) {
      const amount = h.habit === "alcohol" ? Number(question.match(/\b(\d+)\s*(?:beers?|drinks?|glass|cocktails?|pints?)/)?.[1]) || undefined : undefined;
      await call("log_habit", { habit: h.habit, ...(day && { date: day }), ...(amount && { amount }) });
    }
    return { toolsCalled, text: `Logged ${habitHits.map((h) => `**${h.label}**`).join(" and ")} for ${day ? "yesterday" : "today"}. After a few weeks of logging, the journal shows what it does to your next-morning HRV and sleep.` };
  }
  if (/what affects|my habits|journal|does (alcohol|drinking|coffee|caffeine|stress|a late meal)\b.*(affect|hurt|impact|change)/.test(question)) {
    const j = await call("get_journal_insights");
    return { toolsCalled, text: j.insights.length ? `**Your habits**:\n${j.insights.map((i: any) => `- ${i.headline}`).join("\n")}\n\n*Patterns in your own data, not proof of cause.*` : "No habits logged yet. Tap a habit on the Today tab, or just tell me (\"had 2 beers last night\")." };
  }

  // Goal creation first: "300k steps in November" must not fall through to the steps summary.
  const original = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const parsed = parseGoalRequest(original, ctx.clientDate ?? todayIso(ctx.clientTz), defaultUnit(ctx.clientTz));
  if (parsed && "ask" in parsed) return { toolsCalled, text: parsed.ask };
  if (parsed) {
    const g = await call(parsed.tool, parsed.args);
    if (!g.saved) return { toolsCalled, text: `I couldn't save that goal: ${g.error}` };
    const warnings = (g.warnings ?? []).map((w: string) => `\n- ⚠️ ${w}`).join("");
    if (parsed.tool === "create_training_plan") {
      return {
        toolsCalled,
        text: `**${g.title}** plan saved: **${g.weeks} weeks** to ${g.race}.

- **Build**: ${g.startingWeek} this week → peak **${g.peakWeek}**
- **Goal**: ${g.goalTime ? `**${g.goalTime}**` : "no goal time yet (tell me a recent race time to get paces)"}${g.paces?.[0] ? ` • ${g.paces[0]}` : ""}
- **This week**: ${(g.firstWeek ?? []).slice(0, 4).join(" • ")}${warnings}
- **Next**: it's on your dashboard now, with daily workouts, progress and badges.`,
      };
    }
    return {
      toolsCalled,
      text: `**${g.title}** saved: **${g.target}** from ${g.period}.

- **So far**: **${g.current}** (${g.percent}%) • ${g.paceCheck}
- **Needed**: ${g.neededPerDay ? `**${g.neededPerDay}** a day for ${g.daysLeft} days` : "you're already there"}
- **Next**: it's on your dashboard now and updates from your wearable automatically.`,
    };
  }

  // Only an explicit instruction about "my/the/this ... goal|plan|program" stops one; "should I stop training when sick?" must not.
  if (/^\s*(please\s+)?(stop|cancel|delete|remove|end)\s+(my|the|this)\b[\w\s-]{0,50}\b(goal|plan|program)\b/.test(question)) {
    const r = await call("archive_goal");
    return { toolsCalled, text: r.archived ? `Stopped **${r.title}** and removed it from your dashboard.` : `I couldn't tell which goal to stop. ${r.error}` };
  }

  const intents: Intent[] = [
    {
      match: /vital|anything off|outside my normal|normal range|effort|strain|training load|overtrain|consisten/,
      run: async () => {
        const b = await call("get_body_status");
        const off = b.vitals.filter((v: any) => v.outsideNormalInConcerningDirection);
        const lines = [
          off.length
            ? `- **Outside your normal**: ${off.map((v: any) => `${v.vital} **${v.lastNight}** (normal ${v.normalRange})`).join("; ")}`
            : "- **Vitals**: all within your normal range last night",
          `- **Effort**: **${b.effort.score}/100**, target ${b.effort.target[0]}–${b.effort.target[1]}. ${b.effort.advice}`,
          typeof b.trainingBalance === "string" ? "- **Training load**: needs 2 weeks of stored history to compare" : `- **Training load**: **${b.trainingBalance.label}** (${Math.round(b.trainingBalance.ratio * 100)}% of usual)`,
          `- **Sleep rhythm**: consistency **${b.sleepRhythm.consistencyScore ?? "—"}**, ${b.sleepRhythm.sleepDebt7Nights} sleep debt over 7 nights`,
        ];
        return { toolsCalled, text: lines.join("\n") + (off.length ? "\n\nTake it easier today and see if it settles. If you feel unwell or it persists, check with a doctor." : "") };
      },
    },
    {
      match: /today'?s plan|this plan|plan my week|rest of (this|the) week|sleep debt|bedtime|change[ds]? (today'?s|my) workout|what should i do today/,
      run: async () => {
        const p = await call("get_today_plan");
        const lines = [
          `- **Workout**: ${p.workout.title}${p.workout.original ? ` (planned: ${p.workout.original.title})` : ""}. ${p.workout.reason}`,
          p.sleep ? `- **Tonight**: in bed by **${p.sleep.bedtime}**. ${p.sleep.reason}` : "- **Tonight**: no recent sleep times recorded, so no bedtime target yet.",
          p.upcomingSession ? `- **Next session**: ${p.upcomingSession.title} on ${p.upcomingSession.date}` : null,
        ].filter(Boolean);
        return { toolsCalled, text: `**${p.headline}** ${p.summary}\n\n${lines.join("\n")}` };
      },
    },
    {
      match: /goal|badge|training|my plan|workout today|tracking|marathon|race/,
      run: async () => {
        const { goals, ideas } = await call("get_goals_progress");
        if (!goals.length) return { toolsCalled, text: `No goals yet. Try one of these:\n${(ideas ?? []).map((i: string) => `- *"${i}"*`).join("\n")}` };
        const lines = goals.map((g: any) =>
          g.type === "training program"
            ? `- **${g.title}** (${g.daysToRace} days out, ${g.week}): ${g.nudge}${g.badgesEarned.length ? ` 🏅 ${g.badgesEarned.length} badges` : ""}`
            : `- **${g.title}**: **${g.current}** of ${g.target} (${g.percent}%). ${g.nudge}`
        );
        return { toolsCalled, text: `**Your goals**:\n${lines.join("\n")}` };
      },
    },
    {
      match: /sleep|bed|rest|wake/,
      run: async () => {
        const s = await call("get_sleep_analysis");
        const good = s.sleepScore >= 80;
        return {
          toolsCalled,
          text: `**Sleep Score**: **${s.sleepScore}/100** (${s.rating}) • **Duration**: **${s.durationFormatted}**

- **Stages**: **Deep**: ${s.stageHighlights.deep} • **REM**: ${s.stageHighlights.rem} • **Light**: ${s.stageHighlights.light} • **Awake**: ${s.stageHighlights.awake}
- **Assessment**: ${good ? "Solid physical & cognitive recovery. Maintain a consistent wake time within ±30 mins." : "Recovery is below optimal. Shift bedtime 30 mins earlier to hit 7.5+ hours."}
- **Action**: Keep the bedroom cool (65–68°F) and dim screens 60 mins before sleep.`,
        };
      },
    },
    {
      match: /battery|device|fitbit|watch|sync/,
      run: async () => {
        const main = (await call("get_connected_devices")).devices?.[0];
        return {
          toolsCalled,
          text: main
            ? `**${main.displayName}** (${main.model}):
- **Battery**: **${main.batteryLevel}** (${main.batteryStatus})
- **Last Synced**: ${formatClock(new Date(main.lastSyncTime))}
- **Status**: ${main.batteryStatus === "LOW" ? "⚠️ Low battery — charge before your workout or sleep." : "✅ Battery level is fine."}`
            : "No paired wearables detected.",
        };
      },
    },
    {
      match: /heart|bpm|cardio|hrv/,
      run: async () => {
        const hr = await call("get_heart_rate_insights");
        return {
          toolsCalled,
          text: `**Cardiovascular Insights**:
- **Resting HR**: ${n(hr.restingHeartRateBpm, "bpm")} (typical range: 50–65 bpm)
- **Daytime**: ${n(hr.averageHeartRateBpm, "bpm")} avg • ${n(hr.maxHeartRateBpm, "bpm")} peak
- **HRV**: ${n(hr.heartRateVariabilityMs, "ms")}
- **Zones**: **${hr.zones.fatBurnMinutes}m** Fat Burn • **${hr.zones.cardioPeakMinutes}m** Cardio/Peak
- **Takeaway**: Keep building aerobic base with zone-2 sessions.`,
        };
      },
    },
    {
      match: /trend|week|history|progress/,
      run: async () => {
        const t = (await call("get_weekly_trends")).weeklyAverages;
        return {
          toolsCalled,
          text: `**7-Day Trends**:
- **Daily Steps**: ${n(t.averageDailySteps, "steps/day")}
- **Average Sleep**: **${t.averageDailySleep} / night**
- **Resting HR**: ${n(t.averageRestingHeartRate, "bpm")}
- **Takeaway**: Consistency over the week matters more than any single day.`,
        };
      },
    },
  ];

  const intent = intents.find((i) => i.match.test(question));
  if (intent) return intent.run();

  const s = await call("get_today_health_summary");
  const device = (await call("get_connected_devices")).devices?.[0];
  const remaining = Math.max(0, s.stepsGoal - s.steps);
  return {
    toolsCalled,
    text: `**Today's Health Snapshot** (${device?.displayName ?? "Wearable"}):
- **Activity**: **${s.steps.toLocaleString()}** / ${s.stepsGoal.toLocaleString()} steps (${s.stepsGoalAchievedPercent}%) • **${s.activeZoneMinutes} AZM** • **${s.caloriesBurned.toLocaleString()} kcal**
- **Vitals**: ${n(s.restingHeartRateBpm, "bpm")} resting HR • ${n(s.oxygenSaturationPercent, "% SpO2")} • ${n(s.heartRateVariabilityMs, "ms HRV")}
- **Sleep**: **${s.sleep.duration}** (Score: **${s.sleep.score}/100**)
- **Action**: ${remaining > 0 ? `A brisk ${Math.max(10, Math.round(remaining / 110))}-min walk closes the remaining ${remaining.toLocaleString()} steps.` : "Step goal reached — keep hydrated and wind down well tonight."}`,
  };
}
