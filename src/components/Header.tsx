"use client";

import { Activity, Code2, LogIn, LogOut, Menu, Radio, RefreshCw, Share2, X } from "lucide-react";
import { useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Avatar } from "@/components/ui/Avatar";
import type { AuthStatus, PairedDevice } from "@/lib/types";

interface HeaderProps {
  authStatus: AuthStatus;
  devices: PairedDevice[];
  isRefreshing: boolean;
  onToggleDemo: () => void;
  onRefresh: () => void;
  onOpenApiTester: () => void;
  onOpenShareCard: () => void;
}

const LOGIN_URL = "/api/auth/login";

/** Clears the session cookie, then reloads so the server re-renders in demo mode. */
async function logout() {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } finally {
    window.location.reload();
  }
}

const SECONDARY_BTN =
  "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800/60 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700/50 transition-colors";
const PRIMARY_BTN = "bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow transition-all";

function DemoToggle({ isDemo, onClick, className = "" }: { isDemo: boolean; onClick: () => void; className?: string }) {
  return (
    <button
      onClick={onClick}
      title="Toggle between Demo Sandbox and Live Google Health API"
      className={`flex items-center space-x-1.5 text-xs font-medium border transition-colors ${
        isDemo
          ? "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20"
          : "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20"
      } ${className}`}
    >
      <Radio className={`w-3.5 h-3.5 ${isDemo ? "text-amber-500 dark:text-amber-400" : "text-emerald-500 dark:text-emerald-400 animate-pulse"}`} />
      <span className="truncate">{isDemo ? "Demo Sandbox" : "Live Health API"}</span>
    </button>
  );
}

export function Header({ authStatus, devices, isRefreshing, onToggleDemo, onRefresh, onOpenApiTester, onOpenShareCard }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const showDemoToggle = authStatus.isDemo || devices.length === 0;
  const { user } = authStatus;
  const closeMenuThen = (fn: () => void) => () => {
    fn();
    setMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4">
        {/* Brand */}
        <div className="flex items-center space-x-2.5 sm:space-x-3 shrink-0">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-md shadow-emerald-900/20 dark:shadow-emerald-900/30">
            <Activity className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-base sm:text-lg tracking-tight text-slate-900 dark:text-white whitespace-nowrap leading-tight">AI Health Tracker</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block whitespace-nowrap">Powered by Google Health API</p>
          </div>
        </div>

        {/* Source badges (large screens) */}
        {devices.length > 0 && (
          <div className="hidden lg:flex items-center space-x-2.5 bg-slate-100/90 dark:bg-slate-800/70 rounded-xl px-3 py-1.5 border border-slate-200 dark:border-slate-700/60 shadow-2xs">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Sources:</span>
            <div className="flex items-center space-x-1.5">
              {devices.map((device) => (
                <span
                  key={device.id}
                  title={`${device.displayName} (${device.model})`}
                  className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-md bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-200 shadow-2xs"
                >
                  <span className="truncate max-w-[130px]">{device.displayName}</span>
                  {device.batteryLevel !== undefined && (
                    <span className={`text-[10px] font-mono font-semibold ${device.batteryLevel <= 25 ? "text-amber-500 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                      {device.batteryLevel}%
                    </span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Desktop controls */}
        <div className="hidden md:flex items-center space-x-2.5">
          <ThemeToggle />
          <button onClick={onRefresh} disabled={isRefreshing} title="Refresh Metrics" aria-label="Refresh metrics" className={`p-2 ${SECONDARY_BTN}`}>
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin text-emerald-500 dark:text-emerald-400" : ""}`} />
          </button>
          {showDemoToggle && <DemoToggle isDemo={authStatus.isDemo} onClick={onToggleDemo} className="px-2.5 py-1.5 rounded-lg" />}
          <button
            onClick={onOpenShareCard}
            title="Share Daily Health Snapshot with Family & Friends"
            className="flex items-center space-x-1.5 px-2.5 py-1.5 text-slate-700 dark:text-slate-200 hover:text-white bg-slate-100 dark:bg-slate-800/80 hover:bg-emerald-600 dark:hover:bg-emerald-600 rounded-lg border border-slate-200 dark:border-slate-700/60 transition-all text-xs font-semibold shadow-xs group"
          >
            <Share2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 group-hover:text-white" />
            <span>Share</span>
          </button>
          <button onClick={onOpenApiTester} title="API Playground" className={`flex items-center space-x-1 p-2 text-xs font-medium ${SECONDARY_BTN}`}>
            <Code2 className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            <span className="hidden lg:inline">API Tester</span>
          </button>

          {authStatus.isAuthenticated ? (
            <div className="flex items-center space-x-2 pl-1 border-l border-slate-200 dark:border-slate-700/60">
              <Avatar user={user} className="ring-emerald-500/50" />
              <button onClick={logout} title="Disconnect Google Account" aria-label="Sign out" className={`p-1.5 hover:text-rose-600! dark:hover:text-rose-400! ${SECONDARY_BTN}`}>
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <a href={LOGIN_URL} className={`flex items-center space-x-1.5 px-3 py-1.5 shadow-md shadow-emerald-900/20 dark:shadow-emerald-900/40 active:scale-95 ${PRIMARY_BTN}`}>
              <LogIn className="w-3.5 h-3.5" />
              <span>Connect Google</span>
            </a>
          )}
        </div>

        {/* Mobile controls */}
        <div className="flex md:hidden items-center space-x-1.5">
          <button onClick={onOpenShareCard} title="Share Health Card" aria-label="Share snapshot" className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700/60">
            <Share2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </button>
          {authStatus.isAuthenticated ? (
            <Avatar user={user} />
          ) : (
            <a href={LOGIN_URL} className={`px-2.5 py-1.5 ${PRIMARY_BTN}`}>
              Connect
            </a>
          )}
          <button
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="Toggle navigation menu"
            aria-expanded={menuOpen}
            className="p-2 text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-700/60"
          >
            {menuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Mobile menu sheet */}
      {menuOpen && (
        <div className="md:hidden bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800 shadow-xl px-4 py-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
          {authStatus.isAuthenticated && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60">
              <div className="flex items-center space-x-2.5 min-w-0">
                <Avatar user={user} size="md" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">{user?.displayName || "Google Health User"}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{user?.email || "Connected account"}</p>
                </div>
              </div>
              <button onClick={logout} className="px-2.5 py-1.5 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 rounded-lg border border-rose-500/20 font-medium shrink-0 flex items-center space-x-1">
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign out</span>
              </button>
            </div>
          )}

          <div className={`grid ${showDemoToggle ? "grid-cols-2" : "grid-cols-1"} gap-2`}>
            {showDemoToggle && <DemoToggle isDemo={authStatus.isDemo} onClick={closeMenuThen(onToggleDemo)} className="justify-center px-3 py-2.5 rounded-xl" />}
            <button onClick={closeMenuThen(onRefresh)} disabled={isRefreshing} className={`flex items-center justify-center space-x-1.5 px-3 py-2.5 text-xs font-medium rounded-xl! ${SECONDARY_BTN}`}>
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-emerald-500" : ""}`} />
              <span>{isRefreshing ? "Syncing..." : "Sync Metrics"}</span>
            </button>
          </div>

          <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-100/70 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/60">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Appearance</span>
            <ThemeToggle />
          </div>

          <div className="flex items-center space-x-2 pt-0.5">
            <button onClick={closeMenuThen(onOpenApiTester)} className={`flex-1 flex items-center justify-center space-x-1.5 px-3 py-2 text-xs font-medium rounded-xl! ${SECONDARY_BTN}`}>
              <Code2 className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
              <span>API Explorer & Tester</span>
            </button>
            {!authStatus.isAuthenticated && (
              <a href={LOGIN_URL} className={`flex-1 flex items-center justify-center space-x-1.5 px-3 py-2 rounded-xl! ${PRIMARY_BTN}`}>
                <LogIn className="w-3.5 h-3.5" />
                <span>Connect Google</span>
              </a>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
