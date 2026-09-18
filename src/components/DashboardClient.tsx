"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Footprints,
  Flame,
  Zap,
  Heart,
  Wind,
  Scale,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { Header } from "@/components/Header";
import { DeviceList } from "@/components/DeviceList";
import { ReadinessScore } from "@/components/ReadinessScore";
import { DailyBriefing } from "@/components/DailyBriefing";
import { HabitStreaks } from "@/components/HabitStreaks";
import { MetricCard } from "@/components/MetricCard";
import { StepChart } from "@/components/StepChart";
import { HeartRateChart } from "@/components/HeartRateChart";
import { SleepTimeline } from "@/components/SleepTimeline";
import { ApiTester } from "@/components/ApiTester";
import { ShareCardModal } from "@/components/ShareCardModal";
import { PwaInstallBanner } from "@/components/PwaInstallBanner";
import { ChatAssistant } from "@/components/ChatAssistant";
import { AuthStatus, PairedDevice, DailyMetricSummary, IntradayStepPoint, IntradayHeartRatePoint } from "@/lib/types";
import {
  MOCK_TODAY_METRICS,
  MOCK_INTRADAY_STEPS,
  MOCK_INTRADAY_HEART_RATE,
  MOCK_HISTORY_7_DAYS,
} from "@/lib/mockData";

export interface DashboardClientProps {
  initialAuthStatus: AuthStatus;
  initialDevices: PairedDevice[];
  initialMetrics: {
    today: DailyMetricSummary;
    intradaySteps: IntradayStepPoint[];
    intradayHeartRate: IntradayHeartRatePoint[];
    history7Days: DailyMetricSummary[];
  };
  hasInitialMetrics: boolean;
}

export function DashboardClient({
  initialAuthStatus,
  initialDevices,
  initialMetrics,
  hasInitialMetrics,
}: DashboardClientProps) {
  const [authStatus, setAuthStatus] = useState<AuthStatus>(initialAuthStatus);
  const [devices, setDevices] = useState<PairedDevice[]>(initialDevices);

  const [metrics, setMetrics] = useState<{
    today: DailyMetricSummary;
    intradaySteps: IntradayStepPoint[];
    intradayHeartRate: IntradayHeartRatePoint[];
    history7Days: DailyMetricSummary[];
  }>(initialMetrics);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(!hasInitialMetrics && !initialAuthStatus.isDemo);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isApiTesterOpen, setIsApiTesterOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [chatPrompt, setChatPrompt] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };



  const fetchAuthStatus = async () => {
    try {
      const res = await fetch("/api/auth/status");
      if (res.ok) {
        const data = await res.json();
        setAuthStatus(data);
      }
    } catch (err) {
      console.error("Failed to fetch auth status:", err);
    }
  };

  const fetchDevices = async (forceRefresh = false) => {
    try {
      const res = await fetch(`/api/health/devices${forceRefresh ? "?refresh=true" : ""}`);
      if (res.ok) {
        const data = await res.json();
        const incomingDevices: PairedDevice[] = data.devices || [];
        setDevices(incomingDevices);
      }
    } catch (err) {
      console.error("Failed to fetch devices:", err);
    }
  };

  const fetchMetrics = useCallback(
    async (forceRefresh = false) => {
      setIsRefreshing(true);
      try {
        const params = new URLSearchParams();
        if (forceRefresh) {
          params.set("refresh", "true");
        }

        try {
          const now = new Date();
          const clientDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
          params.set("clientDate", clientDate);
          params.set("tz", tz);
        } catch {}

        const query = params.toString() ? `?${params.toString()}` : "";
        const res = await fetch(`/api/health/metrics${query}`);
        if (res.ok) {
          const data = await res.json();
          setMetrics(data);
        }
      } catch (err) {
        console.error("Failed to fetch metrics:", err);
      } finally {
        setIsRefreshing(false);
        setIsInitialLoading(false);
      }
    },
    [authStatus.isDemo]
  );

  const handleRefreshData = async () => {
    await Promise.all([
      fetchDevices(true),
      fetchMetrics(true),
    ]);
    showToast("Refreshed latest health metrics");
  };

  useEffect(() => {
    // Revalidate devices and metrics with client date/tz
    fetchAuthStatus();
    fetchDevices();
    fetchMetrics();
  }, [fetchMetrics]);

  // Check URL query parameters for connection callback status
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("connected") === "true") {
        showToast("Connected to Google Health API successfully!");
        fetchAuthStatus();
        fetchDevices(true);
        fetchMetrics(true);
        window.history.replaceState({}, "", "/");
      } else if (params.get("error")) {
        showToast(`Authentication notice: ${params.get("error")}`);
        window.history.replaceState({}, "", "/");
      }
    }
  }, [fetchMetrics]);

  const handleToggleDemo = async () => {
    const nextMode = !authStatus.isDemo;
    try {
      await fetch("/api/auth/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle_demo", isDemo: nextMode }),
      });
      setAuthStatus((prev) => ({ ...prev, isDemo: nextMode }));
      if (nextMode) {
        setMetrics({
          today: MOCK_TODAY_METRICS,
          intradaySteps: MOCK_INTRADAY_STEPS,
          intradayHeartRate: MOCK_INTRADAY_HEART_RATE,
          history7Days: MOCK_HISTORY_7_DAYS,
        });
      }
      showToast(nextMode ? "Switched to Demo Sandbox Mode" : "Switched to Live Google Health API");
      fetchMetrics(true);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSyncDevice = async (deviceId: string) => {
    setIsSyncing(true);
    const dev = devices.find((d) => d.id === deviceId);
    try {
      await Promise.all([
        fetchDevices(true),
        fetchMetrics(true),
      ]);
      showToast(`Device ${dev?.displayName || deviceId} synced successfully.`);
    } catch (err) {
      console.error(err);
      showToast(`Device sync failed.`);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-200">
      {/* Header Bar */}
      <Header
        authStatus={authStatus}
        devices={devices}
        onToggleDemo={handleToggleDemo}
        onOpenApiTester={() => setIsApiTesterOpen(true)}
        onOpenShareCard={() => setIsShareModalOpen(true)}
        onRefreshData={handleRefreshData}
        isRefreshing={isRefreshing}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Toast Alert */}
        {toastMessage && (
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 flex items-center justify-between text-xs font-medium animate-in fade-in slide-in-from-top duration-300 shadow-lg shadow-emerald-950/10 dark:shadow-emerald-950/40">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>{toastMessage}</span>
            </div>
            <button onClick={() => setToastMessage(null)} className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
              Dismiss
            </button>
          </div>
        )}

        {/* Demo Mode Notice Banner (Only shown when explicitly in Demo Sandbox Mode) */}
        {authStatus.isDemo && (
          <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-amber-600/5 to-white dark:to-slate-900 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
            <div className="flex items-start sm:items-center space-x-3">
              <div className="p-2 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Running in Demo Sandbox Mode</h2>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  Displaying simulated metrics for sample wearable devices. Connect your Google account to fetch real-time data.
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2 self-start sm:self-auto shrink-0">
              <button
                onClick={() => (window.location.href = "/api/auth/login")}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow transition-all"
              >
                Connect Google Account
              </button>
            </div>
          </div>
        )}

        {/* Multi-Device & Data Source Management Panel */}
        <DeviceList
          devices={devices}
          onSyncDevice={handleSyncDevice}
          isSyncing={isSyncing}
          onTryDemo={handleToggleDemo}
          isDemo={authStatus.isDemo}
        />

        {/* Telemetry Architecture Pipeline Indicator */}
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-1">
          <div className="flex items-center space-x-2">
            <span className="text-slate-500 dark:text-slate-500">Telemetry Stream:</span>
            <span className="inline-flex items-center space-x-1.5 font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-md border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Unified Telemetry ({devices.length} {devices.length === 1 ? "source" : "sources"} reconciled)</span>
            </span>
          </div>
          <span className="text-slate-400 dark:text-slate-500 font-mono text-[11px]">Google Health API v4 Rest Format</span>
        </div>

        {/* Hero: Daily Readiness & Recovery Score with Concentric Rings */}
        <ReadinessScore
          today={metrics.today}
          history7Days={metrics.history7Days}
          userName={authStatus.user?.displayName}
        />

        {/* Proactive AI Daily Health Briefing */}
        <DailyBriefing
          today={metrics.today}
          history7Days={metrics.history7Days}
          userName={authStatus.user?.displayName}
          onOpenChatWithPrompt={(prompt) => setChatPrompt(prompt)}
        />

        {/* Habit Streaks & Milestone Badges */}
        <HabitStreaks
          today={metrics.today}
          history7Days={metrics.history7Days}
        />

        {/* Metric Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {/* Steps */}
          <MetricCard
            title="Daily Steps"
            value={metrics.today.steps}
            unit="steps"
            icon={Footprints}
            iconColor="text-emerald-400"
            iconBg="bg-emerald-500/10 border border-emerald-500/20"
            isLoading={isInitialLoading}
            goal={{
              current: metrics.today.steps,
              target: metrics.today.stepsGoal,
              label: "10,000 Step Goal",
            }}
            footerItems={[
              { label: "Distance", value: `${metrics.today.distanceKm} km` },
              { label: "Floors", value: `${metrics.today.floors} fl` },
            ]}
          />

          {/* Active Zone Minutes */}
          <MetricCard
            title="Active Zone"
            value={metrics.today.activeZoneMinutes}
            unit="mins"
            icon={Zap}
            iconColor="text-teal-400"
            iconBg="bg-teal-500/10 border border-teal-500/20"
            isLoading={isInitialLoading}
            goal={{
              current: metrics.today.activeZoneMinutes,
              target: metrics.today.activeZoneMinutesGoal,
              label: "Daily Target",
            }}
            footerItems={[
              { label: "Fat Burn", value: `${metrics.today.fatBurnMinutes || 0}m` },
              { label: "Cardio/Peak", value: `${metrics.today.cardioPeakMinutes || 0}m` },
            ]}
          />

          {/* Calories Burned */}
          <MetricCard
            title="Energy Burned"
            value={metrics.today.caloriesBurned}
            unit="kcal"
            icon={Flame}
            iconColor="text-amber-400"
            iconBg="bg-amber-500/10 border border-amber-500/20"
            isLoading={isInitialLoading}
            goal={{
              current: metrics.today.caloriesBurned,
              target: metrics.today.caloriesGoal,
              label: "Daily Target",
            }}
            footerItems={[
              { label: "Avg Burn Rate", value: `${Math.round(metrics.today.caloriesBurned / 24)} kcal/hr` },
              { label: "Target", value: `${metrics.today.caloriesGoal.toLocaleString()} kcal` },
            ]}
          />

          {/* Resting Heart Rate */}
          <MetricCard
            title="Resting HR"
            value={metrics.today.restingHeartRate ?? "—"}
            unit="bpm"
            icon={Heart}
            iconColor="text-rose-400"
            iconBg="bg-rose-500/10 border border-rose-500/20"
            isLoading={isInitialLoading}
            subtitle="Calculated over sleep & rest periods"
            badge={{
              text: metrics.today.restingHeartRate && metrics.today.restingHeartRate <= 60 ? "Resting Optimal" : "Normal Resting",
              type: "positive",
            }}
            footerItems={[
              {
                label: "Daily Range",
                value: metrics.today.restingHeartRate && metrics.today.maxHeartRate
                  ? `${metrics.today.restingHeartRate} - ${metrics.today.maxHeartRate} bpm`
                  : "—",
              },
              {
                label: "HRV (RMSSD)",
                value: metrics.today.heartRateVariability ? `${metrics.today.heartRateVariability} ms` : "—",
              },
            ]}
          />

          {/* SpO2 & Vitals */}
          <MetricCard
            title="Blood Oxygen"
            value={metrics.today.oxygenSaturation ?? "—"}
            unit="%"
            icon={Wind}
            iconColor="text-cyan-400"
            iconBg="bg-cyan-500/10 border border-cyan-500/20"
            isLoading={isInitialLoading}
            subtitle="Nightly blood oxygen average"
            badge={{
              text: metrics.today.oxygenSaturation && metrics.today.oxygenSaturation >= 95 ? "Normal Range" : "Recorded Range",
              type: "positive",
            }}
            footerItems={[
              {
                label: "Nightly Range",
                value: metrics.today.minOxygenSaturation && metrics.today.maxOxygenSaturation
                  ? `${metrics.today.minOxygenSaturation}% - ${metrics.today.maxOxygenSaturation}%`
                  : "—",
              },
              {
                label: "Readings",
                value: metrics.today.oxygenSaturationSamples
                  ? `${metrics.today.oxygenSaturationSamples} samples`
                  : "Continuous",
              },
            ]}
          />

          {/* Scale / Weight from Fitbit profile */}
          <MetricCard
            title="Body Weight"
            value={metrics.today.weightKg ?? "—"}
            unit="kg"
            icon={Scale}
            iconColor="text-indigo-400"
            iconBg="bg-indigo-500/10 border border-indigo-500/20"
            isLoading={isInitialLoading}
            subtitle="Recorded on Fitbit profile"
            badge={{
              text: metrics.today.bmi && metrics.today.bmi >= 18.5 && metrics.today.bmi <= 24.9 ? "Normal BMI" : "Recorded Trend",
              type: "neutral",
            }}
            footerItems={[
              {
                label: "Height",
                value: metrics.today.heightMeters ? `${(metrics.today.heightMeters * 100).toFixed(0)} cm` : "—",
              },
              {
                label: "BMI",
                value: metrics.today.bmi ? metrics.today.bmi.toFixed(1) : "—",
              },
            ]}
          />
        </div>

        {/* Intraday & Trend Visualizations */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Step Distribution & History Chart */}
          <StepChart
            intradaySteps={metrics.intradaySteps}
            history={metrics.history7Days}
            stepGoal={metrics.today.stepsGoal}
          />

          {/* Heart Rate 24h Area Chart & 7-Day Trend */}
          <HeartRateChart
            intradayHeartRate={metrics.intradayHeartRate}
            history={metrics.history7Days}
            restingHeartRate={metrics.today.restingHeartRate}
            avgHeartRate={metrics.today.avgHeartRate}
            maxHeartRate={metrics.today.maxHeartRate}
          />
        </div>

        {/* Sleep Breakdown Section */}
        <SleepTimeline
          durationMinutes={metrics.today.sleepDurationMinutes}
          sleepScore={metrics.today.sleepScore}
          sleepEfficiency={metrics.today.sleepEfficiency}
          sleepStages={metrics.today.sleepStages}
          history={metrics.history7Days}
        />
      </main>

      {/* Footer & Legal Notices */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 mt-12 py-8 transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
            <div className="flex flex-col sm:flex-row sm:items-center space-y-1 sm:space-y-0 sm:space-x-2">
              <span className="font-semibold text-slate-700 dark:text-slate-300">AI Health Tracker</span>
              <span className="hidden sm:inline">•</span>
              <span>Powered by Google Health API (v4)</span>
              <span className="hidden sm:inline">•</span>
              <span>Fitbit & Apple Health Compatible</span>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setIsApiTesterOpen(true)}
                className="hover:text-slate-900 dark:hover:text-slate-300 transition-colors"
              >
                API Explorer
              </button>
            </div>
          </div>

          {/* Legal, Medical, and Trademark Disclaimers */}
          <div className="pt-3 border-t border-slate-200/60 dark:border-slate-800/60 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500 space-y-1.5">
            <p>
              <strong className="text-slate-500 dark:text-slate-400">Medical Disclaimer:</strong> AI Health Tracker is designed strictly for general fitness and wellness tracking and is not a regulated medical device. It is not intended to diagnose, treat, mitigate, cure, or prevent any medical condition or disease. Always seek the advice of a qualified healthcare provider with any medical questions.
            </p>
            <p>
              <strong className="text-slate-500 dark:text-slate-400">Trademark & Attribution:</strong> Google, Google Health, and Fitbit are trademarks of Google LLC. Apple and Apple Health are trademarks of Apple Inc. AI Health Tracker is an independently developed application and is not sponsored, endorsed, or certified by Google LLC or Apple Inc. Use of the Google Health API adheres to the Google API Services User Data Policy, including Limited Use requirements.
            </p>
          </div>
        </div>
      </footer>

      {/* Modals & Drawers */}
      <ApiTester
        isOpen={isApiTesterOpen}
        onClose={() => setIsApiTesterOpen(false)}
      />

      <ShareCardModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        today={metrics.today}
        userName={authStatus.user?.displayName}
      />

      <ChatAssistant
        externalPrompt={chatPrompt}
        onClearExternalPrompt={() => setChatPrompt(null)}
      />

      {/* PWA Mobile Install Prompt */}
      <PwaInstallBanner />
    </div>
  );
}
