"use client";

import { Download, Share, Smartphone, X } from "lucide-react";
import { useEffect, useState } from "react";
import { PWA_DISMISS_KEY } from "@/lib/constants";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (window.navigator as { standalone?: boolean }).standalone === true;

/** Mobile-only install nudge: native prompt on Android, Safari instructions on iOS. */
export function PwaInstallBanner() {
  const [visible, setVisible] = useState(false);
  const [isIOS] = useState(() => typeof navigator !== "undefined" && /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase()));
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem(PWA_DISMISS_KEY) === "true") return;
    } catch {
      return;
    }
    if (isStandalone()) return;

    const isMobile = isIOS || /android/.test(navigator.userAgent.toLowerCase());

    const onInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    const timer = isMobile ? setTimeout(() => setVisible(true), 3000) : undefined;
    return () => {
      clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
    };
  }, [isIOS]);

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(PWA_DISMISS_KEY, "true");
    } catch {
      /* ignore */
    }
  };

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    if ((await installEvent.userChoice).outcome === "accepted") setVisible(false);
    setInstallEvent(null);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-md z-40 animate-in slide-in-from-bottom duration-300">
      <div className="relative rounded-2xl bg-slate-900/95 border border-slate-700/90 shadow-2xl p-4 backdrop-blur-md text-white">
        <button onClick={dismiss} aria-label="Dismiss" className="absolute top-3 right-3 text-slate-400 hover:text-white p-1">
          <X className="w-4 h-4" />
        </button>
        <div className="flex items-start space-x-3 pr-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shrink-0 shadow-md shadow-emerald-950/40">
            <Smartphone className="w-5 h-5 text-white" />
          </div>
          <div>
            <h4 className="text-xs font-bold tracking-tight">Install AI Health Tracker</h4>
            <p className="text-[11px] text-slate-300 mt-0.5 leading-snug">
              {isIOS ? (
                <>
                  To install on iPhone: tap <Share className="inline w-3 h-3 mx-0.5 text-teal-400" /> in Safari and select{" "}
                  <strong className="text-white">Add to Home Screen</strong>.
                </>
              ) : (
                "Add to your home screen for quick 1-tap access."
              )}
            </p>
            {!isIOS && installEvent && (
              <button onClick={install} className="mt-2.5 inline-flex items-center space-x-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs font-semibold shadow transition-all">
                <Download className="w-3.5 h-3.5" />
                <span>Install Now</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
