"use client";

import { createContext, useCallback, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { THEME_STORAGE_KEY } from "./constants";

export type Theme = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const DARK_QUERY = "(prefers-color-scheme: dark)";

/* ---- tiny external store: localStorage preference + OS colour scheme ---- */

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener("change", listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", listener);
    window.removeEventListener("storage", listener);
  };
}

function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

const resolve = (theme: Theme): ResolvedTheme =>
  theme === "system" ? (window.matchMedia(DARK_QUERY).matches ? "dark" : "light") : theme;

const readResolved = () => resolve(readTheme());

function writeTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* storage unavailable (private mode): the choice still applies until reload */
  }
  listeners.forEach((listener) => listener());
}

/**
 * The inline script in the root layout applies the `dark` class before paint;
 * this provider keeps it in sync with the user's choice and OS changes afterwards.
 * Server snapshots ("system" / "dark") keep hydration consistent.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "system" as const);
  const resolvedTheme = useSyncExternalStore(subscribe, readResolved, () => "dark" as const);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
  }, [resolvedTheme]);

  const setTheme = useCallback((next: Theme) => writeTheme(next), []);

  return <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within a ThemeProvider");
  return context;
}
