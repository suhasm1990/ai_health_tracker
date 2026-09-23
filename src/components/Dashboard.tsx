"use client";

import { CheckCircle2, CloudOff, Flame, Footprints, Heart, Scale, Sparkles, Wind, Zap } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import { ChatAssistant } from "@/components/ChatAssistant";
import { DailyBriefing } from "@/components/DailyBriefing";
import { DeviceList } from "@/components/DeviceList";
import { Footer } from "@/components/Footer";
import { HabitStreaks } from "@/components/HabitStreaks";
import { Header } from "@/components/Header";
import { HeartRateChart } from "@/components/HeartRateChart";
import { MetricCard, type MetricCardProps } from "@/components/MetricCard";
import { PwaInstallBanner } from "@/components/PwaInstallBanner";
import { ReadinessScore } from "@/components/ReadinessScore";
import { SleepTimeline } from "@/components/SleepTimeline";
import { StepChart } from "@/components/StepChart";
import { useDashboardData, type DashboardInitial } from "@/hooks/useDashboardData";
import type { DailyMetricSummary, DataFreshness } from "@/lib/types";
import { formatShortDate, withUnit } from "@/lib/utils";

// Modals load on first open, keeping them out of the initial bundle.
const ApiTester = dynamic(() => import("@/components/ApiTester").then((m) => m.ApiTester), { ssr: false });
const ShareCardModal = dynamic(() => import("@/components/ShareCardModal").then((m) => m.ShareCardModal), { ssr: false });

interface DashboardProps {
  initialAuthStatus: DashboardInitial["authStatus"];
  initialDevices: DashboardInitial["devices"];
  initialMetrics: DashboardInitial["metrics"];
}

const metricCards = (t: DailyMetricSummary, readingsFrom: string | null): MetricCardProps[] => [
  {
    title: "Daily Steps",
    value: t.steps,
    unit: "steps",
    icon: Footprints,
    accent: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    goal: { current: t.steps, target: t.stepsGoal, label: `${t.stepsGoal.toLocaleString()} Step Goal` },
    footerItems: [
      { label: "Distance", value: `${t.distanceKm} km` },
      { label: "Floors", value: `${t.floors} fl` },
    ],
  },
  {
    title: "Active Zone",
    value: t.activeZoneMinutes,
    unit: "mins",
    icon: Zap,
    accent: "text-teal-400 bg-teal-500/10 border-teal-500/20",
    goal: { current: t.activeZoneMinutes, target: t.activeZoneMinutesGoal, label: "Daily Target" },
    footerItems: [
      { label: "Fat Burn", value: `${t.fatBurnMinutes}m` },
      { label: "Cardio/Peak", value: `${t.cardioPeakMinutes}m` },
    ],
  },
  {
    title: "Energy Burned",
    value: t.caloriesBurned,
    unit: "kcal",
    icon: Flame,
    accent: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    goal: { current: t.caloriesBurned, target: t.caloriesGoal, label: "Daily Target" },
    footerItems: [
      { label: "Avg Burn Rate", value: `${Math.round(t.caloriesBurned / 24)} kcal/hr` },
      { label: "Target", value: `${t.caloriesGoal.toLocaleString()} kcal` },
    ],
  },
  {
    title: "Resting HR",
    value: t.restingHeartRate ?? "—",
    unit: "bpm",
    icon: Heart,
    accent: "text-rose-400 bg-rose-500/10 border-rose-500/20",
    subtitle: readingsFrom ? `Latest reading from ${readingsFrom}` : "Calculated over sleep & rest periods",
    badge: { text: t.restingHeartRate && t.restingHeartRate <= 60 ? "Resting Optimal" : "Normal Resting", type: "positive" },
    footerItems: [
      { label: "Daily Range", value: t.restingHeartRate && t.maxHeartRate ? `${t.restingHeartRate} - ${t.maxHeartRate} bpm` : "—" },
      { label: "HRV (RMSSD)", value: withUnit(t.heartRateVariability, "ms") },
    ],
  },
  {
    title: "Blood Oxygen",
    value: t.oxygenSaturation ?? "—",
    unit: "%",
    icon: Wind,
    accent: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
    subtitle: "Nightly blood oxygen average",
    badge: { text: t.oxygenSaturation && t.oxygenSaturation >= 95 ? "Normal Range" : "Recorded Range", type: "positive" },
    footerItems: [
      { label: "Nightly Range", value: t.minOxygenSaturation && t.maxOxygenSaturation ? `${t.minOxygenSaturation}% - ${t.maxOxygenSaturation}%` : "—" },
      { label: "Readings", value: t.oxygenSaturationSamples ? `${t.oxygenSaturationSamples} samples` : "Continuous" },
    ],
  },
  {
    title: "Body Weight",
    value: t.weightKg ?? "—",
    unit: "kg",
    icon: Scale,
    accent: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
    subtitle: "Recorded on Fitbit profile",
    badge: { text: t.bmi && t.bmi >= 18.5 && t.bmi <= 24.9 ? "Normal BMI" : "Recorded Trend", type: "neutral" },
    footerItems: [
      { label: "Height", value: t.heightMeters ? `${Math.round(t.heightMeters * 100)} cm` : "—" },
      { label: "BMI", value: t.bmi ? t.bmi.toFixed(1) : "—" },
    ],
  },
];

function StaleDataNotice({ freshness, readingsFrom, onRefresh }: { freshness: DataFreshness; readingsFrom: string | null; onRefresh: () => void }) {
  return (
    <div role="status" className="p-3.5 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-900 dark:text-sky-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
      <div className="flex items-start space-x-2">
        <CloudOff className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
        <span>
          <strong className="font-semibold">No sync yet today.</strong> Activity totals start at zero
          {freshness.fallbackDate ? ` and readings below are from ${readingsFrom}` : ""}. Sync your device, then refresh.
        </span>
      </div>
      <button onClick={onRefresh} className="self-start sm:self-auto shrink-0 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold transition-colors">
        Refresh now
      </button>
    </div>
  );
}

export function Dashboard({ initialAuthStatus, initialDevices, initialMetrics }: DashboardProps) {
  const { authStatus, devices, metrics, isInitialLoading, isRefreshing, toast, dismissToast, refreshAll, toggleDemo } = useDashboardData({
    authStatus: initialAuthStatus,
    devices: initialDevices,
    metrics: initialMetrics,
  });
  const [apiTesterOpen, setApiTesterOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [chatPrompt, setChatPrompt] = useState<string | null>(null);
  const clearChatPrompt = useCallback(() => setChatPrompt(null), []);

  const { today, history7Days, freshness } = metrics;
  const userName = authStatus.user?.displayName;
  const readingsFrom = freshness.fallbackDate ? formatShortDate(freshness.fallbackDate) : null;
  const showStaleNotice = !authStatus.isDemo && !isInitialLoading && !freshness.syncedToday;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-200">
      <Header
        authStatus={authStatus}
        devices={devices}
        isRefreshing={isRefreshing}
        onToggleDemo={toggleDemo}
        onRefresh={() => refreshAll()}
        onOpenApiTester={() => setApiTesterOpen(true)}
        onOpenShareCard={() => setShareOpen(true)}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {toast && (
          <div role="status" className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 flex items-center justify-between text-xs font-medium animate-in fade-in slide-in-from-top duration-300 shadow-lg shadow-emerald-950/10 dark:shadow-emerald-950/40">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>{toast}</span>
            </div>
            <button onClick={dismissToast} className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
              Dismiss
            </button>
          </div>
        )}

        {authStatus.isDemo && (
          <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-amber-600/5 to-white dark:to-slate-900 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
            <div className="flex items-start sm:items-center space-x-3">
              <div className="p-2 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Running in Demo Sandbox Mode</h2>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">Displaying simulated metrics for sample wearable devices. Connect your Google account to fetch real-time data.</p>
              </div>
            </div>
            <a href="/api/auth/login" className="self-start sm:self-auto shrink-0 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow transition-all">
              Connect Google Account
            </a>
          </div>
        )}

        <DeviceList devices={devices} onSync={() => refreshAll("Devices synced and metrics refreshed.")} isSyncing={isRefreshing} isDemo={authStatus.isDemo} onTryDemo={toggleDemo} />

        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-1">
          <div className="flex items-center space-x-2">
            <span>Telemetry Stream:</span>
            <span className="inline-flex items-center space-x-1.5 font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-md border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>
                Unified Telemetry ({devices.length} {devices.length === 1 ? "source" : "sources"} reconciled)
              </span>
            </span>
          </div>
          <span className="text-slate-400 dark:text-slate-500 font-mono text-[11px]">Google Health API {authStatus.apiVersion} REST</span>
        </div>

        {showStaleNotice && <StaleDataNotice freshness={freshness} readingsFrom={readingsFrom} onRefresh={() => refreshAll()} />}

        <ReadinessScore today={today} history7Days={history7Days} />
        <DailyBriefing today={today} history7Days={history7Days} userName={userName} onOpenChatWithPrompt={setChatPrompt} />
        <HabitStreaks today={today} history7Days={history7Days} />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {metricCards(today, readingsFrom).map((card) => (
            <MetricCard key={card.title} {...card} isLoading={isInitialLoading} />
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <StepChart intradaySteps={metrics.intradaySteps} history={history7Days} stepGoal={today.stepsGoal} />
          <HeartRateChart intradayHeartRate={metrics.intradayHeartRate} history={history7Days} today={today} />
        </div>

        <SleepTimeline today={today} history={history7Days} />
      </main>

      <Footer apiVersion={authStatus.apiVersion} onOpenApiTester={() => setApiTesterOpen(true)} />

      {apiTesterOpen && <ApiTester onClose={() => setApiTesterOpen(false)} apiVersion={authStatus.apiVersion} />}
      {shareOpen && <ShareCardModal onClose={() => setShareOpen(false)} today={today} userName={userName} />}
      <ChatAssistant externalPrompt={chatPrompt} onExternalPromptConsumed={clearChatPrompt} llm={authStatus.llm} />
      <PwaInstallBanner />
    </div>
  );
}
