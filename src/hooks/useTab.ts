"use client";

import { useCallback, useSyncExternalStore } from "react";

export const TABS = ["today", "training", "health"] as const;
export type Tab = (typeof TABS)[number];

const isTab = (value: string): value is Tab => (TABS as readonly string[]).includes(value);

function subscribe(listener: () => void) {
  window.addEventListener("hashchange", listener);
  window.addEventListener("popstate", listener);
  return () => {
    window.removeEventListener("hashchange", listener);
    window.removeEventListener("popstate", listener);
  };
}

const read = (): Tab => {
  const hash = window.location.hash.slice(1);
  return isTab(hash) ? hash : "today";
};

/**
 * The open dashboard tab, kept in the URL hash so the back button, reloads and
 * shared links land on the same view. The server always renders "today".
 */
export function useTab(): [Tab, (tab: Tab) => void] {
  const tab = useSyncExternalStore(subscribe, read, () => "today" as const);
  const setTab = useCallback((next: Tab) => {
    if (next === read()) return;
    // pushState skips the jump-to-anchor scroll; notify subscribers ourselves.
    window.history.pushState(null, "", next === "today" ? window.location.pathname + window.location.search : `#${next}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);
  return [tab, setTab];
}
