"use client";

import { useCallback, useEffect, useState } from "react";
import type { AuthStatus, HealthMetricsPayload, PairedDevice } from "@/lib/types";
import { emptyDay, todayIso } from "@/lib/utils";

export interface DashboardInitial {
  authStatus: AuthStatus;
  devices: PairedDevice[];
  /** null when the server could not render metrics (live mode needs the client's date and timezone). */
  metrics: HealthMetricsPayload | null;
  /** A one-time message decided on the server, e.g. the OAuth redirect result. */
  notice?: string | null;
}

const TOAST_MS = 4000;

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

/** Fetches metrics for the user's local date and timezone. */
function fetchMetrics(force: boolean): Promise<HealthMetricsPayload> {
  const params = new URLSearchParams({ clientDate: todayIso() });
  if (force) params.set("refresh", "true");
  try {
    params.set("tz", Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    /* timezone unavailable; the server falls back to its own clock */
  }
  return getJson<HealthMetricsPayload>(`/api/health/metrics?${params}`);
}

const emptyPayload = (): HealthMetricsPayload => ({
  today: emptyDay(todayIso(), "Today"),
  intradaySteps: [],
  intradayHeartRate: [],
  history7Days: [],
  freshness: { syncedToday: false, fallbackDate: null },
});

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : "Could not refresh health data");

/** Owns dashboard state and all client-side data loading. */
export function useDashboardData(initial: DashboardInitial) {
  const [authStatus, setAuthStatus] = useState(initial.authStatus);
  const [devices, setDevices] = useState(initial.devices);
  const [metrics, setMetrics] = useState(initial.metrics);
  const [isRefreshing, setRefreshing] = useState(initial.metrics === null);
  const [toast, setToast] = useState<string | null>(initial.notice ?? null);

  // Every toast dismisses itself.
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const loadMetrics = useCallback(
    (force = false) =>
      fetchMetrics(force).then(setMetrics, (err: unknown) => {
        setMetrics((prev) => prev ?? emptyPayload()); // never leave the dashboard in a skeleton state
        throw err;
      }),
    []
  );

  const loadDevices = useCallback(async (force = false) => {
    const data = await getJson<{ devices: PairedDevice[] }>(`/api/health/devices${force ? "?refresh=true" : ""}`);
    setDevices(data.devices ?? []);
  }, []);

  /** Runs a data task with the shared refreshing flag and surfaces failures as a toast. */
  const run = useCallback(async (task: () => Promise<unknown>, successMessage?: string) => {
    setRefreshing(true);
    try {
      await task();
      if (successMessage) setToast(successMessage);
    } catch (err) {
      setToast(errorMessage(err));
    } finally {
      setRefreshing(false);
    }
  }, []);

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

  // Mount: drop OAuth redirect flags from the URL and load metrics when the server did not provide them.
  useEffect(() => {
    if (window.location.search) window.history.replaceState({}, "", "/");
    if (initial.metrics) return;
    fetchMetrics(false)
      .then(setMetrics, (err: unknown) => {
        setMetrics(emptyPayload());
        setToast(errorMessage(err));
      })
      .finally(() => setRefreshing(false));
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
