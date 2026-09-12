import { ChatMessage, ToolExecutionSummary } from "../types";
import { executeHealthTool } from "../tools";

export async function runMockAdvisor(
  messages: ChatMessage[]
): Promise<{ text: string; toolsCalled: ToolExecutionSummary[] }> {
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")?.content.toLowerCase() || "";
  const toolsCalled: ToolExecutionSummary[] = [];

  let text = "";

  // 1. Sleep-focused questions
  if (lastUserMsg.includes("sleep") || lastUserMsg.includes("bed") || lastUserMsg.includes("rest") || lastUserMsg.includes("wake")) {
    const sleepRes = await executeHealthTool("get_sleep_analysis", {});
    toolsCalled.push(sleepRes.summary);

    const s = sleepRes.data;
    const isGood = s.sleepScore >= 80;

    text = `**Sleep Score**: **${s.sleepScore}/100** (${s.rating}) • **Duration**: **${s.durationFormatted}**

- **Stages**: **Deep**: ${s.stageHighlights.deep} • **REM**: ${s.stageHighlights.rem} • **Light**: ${s.stageHighlights.light} • **Awake**: ${s.stageHighlights.awake}
- **Assessment**: ${
      isGood
        ? "Solid physical & cognitive recovery. Maintain consistent wake time within ±30 mins."
        : "Recovery is below optimal. Shift bedtime 30 mins earlier to hit 7.5+ hours."
    }
- **Action**: Keep bedroom cool (65–68°F) and dim screens 60 mins before sleep.`;
  }
  // 2. Battery / Device questions
  else if (lastUserMsg.includes("battery") || lastUserMsg.includes("device") || lastUserMsg.includes("fitbit") || lastUserMsg.includes("watch") || lastUserMsg.includes("sync")) {
    const devRes = await executeHealthTool("get_connected_devices", {});
    toolsCalled.push(devRes.summary);

    const devs = devRes.data.devices || [];
    const main = devs[0];

    text = main
      ? `**${main.displayName}** (${main.model}):
- **Battery**: **${main.batteryLevel}%** (${main.batteryStatus})
- **Last Synced**: ${new Date(main.lastSyncTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
- **Status**: ${main.batteryStatus === "LOW" ? "⚠️ Low battery — charge before workout or sleep." : "✅ Optimal battery level."}`
      : "No paired wearables detected.";
  }
  // 3. Heart rate / cardio questions
  else if (lastUserMsg.includes("heart") || lastUserMsg.includes("bpm") || lastUserMsg.includes("cardio") || lastUserMsg.includes("hrv")) {
    const hrRes = await executeHealthTool("get_heart_rate_insights", {});
    toolsCalled.push(hrRes.summary);

    const hr = hrRes.data;

    text = `**Cardiovascular Insights**:
- **Resting HR**: **${hr.restingHeartRateBpm || 53} bpm** (Optimal range: 50–65 bpm)
- **Daytime**: **${hr.averageHeartRateBpm || 68} bpm** avg • **${hr.maxHeartRateBpm || 138} bpm** peak
- **HRV**: **${hr.heartRateVariabilityMs || 42} ms** (Balanced autonomic recovery)
- **Zones**: **${hr.zones.fatBurnMinutes}m** Fat Burn • **${hr.zones.cardioPeakMinutes}m** Cardio/Peak
- **Takeaway**: Strong baseline cardiovascular efficiency. Continue aerobic zone-2 conditioning.`;
  }
  // 4. Trends / Weekly questions
  else if (lastUserMsg.includes("trend") || lastUserMsg.includes("week") || lastUserMsg.includes("history") || lastUserMsg.includes("progress")) {
    const trendRes = await executeHealthTool("get_weekly_trends", {});
    toolsCalled.push(trendRes.summary);

    const t = trendRes.data;

    text = `**7-Day Trends**:
- **Daily Steps**: **${t.weeklyAverages.averageDailySteps.toLocaleString()} steps/day**
- **Average Sleep**: **${t.weeklyAverages.averageDailySleep} / night**
- **Resting HR**: **${t.weeklyAverages.averageRestingHeartRate} bpm**
- **Takeaway**: Consistent activity and sleep patterns over the past week.`;
  }
  // 5. Default / Overall health summary
  else {
    const summaryRes = await executeHealthTool("get_today_health_summary", {});
    toolsCalled.push(summaryRes.summary);

    const devRes = await executeHealthTool("get_connected_devices", {});
    toolsCalled.push(devRes.summary);

    const s = summaryRes.data;
    const mainDev = devRes.data.devices?.[0];

    text = `**Today's Health Snapshot** (${mainDev?.displayName || "Wearable"}):
- **Activity**: **${s.steps.toLocaleString()}** / ${s.stepsGoal.toLocaleString()} steps (${s.stepsGoalAchievedPercent}%) • **${s.activeZoneMinutes} AZM** • **${s.caloriesBurned.toLocaleString()} kcal**
- **Vitals**: **${s.restingHeartRateBpm || 53} bpm** resting HR • **${s.oxygenSaturationPercent || 98}%** SpO2 • **${s.heartRateVariabilityMs || 42} ms** HRV
- **Sleep**: **${s.sleep.duration}** (Score: **${s.sleep.score}/100**)
- **Action**: On track for your movement target. A brief 15-min walk will complete your 10,000-step goal.`;
  }

  return { text, toolsCalled };
}
