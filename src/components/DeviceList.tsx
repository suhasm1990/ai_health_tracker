"use client";

import React from "react";
import {
  Watch,
  Activity,
  Scale,
  Smartphone,
  Battery,
  BatteryCharging,
  BatteryMedium,
  BatteryLow,
  RefreshCw,
  Cpu,
  Layers,
} from "lucide-react";
import { PairedDevice } from "@/lib/types";

interface DeviceListProps {
  devices: PairedDevice[];
  onSyncDevice: (id: string) => void;
  isSyncing: boolean;
  onTryDemo?: () => void;
  isDemo?: boolean;
}

export const DeviceList: React.FC<DeviceListProps> = ({
  devices,
  onSyncDevice,
  isSyncing,
  onTryDemo,
  isDemo = false,
}) => {
  const getDeviceIcon = (type: PairedDevice["iconType"]) => {
    switch (type) {
      case "watch":
        return <Watch className="w-5 h-5 text-indigo-400" />;
      case "scale":
        return <Scale className="w-5 h-5 text-teal-400" />;
      case "phone":
        return <Smartphone className="w-5 h-5 text-amber-400" />;
      case "band":
      default:
        return <Activity className="w-5 h-5 text-emerald-400" />;
    }
  };

  const getBatteryIcon = (device: PairedDevice) => {
    if (device.batteryLevel === undefined) {
      return <Activity className="w-4 h-4 text-emerald-400" />;
    }
    if (device.batteryStatus === "CHARGING") {
      return <BatteryCharging className="w-4 h-4 text-emerald-400 animate-pulse" />;
    }
    const level = device.batteryLevel;
    if (level <= 25) {
      return <BatteryLow className="w-4 h-4 text-amber-500 dark:text-amber-400" />;
    }
    if (level <= 50) {
      return <BatteryMedium className="w-4 h-4 text-amber-400" />;
    }
    return <Battery className="w-4 h-4 text-emerald-400" />;
  };

  const formatRelativeTime = (isoString: string) => {
    try {
      const diffSec = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
      if (diffSec < 60) return "Just now";
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHours = Math.floor(diffMin / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      return `${Math.floor(diffHours / 24)}d ago`;
    } catch {
      return "Recently";
    }
  };

  return (
    <div className="bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs transition-colors duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Connected Devices & Data Sources</h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 font-medium">
              {devices.length} Contributing {devices.length === 1 ? "Source" : "Sources"}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Auto-detected wearables & synced telemetry platforms contributing to your unified metrics
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <span className="inline-flex items-center space-x-1.5 text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/60 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700/60">
            <Layers className="w-3.5 h-3.5 text-emerald-500" />
            <span className="font-medium text-slate-700 dark:text-slate-300">All Sources Reconciled</span>
          </span>
        </div>
      </div>

      {/* Devices Grid */}
      {devices.length === 0 ? (
        <div className="py-8 px-4 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-800/20">
          <Smartphone className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            No Dedicated Hardware Wearables Found
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
            Metrics on this account are recorded via mobile phone tracking (Apple Health / HealthKit) or manual logging.
          </p>
          {onTryDemo && !isDemo && (
            <div className="mt-4">
              <button
                onClick={onTryDemo}
                className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 rounded-lg text-xs font-semibold transition-colors shadow-xs"
              >
                <span>Explore Demo Mode with Sample Devices</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {devices.map((device) => {
            return (
              <div
                key={device.id}
                className="relative rounded-xl p-3.5 border bg-slate-50/70 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/60 hover:border-slate-300 dark:hover:border-slate-600 transition-all"
              >
                <div className="flex items-start space-x-3">
                  <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700/80 shadow-xs shrink-0">
                    {getDeviceIcon(device.iconType)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">{device.displayName}</h3>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{device.model}</p>
                  </div>
                </div>

              {/* Status and telemetry */}
              <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700/40 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                {/* Battery / Status */}
                <div
                  className="flex items-center space-x-1.5"
                  title={
                    device.batteryLevel !== undefined
                      ? `Battery: ${device.batteryLevel}% (${device.batteryStatus})`
                      : device.batteryStatus !== "UNKNOWN"
                      ? `Battery Status: ${device.batteryStatus}`
                      : "Device actively syncing"
                  }
                >
                  {getBatteryIcon(device)}
                  {device.batteryLevel !== undefined ? (
                    <span
                      className={`font-mono text-xs font-semibold ${
                        device.batteryLevel <= 25
                          ? "text-amber-500 dark:text-amber-400"
                          : "text-slate-700 dark:text-slate-300"
                      }`}
                    >
                      {device.batteryLevel}%
                    </span>
                  ) : device.batteryStatus !== "UNKNOWN" ? (
                    <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300 capitalize">
                      {device.batteryStatus.toLowerCase()}
                    </span>
                  ) : (
                    <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Live Sync
                    </span>
                  )}
                </div>

                {/* Firmware / Platform */}
                <div className="flex items-center space-x-1 text-slate-500 dark:text-slate-400 font-mono text-[11px]" title="Firmware or sync protocol">
                  <Cpu className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                  <span>
                    {device.firmwareVersion?.toLowerCase().includes("sync") || device.firmwareVersion?.toLowerCase().includes("connected")
                      ? device.firmwareVersion
                      : `v${device.firmwareVersion || device.hardwareVersion}`}
                  </span>
                </div>

                {/* Last Sync & Action */}
                <div className="flex items-center space-x-2">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400" title={`Last synced: ${device.lastSyncTime}`}>
                    {formatRelativeTime(device.lastSyncTime)}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSyncDevice(device.id);
                    }}
                    disabled={isSyncing}
                    className="p-1 hover:text-emerald-500 dark:hover:text-emerald-400 text-slate-400 dark:text-slate-500 transition-colors"
                    title="Request device sync"
                  >
                    <RefreshCw className={`w-3 h-3 ${isSyncing ? "animate-spin text-emerald-500 dark:text-emerald-400" : ""}`} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
};
