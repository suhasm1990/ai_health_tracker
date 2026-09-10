"use client";

import React, { useState, useEffect } from "react";
import { Smartphone, Download, X, Share, PlusSquare } from "lucide-react";

export const PwaInstallBanner: React.FC = () => {
  const [showBanner, setShowBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    // Check if dismissed before
    if (localStorage.getItem("pwa_banner_dismissed") === "true") {
      return;
    }

    // Check if already in standalone PWA mode
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;

    if (isStandalone) return;

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    // Listen for Android beforeinstallprompt
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowBanner(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    // If on iOS or mobile device, show after a gentle 3s delay
    const isMobile = isIosDevice || /android/.test(userAgent);
    if (isMobile) {
      const timer = setTimeout(() => setShowBanner(true), 3000);
      return () => {
        clearTimeout(timer);
        window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      };
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
    };
  }, []);

  const handleDismiss = () => {
    setShowBanner(false);
    localStorage.setItem("pwa_banner_dismissed", "true");
  };

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === "accepted") {
        setShowBanner(false);
      }
      setDeferredPrompt(null);
    }
  };

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-md z-40 animate-in slide-in-from-bottom duration-300">
      <div className="relative rounded-2xl bg-slate-900/95 border border-slate-700/90 shadow-2xl p-4 backdrop-blur-md text-white">
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 text-slate-400 hover:text-white p-1"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start space-x-3 pr-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shrink-0 shadow-md shadow-emerald-950/40">
            <Smartphone className="w-5 h-5 text-white" />
          </div>
          <div>
            <h4 className="text-xs font-bold tracking-tight text-white">
              Install AI Health Tracker
            </h4>
            <p className="text-[11px] text-slate-300 mt-0.5 leading-snug">
              {isIOS ? (
                <>
                  To install natively on iPhone: tap <Share className="inline w-3 h-3 mx-0.5 text-teal-400" /> in Safari and select <strong className="text-white">Add to Home Screen</strong>.
                </>
              ) : (
                "Add to your home screen for quick 1-tap access and fluid offline caching."
              )}
            </p>

            {!isIOS && deferredPrompt && (
              <button
                onClick={handleInstallClick}
                className="mt-2.5 inline-flex items-center space-x-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Install Now</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
