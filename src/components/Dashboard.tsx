"use client";

import { CheckCircle2, CloudOff, Flame, Footprints, Heart, Scale, Sparkles, Wind, Zap } from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useRef, useState } from "react";
import { JournalCard, MemoryCard } from "@/components/coach/JournalCard";
import { TodayPlan } from "@/components/coach/TodayPlan";
import { SleepHabitsPanel } from "@/components/health/SleepHabitsPanel";
import { VitalsPanel } from "@/components/health/VitalsPanel";
import { ScoreRow } from "@/components/today/ScoreRow";
import { LoadPanel } from "@/components/training/LoadPanel";
import { BottomTabBar, TopTabs } from "@/components/shell/AppNav";
import { ChatAssistant, type ChatAssistantHandle } from "@/components/ChatAssistant";
import { DailyBriefing } from "@/components/DailyBriefing";
import { DeviceList } from "@/components/DeviceList";
import { Footer } from "@/components/Footer";
import { GoalsPanel } from "@/components/GoalsPanel";
import { HabitStreaks } from "@/components/HabitStreaks";
import { Header } from "@/components/Header";
import { HeartRateChart } from "@/components/HeartRateChart";
import { MetricCard, type MetricCardProps } from "@/components/MetricCard";
import { PwaInstallBanner } from "@/components/PwaInstallBanner";
import { ReadinessScore } from "@/components/ReadinessScore";
import { SleepTimeline } from "@/components/SleepTimeline";
import { StepChart } from "@/components/StepChart";
import { TodayActivity } from "@/components/TodayActivity";
import { WellnessSignals } from "@/components/WellnessSignals";
import { useDashboardData, type DashboardInitial } from "@/hooks/useDashboardData";
import { useGoals } from "@/hooks/useGoals";
import { useJournal } from "@/hooks/useJournal";
import { useDayPlan } from "@/hooks/useDayPlan";
import { useSkipToday } from "@/hooks/useSkipToday";
import { useTab } from "@/hooks/useTab";
import type { DailyMetricSummary, DataFreshness } from "@/lib/types";
import { formatShortDate, shiftIso, withUnit } from "@/lib/utils";

// Modals load on first open, keeping them out of the initial bundle.
const ApiTester = dynamic(() => import("@/components/ApiTester").then((m) => m.ApiTester), { ssr: false });
const ShareCardModal = dynamic(() => import("@/components/ShareCardModal").then((m) => m.ShareCardModal), { ssr: false });

interface DashboardProps {
  initialAuthStatus: DashboardInitial["authStatus"];
  initialDevices: DashboardInitial["devices"];
  initialMetrics: DashboardInitial["metrics"];
  initialNotice: string | null;
}

const metricCards = (t: DailyMetricSummary, readingsFrom: string | null): MetricCardProps[] => [
  {
    title: "Daily Steps",
    value: t.steps,
    unit: "steps",
    icon: Footprints,
    accent: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    goal: { current: t.steps, target: t.stepsGoal, label: "Step Goal" },
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
      { label: "Daily Range", value: t.restingHeartRate && t.maxHeartRate ? `${t.restingHeartRate}–${t.maxHeartRate} bpm` : "—" },
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
      { label: "Nightly Range", value: t.minOxygenSaturation && t.maxOxygenSaturation ? `${t.minOxygenSaturation}–${t.maxOxygenSaturation}%` : "—" },
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

export function Dashboard({ initialAuthStatus, initialDevices, initialMetrics, initialNotice }: DashboardProps) {
  const { authStatus, devices, metrics, isInitialLoading, isRefreshing, toast, dismissToast, refreshAll, toggleDemo } = useDashboardData({
    authStatus: initialAuthStatus,
    devices: initialDevices,
    metrics: initialMetrics,
    notice: initialNotice,
  });
  const [apiTesterOpen, setApiTesterOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [tab, setTab] = useTab();
  const chat = useRef<ChatAssistantHandle>(null);
  const scope = `${authStatus.isDemo}:${authStatus.user?.email ?? ""}`;
  const goals = useGoals(scope);
  const journal = useJournal(scope);
  const ask = (text: string) => chat.current?.ask(text);
  const refresh = (message?: string) => {
    void goals.refresh();
    void journal.refresh();
    return refreshAll(message);
  };

  const { today, history7Days, baseline, freshness } = metrics;
  const userName = authStatus.user?.displayName;
  const readingsFrom = freshness.fallbackDate ? formatShortDate(freshness.fallbackDate) : null;
  const showStaleNotice = !authStatus.isDemo && !isInitialLoading && !freshness.syncedToday;

  const loggedYesterday = useMemo(() => {
    const yesterday = journal.data ? shiftIso(journal.data.today, -1) : null;
    return journal.data?.recent.filter((e) => e.date === yesterday).map((e) => e.habit);
  }, [journal.data]);
  const skip = useSkipToday({ date: goals.data?.today ?? today.date, goals: goals.data?.goals, saveProgramSkip: goals.setSkipped });
  const { plan, hour } = useDayPlan({ today, history: history7Days, baseline, signals: metrics.signals, goals: goals.data?.goals, todayWorkouts: metrics.todayWorkouts, loggedYesterday, skippedToday: skip.skippedToday });
  const tabProps = { tab, onChange: setTab };
  const staleNotice = showStaleNotice && <StaleDataNotice freshness={freshness} readingsFrom={readingsFrom} onRefresh={() => refresh()} />;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-200">
      <Header
        authStatus={authStatus}
        devices={devices}
        isRefreshing={isRefreshing}
        onToggleDemo={toggleDemo}
        onRefresh={() => refresh()}
        onOpenApiTester={() => setApiTesterOpen(true)}
        onOpenShareCard={() => setShareOpen(true)}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-2 space-y-4 sm:space-y-6">
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
          <div className="px-3 py-2.5 sm:px-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0 text-xs sm:text-sm">
              <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <p className="text-slate-700 dark:text-slate-200 truncate">
                <span className="font-semibold">Demo mode</span>
                <span className="hidden sm:inline text-slate-500 dark:text-slate-400"> · sample data from three wearables. Connect Google for your own.</span>
              </p>
            </div>
            <a href="/api/auth/login" className="shrink-0 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors">
              Connect
            </a>
          </div>
        )}

        <TopTabs {...tabProps} />
        {staleNotice}

        {tab === "today" && (
          <div key="today" className="space-y-4 sm:space-y-6 animate-in fade-in duration-300">
            <TodayPlan plan={plan} hour={hour} userName={userName} isLoading={isInitialLoading} onAsk={ask} onSkip={skip.setSkipped} skipPending={skip.pending} skipError={skip.error} />
            <ScoreRow plan={plan} today={today} isLoading={isInitialLoading} onOpen={setTab} />
            <WellnessSignals signals={metrics.signals} onAsk={ask} />
            <div className="grid gap-4 sm:gap-6 lg:grid-cols-[1.5fr_1fr]">
              <JournalCard data={journal.data} error={journal.error} onToggle={journal.toggle} />
              <MemoryCard memories={journal.data?.memories ?? []} persistent={journal.data?.persistent ?? false} onForget={journal.forget} onTell={() => chat.current?.draft("Remember that ")} />
            </div>
            <div id="readiness" className="scroll-mt-20">
              <ReadinessScore today={today} history7Days={history7Days} baseline={baseline} />
            </div>
            <DailyBriefing today={today} history7Days={history7Days} baseline={baseline} userName={userName} onOpenChatWithPrompt={ask} />
          </div>
        )}

        {tab === "training" && (
          <div key="training" className="space-y-4 sm:space-y-6 animate-in fade-in duration-300">
            <LoadPanel plan={plan} history={history7Days} baseline={baseline} onAsk={ask} />
            <GoalsPanel data={goals.data} error={goals.error} onAsk={ask} onOpenChat={() => chat.current?.open()} onRemove={goals.archive} />
            <TodayActivity workouts={metrics.todayWorkouts} today={today} />
            <HabitStreaks today={today} history7Days={history7Days} />
            <StepChart intradaySteps={metrics.intradaySteps} history={history7Days} stepGoal={today.stepsGoal} />
          </div>
        )}

        {tab === "health" && (
          <div key="health" className="space-y-4 sm:space-y-6 animate-in fade-in duration-300">
            <VitalsPanel today={today} history={history7Days} baseline={baseline} onAsk={ask} />
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
              {metricCards(today, readingsFrom).map((card) => (
                <MetricCard key={card.title} {...card} isLoading={isInitialLoading} />
              ))}
            </div>
            <SleepTimeline today={today} history={history7Days} />
            <SleepHabitsPanel history={history7Days} />
            <HeartRateChart intradayHeartRate={metrics.intradayHeartRate} history={history7Days} today={today} />
            <DeviceList devices={devices} onSync={() => refresh("Devices synced and metrics refreshed.")} isSyncing={isRefreshing} isDemo={authStatus.isDemo} onTryDemo={toggleDemo} />
          </div>
        )}
      </main>

      <Footer apiVersion={authStatus.apiVersion} onOpenApiTester={() => setApiTesterOpen(true)} />

      {apiTesterOpen && <ApiTester onClose={() => setApiTesterOpen(false)} apiVersion={authStatus.apiVersion} />}
      {shareOpen && <ShareCardModal onClose={() => setShareOpen(false)} today={today} userName={userName} />}
      <ChatAssistant
        key={scope}
        ref={chat}
        llm={authStatus.llm}
        suggestions={goals.data?.suggestions}
        onGoalsChanged={goals.refresh}
        onJournalChanged={journal.refresh}
        storageKey={`aht-chat:${scope}`}
      />
      <BottomTabBar {...tabProps} onOpenCoach={() => chat.current?.open()} />
      <PwaInstallBanner />
    </div>
  );
}
