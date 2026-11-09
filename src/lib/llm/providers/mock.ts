import { parseGoalRequest } from "../../goals/parse";
import { defaultUnit } from "../../goals/service";
import { formatClock, todayIso } from "../../utils";
import type { AgentRun } from "../loop";
import { executeHealthTool, type ToolContext } from "../tools";
import type { ChatMessage, ToolExecutionSummary } from "../types";

const n = (value: unknown, unit: string) => (typeof value === "number" && value > 0 ? `**${value.toLocaleString()} ${unit}**` : "**—**");

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
