"use client";

import { useSyncExternalStore } from "react";

const subscribe = (listener: () => void) => {
  // Re-read every minute so greetings and late-evening advice roll over on their own.
  const timer = setInterval(listener, 60_000);
  return () => clearInterval(timer);
};

/** Local hour on the client; null during server rendering so markup matches on hydration. */
export const useClientHour = () => useSyncExternalStore(subscribe, () => new Date().getHours(), () => null);
