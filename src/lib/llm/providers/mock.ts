import { formatClock } from "../../utils";
import type { AgentRun } from "../loop";
import { executeHealthTool } from "../tools";
import type { ChatMessage, ToolExecutionSummary } from "../types";

const n = (value: unknown, unit: string) => (typeof value === "number" && value > 0 ? `**${value.toLocaleString()} ${unit}**` : "**—**");

/* eslint-disable @typescript-eslint/no-explicit-any -- tool payloads are provider-facing JSON */
type Intent = { match: RegExp; run: () => Promise<AgentRun> };

async function call(name: string, toolsCalled: ToolExecutionSummary[]): Promise<any> {
  const result = await executeHealthTool(name);
  toolsCalled.push(result.summary);
  return result.data;
}

/**
 * Offline advisor used when no LLM key is configured: routes the question to the
 * matching health tool and renders a compact, factual answer from real data.
 */
export async function runMockAdvisor(messages: ChatMessage[]): Promise<AgentRun> {
  const question = [...messages].reverse().find((m) => m.role === "user")?.content.toLowerCase() ?? "";
  const toolsCalled: ToolExecutionSummary[] = [];

  const intents: Intent[] = [
    {
      match: /sleep|bed|rest|wake/,
      run: async () => {
        const s = await call("get_sleep_analysis", toolsCalled);
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
        const main = (await call("get_connected_devices", toolsCalled)).devices?.[0];
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
        const hr = await call("get_heart_rate_insights", toolsCalled);
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
        const t = (await call("get_weekly_trends", toolsCalled)).weeklyAverages;
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

  const s = await call("get_today_health_summary", toolsCalled);
  const device = (await call("get_connected_devices", toolsCalled)).devices?.[0];
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
