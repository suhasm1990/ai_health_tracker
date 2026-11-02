import type { DataSource } from "./client";

/** Apps that write to Health Connect or HealthKit, matched on package name. */
const APPS: [needle: string, name: string][] = [
  ["garmin", "Garmin Connect"],
  ["shealth", "Samsung Health"],
  ["samsung", "Samsung Health"],
  ["mi.health", "Mi Fitness"],
  ["xiaomi.wearable", "Mi Fitness"],
  ["xiaomi.hm.health", "Zepp Life"],
  ["huami", "Zepp"],
  ["zepp", "Zepp"],
  ["ringconn", "RingConn"],
  ["oura", "Oura"],
  ["whoop", "WHOOP"],
  ["polar", "Polar Flow"],
  ["suunto", "Suunto"],
  ["coros", "COROS"],
  ["amazfit", "Zepp"],
  ["huawei", "Huawei Health"],
  ["strava", "Strava"],
  ["google.android.apps.fitness", "Google Fit"],
];

const FORM_FACTORS: Record<string, string> = {
  WATCH: "Watch",
  FITNESS_BAND: "Band",
  RING: "Ring",
  PHONE: "Phone",
  CHEST_STRAP: "Chest Strap",
  SCALE: "Scale",
  TABLET: "Tablet",
};

const PLATFORMS: Record<string, string> = {
  HEALTH_CONNECT: "Health Connect",
  HEALTH_KIT: "Apple Health",
  FIT: "Google Fit",
};

export const appName = (packageName?: string) => {
  const pkg = packageName?.toLowerCase();
  return pkg ? APPS.find(([needle]) => pkg.includes(needle))?.[1] : undefined;
};

export const formFactorLabel = (formFactor?: string) => (formFactor ? FORM_FACTORS[formFactor] : undefined);

const titleCase = (text: string) => text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();

/** Human name for where a data point came from, e.g. "Galaxy Watch6", "Xiaomi Band" or "Garmin Connect". */
export function sourceLabel(ds: DataSource): string | undefined {
  const dev = ds.device;
  if (dev?.displayName) return dev.displayName;
  const form = formFactorLabel(dev?.formFactor);
  if (dev?.manufacturer && form) return `${titleCase(dev.manufacturer)} ${form}`;
  const app = appName(ds.application?.packageName);
  if (app) return form ? `${app} (${form})` : app;
  if (ds.platform && ds.platform !== "FITBIT") return PLATFORMS[ds.platform] ?? titleCase(ds.platform.replace(/_/g, " "));
  return form;
}
