"use client";

import React, { useState, useEffect } from "react";
import {
  Activity,
  Radio,
  Code2,
  LogIn,
  LogOut,
  RefreshCw,
  Share2,
  Menu,
  X,
} from "lucide-react";
import { AuthStatus, PairedDevice } from "@/lib/types";
import { ThemeToggle } from "@/components/ThemeToggle";

interface HeaderProps {
  authStatus: AuthStatus;
  devices: PairedDevice[];
  onToggleDemo: () => void;
  onOpenApiTester: () => void;
  onRefreshData: () => void;
  onOpenShareCard?: () => void;
  isRefreshing: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  authStatus,
  devices,
  onToggleDemo,
  onOpenApiTester,
  onRefreshData,
  onOpenShareCard,
  isRefreshing,
}) => {
  const [imgError, setImgError] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [authStatus.user?.avatarUrl]);

  const handleLogin = () => {
    window.location.href = "/api/auth/login";
  };

  const handleLogout = async () => {
    try {
      try {
        localStorage.removeItem("gh_synced_metrics");
      } catch {}
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/";
    } catch (err) {
      console.error(err);
      window.location.href = "/";
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4">
        {/* Logo & Brand */}
        <div className="flex items-center space-x-2.5 sm:space-x-3 shrink-0">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-md shadow-emerald-900/20 dark:shadow-emerald-900/30 shrink-0">
            <Activity className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
          </div>
          <div className="shrink-0">
            <h1 className="font-bold text-base sm:text-lg tracking-tight text-slate-900 dark:text-white whitespace-nowrap leading-tight">
              AI Health Tracker
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block whitespace-nowrap">
              Powered by Google Health API
            </p>
          </div>
        </div>

        {/* Active Data Sources Badge (Large screens only) */}
        {devices.length > 0 && (
          <div className="hidden lg:flex items-center space-x-2.5 bg-slate-100/90 dark:bg-slate-800/70 rounded-xl px-3 py-1.5 border border-slate-200 dark:border-slate-700/60 shadow-2xs">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Sources:</span>
            <div className="flex items-center space-x-1.5">
              {devices.map((device) => (
                <span
                  key={device.id}
                  className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-md bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-200 shadow-2xs"
                  title={`${device.displayName} (${device.model})`}
                >
                  <span className="truncate max-w-[130px]">{device.displayName}</span>
                  {device.batteryLevel !== undefined && (
                    <span
                      className={`text-[10px] font-mono font-semibold ${
                        device.batteryLevel <= 25
                          ? "text-amber-500 dark:text-amber-400"
                          : "text-emerald-600 dark:text-emerald-400"
                      }`}
                    >
                      {device.batteryLevel}%
                    </span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Desktop Controls (hidden on < md, visible on md+) */}
        <div className="hidden md:flex items-center space-x-1.5 sm:space-x-2.5">
          {/* Theme Selector (Light / System / Dark) */}
          <ThemeToggle />

          {/* Refresh Button */}
          <button
            onClick={onRefreshData}
            disabled={isRefreshing}
            className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800/60 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700/50 transition-colors"
            title="Refresh Metrics"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin text-emerald-500 dark:text-emerald-400" : ""}`} />
          </button>

          {/* Demo Mode Toggle (Only visible if currently in demo mode or user has no connected devices) */}
          {(authStatus.isDemo || devices.length === 0) && (
            <button
              onClick={onToggleDemo}
              className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                authStatus.isDemo
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20"
                  : "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20"
              }`}
              title="Toggle between Demo Sandbox and Live Google Health API"
            >
              <Radio className={`w-3.5 h-3.5 ${authStatus.isDemo ? "text-amber-500 dark:text-amber-400" : "text-emerald-500 dark:text-emerald-400 animate-pulse"}`} />
              <span className="hidden sm:inline">{authStatus.isDemo ? "Demo Sandbox" : "Live Health API"}</span>
            </button>
          )}

          {/* Share Snapshot Button */}
          {onOpenShareCard && (
            <button
              onClick={onOpenShareCard}
              className="flex items-center space-x-1.5 px-2.5 py-1.5 text-slate-700 dark:text-slate-200 hover:text-white bg-slate-100 dark:bg-slate-800/80 hover:bg-emerald-600 dark:hover:bg-emerald-600 rounded-lg border border-slate-200 dark:border-slate-700/60 transition-all text-xs font-semibold shadow-xs cursor-pointer"
              title="Share Daily Health Snapshot with Family & Friends"
            >
              <Share2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 group-hover:text-white" />
              <span className="hidden sm:inline">Share</span>
            </button>
          )}

          {/* API Debugger Button */}
          <button
            onClick={onOpenApiTester}
            className="hidden sm:flex items-center space-x-1 p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800/60 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700/50 transition-colors text-xs font-medium"
            title="API Playground"
          >
            <Code2 className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            <span className="hidden lg:inline">API Tester</span>
          </button>

          {/* Google Auth Button */}
          {authStatus.isAuthenticated ? (
            <div className="flex items-center space-x-2 pl-1 border-l border-slate-200 dark:border-slate-700/60">
              <div className="flex items-center space-x-2">
                {authStatus.user?.avatarUrl && !imgError ? (
                  <img
                    src={authStatus.user.avatarUrl}
                    alt={authStatus.user.displayName || "User"}
                    referrerPolicy="no-referrer"
                    crossOrigin="anonymous"
                    onError={() => setImgError(true)}
                    className="w-7 h-7 rounded-full ring-2 ring-emerald-500/50 object-cover shadow-xs"
                    title={
                      authStatus.user.email
                        ? `${authStatus.user.displayName} (${authStatus.user.email})`
                        : authStatus.user.displayName
                    }
                  />
                ) : (
                  <div
                    className="w-7 h-7 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 ring-2 ring-emerald-500/30 flex items-center justify-center text-xs font-bold text-white shadow-xs"
                    title={
                      authStatus.user?.email
                        ? `${authStatus.user.displayName} (${authStatus.user.email})`
                        : authStatus.user?.displayName || "Connected Google User"
                    }
                  >
                    {(authStatus.user?.displayName || authStatus.user?.email || "U").charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <button
                onClick={handleLogout}
                className="p-1.5 text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 bg-slate-100 dark:bg-slate-800/60 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700/50 transition-colors"
                title="Disconnect Google Account"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={handleLogin}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-emerald-900/20 dark:shadow-emerald-900/40 transition-all active:scale-95 shrink-0"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Connect Google</span>
            </button>
          )}
        </div>

        {/* Mobile Controls (< md) */}
        <div className="flex md:hidden items-center space-x-1.5">
          {onOpenShareCard && (
            <button
              onClick={onOpenShareCard}
              className="p-2 text-slate-700 dark:text-slate-200 hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-emerald-600 dark:hover:bg-emerald-600 rounded-lg border border-slate-200 dark:border-slate-700/60 transition-colors"
              title="Share Health Card"
              aria-label="Share Snapshot"
            >
              <Share2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </button>
          )}

          {authStatus.isAuthenticated ? (
            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 ring-2 ring-emerald-500/30 flex items-center justify-center text-xs font-bold text-white shadow-xs shrink-0 overflow-hidden">
              {authStatus.user?.avatarUrl && !imgError ? (
                <img
                  src={authStatus.user.avatarUrl}
                  alt=""
                  referrerPolicy="no-referrer"
                  crossOrigin="anonymous"
                  onError={() => setImgError(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                (authStatus.user?.displayName || "U").charAt(0).toUpperCase()
              )}
            </div>
          ) : (
            <button
              onClick={handleLogin}
              className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow shrink-0"
            >
              <span>Connect</span>
            </button>
          )}

          {/* Hamburger Menu Toggle */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-700/60 transition-colors"
            title="Toggle Menu"
            aria-label="Toggle navigation menu"
            aria-expanded={isMobileMenuOpen}
          >
            {isMobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Mobile Slide-Down Menu Sheet */}
      {isMobileMenuOpen && (
        <div className="md:hidden bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800 shadow-xl px-4 py-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
          {authStatus.isAuthenticated && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60">
              <div className="flex items-center space-x-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 text-white font-bold flex items-center justify-center shrink-0 overflow-hidden text-xs">
                  {authStatus.user?.avatarUrl && !imgError ? (
                    <img src={authStatus.user.avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    (authStatus.user?.displayName || "U").charAt(0).toUpperCase()
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                    {authStatus.user?.displayName || "Google Health User"}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {authStatus.user?.email || "Connected account"}
                  </p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="px-2.5 py-1.5 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 rounded-lg border border-rose-500/20 font-medium shrink-0 flex items-center space-x-1"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign out</span>
              </button>
            </div>
          )}

          {/* Quick Action Grid: Demo Toggle (conditional) & Refresh */}
          <div className={`grid ${(authStatus.isDemo || devices.length === 0) ? "grid-cols-2" : "grid-cols-1"} gap-2`}>
            {(authStatus.isDemo || devices.length === 0) && (
              <button
                onClick={() => {
                  onToggleDemo();
                  setIsMobileMenuOpen(false);
                }}
                className={`flex items-center justify-center space-x-1.5 px-3 py-2.5 rounded-xl text-xs font-medium border transition-colors ${
                  authStatus.isDemo
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300"
                    : "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                }`}
              >
                <Radio className={`w-3.5 h-3.5 ${authStatus.isDemo ? "text-amber-500" : "text-emerald-500 animate-pulse"}`} />
                <span className="truncate">{authStatus.isDemo ? "Demo Sandbox" : "Live Health API"}</span>
              </button>
            )}

            <button
              onClick={() => {
                onRefreshData();
                setIsMobileMenuOpen(false);
              }}
              disabled={isRefreshing}
              className="flex items-center justify-center space-x-1.5 px-3 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl border border-slate-200 dark:border-slate-700/60 text-xs font-medium transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-emerald-500" : ""}`} />
              <span>{isRefreshing ? "Syncing..." : "Sync Metrics"}</span>
            </button>
          </div>

          {/* Theme Switcher Row */}
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-100/70 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/60">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Appearance</span>
            <ThemeToggle />
          </div>

          {/* API Explorer Action */}
          <div className="flex items-center space-x-2 pt-0.5">
            <button
              onClick={() => {
                onOpenApiTester();
                setIsMobileMenuOpen(false);
              }}
              className="flex-1 flex items-center justify-center space-x-1.5 px-3 py-2 bg-slate-100 dark:bg-slate-800/60 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-200 dark:border-slate-700/50 text-xs font-medium"
            >
              <Code2 className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
              <span>API Explorer & Tester</span>
            </button>

            {!authStatus.isAuthenticated && (
              <button
                onClick={handleLogin}
                className="flex-1 flex items-center justify-center space-x-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Connect Google</span>
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
