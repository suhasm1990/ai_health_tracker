"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AuthStatus, HealthMetricsPayload, PairedDevice } from "@/lib/types";
import { emptyDay, todayIso } from "@/lib/utils";

export interface DashboardInitial {
  authStatus: AuthStatus;
  devices: PairedDevice[];
  /** null when the server could not render metrics (live mode needs the client's date and timezone). */
  metrics: HealthMetricsPayload | null;
}

const TOAST_MS = 4000;

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

function metricsUrl(force: boolean): string {
  const params = new URLSearchParams({ clientDate: todayIso() });
  if (force) params.set("refresh", "true");
  try {
    params.set("tz", Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    /* timezone unavailable; the server falls back to its own clock */
  }
  return `/api/health/metrics?${params}`;
}

const emptyPayload = (): HealthMetricsPayload => ({
  today: emptyDay(todayIso(), "Today"),
  intradaySteps: [],
  intradayHeartRate: [],
  history7Days: [],
  freshness: { syncedToday: false, fallbackDate: null },
});

/** Owns dashboard state and all client-side data loading. */
export function useDashboardData(initial: DashboardInitial) {
  const [authStatus, setAuthStatus] = useState(initial.authStatus);
  const [devices, setDevices] = useState(initial.devices);
  const [metrics, setMetrics] = useState(initial.metrics);
  const [isRefreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const showToast = useCallback((message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const loadMetrics = useCallback(async (force = false) => {
    try {
      setMetrics(await getJson<HealthMetricsPayload>(metricsUrl(force)));
    } catch (err) {
      setMetrics((prev) => prev ?? emptyPayload()); // never leave the dashboard in a skeleton state
      throw err;
    }
  }, []);

  const loadDevices = useCallback(async (force = false) => {
    const data = await getJson<{ devices: PairedDevice[] }>(`/api/health/devices${force ? "?refresh=true" : ""}`);
    setDevices(data.devices ?? []);
  }, []);

  /** Runs a data task with the shared refreshing flag and surfaces failures as a toast. */
  const run = useCallback(
    async (task: () => Promise<unknown>, successMessage?: string) => {
      setRefreshing(true);
      try {
        await task();
        if (successMessage) showToast(successMessage);
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Could not refresh health data");
      } finally {
        setRefreshing(false);
      }
    },
    [showToast]
  );

  const refreshAll = useCallback(
    (successMessage = "Refreshed latest health metrics") => run(() => Promise.all([loadDevices(true), loadMetrics(true)]), successMessage),
    [run, loadDevices, loadMetrics]
  );

  const toggleDemo = useCallback(async () => {
    const isDemo = !authStatus.isDemo;
    await run(async () => {
      await getJson("/api/auth/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle_demo", isDemo }),
      });
      setAuthStatus((prev) => ({ ...prev, isDemo }));
      await Promise.all([loadDevices(true), loadMetrics(true)]);
    }, isDemo ? "Switched to Demo Sandbox Mode" : "Switched to Live Google Health API");
  }, [authStatus.isDemo, run, loadDevices, loadMetrics]);

  // Mount: consume OAuth redirect flags and fetch metrics only when the server did not provide them.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected") === "true";
    const error = params.get("error");
    if (connected || error) window.history.replaceState({}, "", "/");
    if (connected) showToast("Connected to Google Health API successfully!");
    if (error) showToast(`Authentication notice: ${error}`);
    if (!initial.metrics) void run(() => loadMetrics());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally runs once on mount
  }, []);

  return {
    authStatus,
    devices,
    metrics: metrics ?? emptyPayload(),
    isInitialLoading: metrics === null,
    isRefreshing,
    toast,
    dismissToast: () => setToast(null),
    refreshAll,
    toggleDemo,
  };
}
