"use client";

import { Activity, Battery, BatteryCharging, BatteryLow, BatteryMedium, Cpu, Layers, RefreshCw, Scale, Smartphone, Watch, type LucideIcon } from "lucide-react";
import type { DeviceIcon, PairedDevice } from "@/lib/types";
import { formatRelativeTime } from "@/lib/utils";

interface DeviceListProps {
  devices: PairedDevice[];
  onSync: () => void;
  isSyncing: boolean;
  isDemo: boolean;
  onTryDemo: () => void;
}

const DEVICE_ICONS: Record<DeviceIcon, { icon: LucideIcon; className: string }> = {
  watch: { icon: Watch, className: "text-indigo-400" },
  scale: { icon: Scale, className: "text-teal-400" },
  phone: { icon: Smartphone, className: "text-amber-400" },
  band: { icon: Activity, className: "text-emerald-400" },
};

function BatteryIcon({ device }: { device: PairedDevice }) {
  const level = device.batteryLevel;
  if (level === undefined) return <Activity className="w-4 h-4 text-emerald-400" />;
  if (device.batteryStatus === "CHARGING") return <BatteryCharging className="w-4 h-4 text-emerald-400 animate-pulse" />;
  if (level <= 25) return <BatteryLow className="w-4 h-4 text-amber-500 dark:text-amber-400" />;
  if (level <= 50) return <BatteryMedium className="w-4 h-4 text-amber-400" />;
  return <Battery className="w-4 h-4 text-emerald-400" />;
}

function batteryLabel(device: PairedDevice): { text: string; title: string; low: boolean } {
  if (device.batteryLevel !== undefined) {
    return { text: `${device.batteryLevel}%`, title: `Battery: ${device.batteryLevel}% (${device.batteryStatus})`, low: device.batteryLevel <= 25 };
  }
  if (device.batteryStatus !== "UNKNOWN") return { text: device.batteryStatus.toLowerCase(), title: `Battery Status: ${device.batteryStatus}`, low: false };
  return { text: "Live Sync", title: "Device actively syncing", low: false };
}

const firmwareLabel = (d: PairedDevice) =>
  /sync|connected/i.test(d.firmwareVersion ?? "") ? d.firmwareVersion : `v${d.firmwareVersion || d.hardwareVersion}`;

/** Battery readout, last-sync age and the sync action; every piece is no-wrap so the row stays on one line. */
function DeviceStatus({ device, onSync, isSyncing }: { device: PairedDevice; onSync: () => void; isSyncing: boolean }) {
  const battery = batteryLabel(device);
  return (
    <div className="flex items-center gap-2 shrink-0 text-xs text-slate-500 dark:text-slate-400">
      <span className="flex items-center gap-1 whitespace-nowrap" title={battery.title}>
        <BatteryIcon device={device} />
        <span className={`font-mono font-semibold capitalize ${battery.low ? "text-amber-500 dark:text-amber-400" : "text-slate-700 dark:text-slate-300"}`}>{battery.text}</span>
      </span>
      <span className="whitespace-nowrap text-[11px]" title={`Last synced: ${device.lastSyncTime}`} suppressHydrationWarning>
        {formatRelativeTime(device.lastSyncTime)}
      </span>
      <button onClick={onSync} disabled={isSyncing} title="Request device sync" aria-label={`Sync ${device.displayName}`} className="p-1 hover:text-emerald-500 dark:hover:text-emerald-400 text-slate-400 dark:text-slate-500 transition-colors">
        <RefreshCw className={`w-3 h-3 ${isSyncing ? "animate-spin text-emerald-500 dark:text-emerald-400" : ""}`} />
      </button>
    </div>
  );
}

export function DeviceList({ devices, onSync, isSyncing, isDemo, onTryDemo }: DeviceListProps) {
  const count = devices.length;
  return (
    <section className="bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs transition-colors duration-200">
      <div className="flex items-center justify-between gap-2 mb-3 sm:mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white truncate">
              <span className="sm:hidden">Devices & Sources</span>
              <span className="hidden sm:inline">Connected Devices & Data Sources</span>
            </h2>
            <span className="shrink-0 whitespace-nowrap text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 font-medium">
              {count} <span className="hidden sm:inline">Contributing </span>
              {count === 1 ? "Source" : "Sources"}
            </span>
          </div>
          <p className="hidden sm:block text-xs text-slate-500 dark:text-slate-400 mt-0.5">Auto-detected wearables & synced telemetry platforms contributing to your unified metrics</p>
        </div>
        <span className="hidden sm:inline-flex shrink-0 items-center space-x-1.5 text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/60 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700/60">
          <Layers className="w-3.5 h-3.5 text-emerald-500" />
          <span className="font-medium text-slate-700 dark:text-slate-300">All Sources Reconciled</span>
        </span>
      </div>

      {count === 0 ? (
        <div className="py-8 px-4 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-800/20">
          <Smartphone className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No Dedicated Hardware Wearables Found</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
            Metrics on this account are recorded via mobile phone tracking (Apple Health / HealthKit) or manual logging.
          </p>
          {!isDemo && (
            <button onClick={onTryDemo} className="mt-4 inline-flex items-center px-3.5 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 rounded-lg text-xs font-semibold transition-colors shadow-xs">
              Explore Demo Mode with Sample Devices
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
          {devices.map((device) => {
            const { icon: Icon, className } = DEVICE_ICONS[device.iconType] ?? DEVICE_ICONS.band;
            return (
              // Phone: one compact row per device. Tablet and up: a card with a status footer.
              <div key={device.id} className="rounded-xl p-2.5 sm:p-3.5 border bg-slate-50/70 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/60 hover:border-slate-300 dark:hover:border-slate-600 transition-all flex items-center gap-3 sm:block">
                <div className="flex items-center sm:items-start gap-3 flex-1 min-w-0">
                  <div className="p-2 sm:p-2.5 rounded-xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700/80 shadow-xs shrink-0">
                    <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${className}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white truncate">{device.displayName}</h3>
                    <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 truncate">{device.model}</p>
                  </div>
                </div>

                <div className="sm:hidden">
                  <DeviceStatus device={device} onSync={onSync} isSyncing={isSyncing} />
                </div>

                <div className="hidden sm:flex mt-3 pt-3 border-t border-slate-200 dark:border-slate-700/40 items-center justify-between gap-2">
                  <div className="flex items-center gap-1 font-mono text-[11px] text-slate-500 dark:text-slate-400 min-w-0 truncate" title="Firmware or sync protocol">
                    <Cpu className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0" />
                    <span className="truncate">{firmwareLabel(device)}</span>
                  </div>
                  <DeviceStatus device={device} onSync={onSync} isSyncing={isSyncing} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
