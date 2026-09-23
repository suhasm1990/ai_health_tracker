"use client";

import { useTheme } from "@/lib/theme";

/** Recharts needs literal colours; derive them from the active theme. */
export function useChartTheme() {
  const isDark = useTheme().resolvedTheme === "dark";
  return { isDark, grid: isDark ? "#1E293B" : "#E2E8F0", axis: isDark ? "#64748B" : "#94A3B8" };
}
