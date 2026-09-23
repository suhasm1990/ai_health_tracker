import { AuthError, getAuthState, getValidAccessToken, type AuthState } from "../auth";
import { cached, getCached, setCached } from "../cache";
import { getMockDevices } from "../mockData";
import type { BatteryStatus, PairedDevice } from "../types";
import { isPositive } from "../utils";
import * as api from "./client";

const DEVICES_TTL_MS = 2 * 60 * 1000;
/** Sources seen in earlier discoveries are remembered so a device that has not synced recently does not vanish. */
const KNOWN_TTL_MS = 24 * 60 * 60 * 1000;

/** Paired hardware plus platforms (Apple Health, Health Connect) discovered from live telemetry. */
export async function getPairedDevices(force = false, auth?: AuthState): Promise<PairedDevice[]> {
  const state = auth ?? (await getAuthState());
  if (state.isDemo) return getMockDevices();
  return cached(`${state.scope}:devices`, DEVICES_TTL_MS, () => discoverDevices(state), { force });
}

async function discoverDevices(state: AuthState): Promise<PairedDevice[]> {
  const token = await getValidAccessToken(state.session);
  if (!token) throw new AuthError();

  const knownKey = `${state.scope}:devices-known`;
  const found = new Map<string, PairedDevice>((getCached<PairedDevice[]>(knownKey) ?? []).map((d) => [nameKey(d.displayName), { ...d }]));

  const [paired, ...telemetry] = await Promise.all([
    api.listPairedDevices(token),
    api.listDataPoints(token, "steps", 100),
    api.listDataPoints(token, "distance", 50),
    api.listDataPoints(token, "exercise", 20),
    api.listDataPoints(token, "heart-rate", 25),
  ]);

  paired?.pairedDevices?.forEach((raw, i) => {
    const device = mapPairedDevice(raw, i);
    found.set(nameKey(device.displayName), device);
  });
  for (const res of telemetry) for (const pt of res?.dataPoints ?? []) mergeSource(found, pt);

  const devices = Array.from(found.values());
  setCached(knownKey, devices, KNOWN_TTL_MS);
  return devices;
}

/* ---------- naming ---------- */

const nameKey = (name: string) => name.toLowerCase().replace(/\bgoogle\b/g, "").replace(/\s+/g, " ").trim();
const has = (text: string | undefined, ...needles: string[]) => needles.some((n) => text?.toLowerCase().includes(n));
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* ---------- official pairedDevices ---------- */

function parseBattery(raw: api.RawPairedDevice): { batteryLevel?: number; batteryStatus: BatteryStatus } {
  const level = [raw.batteryLevel, raw.batteryPercentage, raw.battery?.level, raw.battery?.percentage].find(isPositive);
  const status = (raw.batteryStatus ?? "").toUpperCase();
  const batteryStatus: BatteryStatus = status.includes("CHARG")
    ? "CHARGING"
    : has(status, "low", "empty")
      ? "LOW"
      : status.includes("MED")
        ? "MEDIUM"
        : has(status, "high", "full")
          ? "HIGH"
          : "UNKNOWN";
  return { batteryLevel: level === undefined ? undefined : Math.round(level <= 1 ? level * 100 : level), batteryStatus };
}

function mapPairedDevice(raw: api.RawPairedDevice, idx: number): PairedDevice {
  const displayName = raw.displayName || raw.deviceVersion || raw.model || `Device ${idx + 1}`;
  const isScale = has(displayName, "scale", "aria") || raw.deviceType === "SCALE";
  const isWatch = !isScale && (has(displayName, "watch") || raw.deviceType === "SMARTWATCH");
  return {
    id: raw.name?.split("/").pop() || `device-${idx}`,
    name: raw.name || "",
    displayName,
    model: raw.deviceVersion || raw.model || displayName,
    deviceType: isScale ? "SCALE" : isWatch ? "SMARTWATCH" : "FITNESS_TRACKER",
    manufacturer: "Google / Fitbit",
    hardwareVersion: raw.deviceVersion || "1.0",
    firmwareVersion: "Latest",
    ...parseBattery(raw),
    lastSyncTime: raw.lastSyncTime || new Date().toISOString(),
    iconType: isScale ? "scale" : isWatch ? "watch" : "band",
  };
}

/* ---------- sources inferred from telemetry ---------- */

function sourceName(ds: api.DataSource): string | undefined {
  const dev = ds.device;
  if (dev?.displayName) return dev.displayName;
  const isApple = dev?.manufacturer === "Apple Inc." || ds.platform === "HEALTH_KIT" || ds.application?.packageName?.includes("apple.health");
  if (isApple) return dev?.formFactor === "WATCH" || has(dev?.model, "watch") ? "Apple Watch" : "Apple Health (iPhone)";
  if (dev?.manufacturer && dev.formFactor) return `${dev.manufacturer} ${dev.formFactor === "PHONE" ? "Phone" : dev.formFactor}`;
  if (ds.platform && ds.platform !== "FITBIT") return `${ds.platform} Sync`;
  if (dev?.formFactor) return dev.formFactor === "PHONE" ? "Mobile Phone" : dev.formFactor;
  return undefined;
}

const pointEndTime = (pt: api.DataPoint) =>
  pt.steps?.interval?.endTime ?? pt.distance?.interval?.endTime ?? pt.exercise?.interval?.endTime ?? pt.heartRate?.sampleTime;

function mergeSource(found: Map<string, PairedDevice>, pt: api.DataPoint): void {
  const ds = pt.dataSource;
  const name = ds && sourceName(ds);
  if (!ds || !name) return;

  const dev = ds.device;
  const isWatch = has(name, "watch") || dev?.formFactor === "WATCH";
  const isApple = has(name, "apple") || ds.platform === "HEALTH_KIT";
  const syncedAt = pointEndTime(pt);
  const existing = found.get(nameKey(name));

  if (existing) {
    if (isApple && isWatch && (!existing.model || existing.model === "Apple Watch")) existing.model = "Apple Watch via HealthKit";
    if (syncedAt && Date.parse(syncedAt) > Date.parse(existing.lastSyncTime)) existing.lastSyncTime = syncedAt;
    return;
  }

  const isScale = has(name, "scale", "aria");
  const isPhone = dev?.formFactor === "PHONE" || (isApple && !isWatch) || has(name, "phone");
  const model = isApple
    ? isWatch
      ? `${dev?.model && dev.model !== "Apple Watch" ? dev.model : "Apple Watch"} via HealthKit`
      : "Apple iPhone via HealthKit"
    : dev?.model || name;
  const id = slug(name);

  found.set(nameKey(name), {
    id,
    name: `users/me/devices/${id}`,
    displayName: name,
    model,
    deviceType: isWatch ? "SMARTWATCH" : isScale ? "SCALE" : "FITNESS_TRACKER",
    manufacturer: dev?.manufacturer || (isApple ? "Apple Inc." : "Health Connect"),
    hardwareVersion: dev?.hardwareVersion || (isWatch ? "watchOS HealthKit" : isApple ? "iOS HealthKit" : "v1.0"),
    firmwareVersion: dev?.firmwareVersion || (isApple ? "Active Sync" : "Connected"),
    batteryStatus: "UNKNOWN",
    lastSyncTime: syncedAt || new Date().toISOString(),
    iconType: isScale ? "scale" : isWatch ? "watch" : isPhone ? "phone" : "band",
  });
}
