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

    text = `### 🌙 Sleep Analysis & Recovery Insights

Last night you logged **${s.durationFormatted}** of total sleep with a **Sleep Score of ${s.sleepScore}/100 (${s.rating})**.

#### Sleep Architecture Breakdown:
- **Deep Sleep**: **${s.stageHighlights.deep}** *(target: 15–25%)* — Essential for tissue regeneration, cellular repair, and physical recovery.
- **REM Sleep**: **${s.stageHighlights.rem}** *(target: 20–25%)* — Vital for memory consolidation, mood regulation, and neuroplasticity.
- **Light Sleep**: **${s.stageHighlights.light}** — Foundation for baseline mental refresh.
- **Awake Time**: **${s.stageHighlights.awake}** — Brief awakenings during sleep cycle transitions.

#### 💡 Personalized Recommendations:
1. **Sleep Consistency**: ${
      isGood
        ? "Your sleep architecture is solid! Maintain your current sleep and wake times within a ±30-minute window to keep your circadian rhythm locked in."
        : "Aim to bring your bedtime 30 minutes earlier to ensure a full 7.5 to 8-hour sleep window."
    }
2. **Thermal Regulation**: Keep the bedroom around 65–68°F (18–20°C). A cooler ambient temperature facilitates the core body temperature drop required for deeper slow-wave sleep.
3. **Adenosine & Light Control**: Dim screens or wear blue-light blocking filters 60 minutes before bed, and stop caffeine intake at least 8 hours prior to sleep.

*Note: You can connect your **NVIDIA NIM** or **Google Gemini** API key in Settings or \`.env.local\` for dynamic LLM responses.*`;
  }
  // 2. Battery / Device questions
  else if (lastUserMsg.includes("battery") || lastUserMsg.includes("device") || lastUserMsg.includes("fitbit") || lastUserMsg.includes("watch") || lastUserMsg.includes("sync")) {
    const devRes = await executeHealthTool("get_connected_devices", {});
    toolsCalled.push(devRes.summary);

    const devs = devRes.data.devices || [];
    const main = devs[0];

    text = `### ⌚ Connected Wearable Status

${
  main
    ? `**${main.displayName} (${main.model})**
- **Battery Level**: **${main.batteryLevel}** (${main.batteryStatus})
- **Manufacturer**: ${main.manufacturer}
- **Last Live Sync**: ${new Date(main.lastSyncTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}

${main.batteryStatus === "LOW" ? "⚠️ **Battery Alert**: Your tracker battery is low. Consider placing it on the magnetic dock before your next workout or bedtime." : "✅ **Battery Status**: Battery level is optimal for continuous tracking."}`
    : "No wearable devices currently paired."
}

*Note: Real-time device telemetry is synced directly from your Google Health API layer.*`;
  }
  // 3. Heart rate / cardio questions
  else if (lastUserMsg.includes("heart") || lastUserMsg.includes("bpm") || lastUserMsg.includes("cardio") || lastUserMsg.includes("hrv")) {
    const hrRes = await executeHealthTool("get_heart_rate_insights", {});
    toolsCalled.push(hrRes.summary);

    const hr = hrRes.data;

    text = `### ❤️ Cardiovascular & Heart Rate Insights

- **Resting Heart Rate**: **${hr.restingHeartRateBpm || 53} bpm** *(Athletic / Optimal range: 50–65 bpm)*
- **Average Daytime HR**: **${hr.averageHeartRateBpm || 68} bpm**
- **Peak Heart Rate**: **${hr.maxHeartRateBpm || 138} bpm**
- **Heart Rate Variability (HRV)**: **${hr.heartRateVariabilityMs || 42} ms** *(indicates balanced autonomic nervous system)*

#### Cardio Zone Distribution:
- **Fat Burn Zone**: **${hr.zones.fatBurnMinutes} mins** (aerobic fat oxidation)
- **Cardio & Peak Zones**: **${hr.zones.cardioPeakMinutes} mins** (high-intensity cardiovascular conditioning)

**Coaching Assessment**: Your resting heart rate indicates strong cardiovascular baseline efficiency. Keep balancing moderate aerobic walks with recovery intervals.`;
  }
  // 4. Trends / Weekly questions
  else if (lastUserMsg.includes("trend") || lastUserMsg.includes("week") || lastUserMsg.includes("history") || lastUserMsg.includes("progress")) {
    const trendRes = await executeHealthTool("get_weekly_trends", {});
    toolsCalled.push(trendRes.summary);

    const t = trendRes.data;

    text = `### 📈 7-Day Performance & Trends

- **Average Daily Steps**: **${t.weeklyAverages.averageDailySteps.toLocaleString()} steps / day**
- **Average Sleep**: **${t.weeklyAverages.averageDailySleep} / night**
- **Average Resting HR**: **${t.weeklyAverages.averageRestingHeartRate} bpm**

**Weekly Overview**: Your activity and sleep consistency over the past 7 days show steady positive trends. Steady adherence to daily 8,000+ steps is correlating nicely with low resting heart rates.`;
  }
  // 5. Default / Overall health summary
  else {
    const summaryRes = await executeHealthTool("get_today_health_summary", {});
    toolsCalled.push(summaryRes.summary);

    const devRes = await executeHealthTool("get_connected_devices", {});
    toolsCalled.push(devRes.summary);

    const s = summaryRes.data;
    const mainDev = devRes.data.devices?.[0];

    text = `### 🌟 Daily Health & Wellness Summary

Here is your current health status from your connected **${mainDev?.displayName || "wearable"}**:

- **Steps**: **${s.steps.toLocaleString()}** / ${s.stepsGoal.toLocaleString()} (${s.stepsGoalAchievedPercent}% of goal)
- **Active Zone Minutes**: **${s.activeZoneMinutes} mins** (Goal: ${s.activeZoneMinutesGoal} mins)
- **Calories Burned**: **${s.caloriesBurned.toLocaleString()} kcal**
- **Resting Heart Rate**: **${s.restingHeartRateBpm || 53} bpm**
- **Blood Oxygen (SpO2)**: **${s.oxygenSaturationPercent || 98}%** (Healthy baseline)
- **Heart Rate Variability (HRV)**: **${s.heartRateVariabilityMs || 42} ms**
- **Sleep Quality**: **${s.sleep.duration}** with a Sleep Score of **${s.sleep.score}/100**

#### 🎯 Key Recommendations:
1. **Activity**: You are on track for your daily step goal. A brisk 15-minute afternoon walk will push you past the 10,000-step mark.
2. **Hydration & Recovery**: Maintain steady water intake; with ${s.caloriesBurned} kcal expended, aim for at least 2.5L of water today.
3. **Tracker Battery**: ${mainDev?.batteryLevel ? `Your ${mainDev.displayName} is at **${mainDev.batteryLevel}**.` : "Tracker synced."}

*Tip: Connect your **NVIDIA NIM** (e.g., Llama 3.3) or **Google Gemini** API key in the top-right Settings for custom LLM reasoning.*`;
  }

  return { text, toolsCalled };
}
