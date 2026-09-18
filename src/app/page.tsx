import { getStoredTokens, getCredentials } from "@/lib/tokens";
import { getUserProfile, getPairedDevices } from "@/lib/googleHealthApi";
import { DashboardClient } from "@/components/DashboardClient";
import { AuthStatus, DailyMetricSummary, PairedDevice, IntradayStepPoint, IntradayHeartRatePoint } from "@/lib/types";
import {
  MOCK_DEVICES,
  MOCK_TODAY_METRICS,
  MOCK_INTRADAY_STEPS,
  MOCK_INTRADAY_HEART_RATE,
  MOCK_HISTORY_7_DAYS,
} from "@/lib/mockData";

export const dynamic = "force-dynamic";

const EMPTY_TODAY_METRICS: DailyMetricSummary = {
  date: new Date().toISOString().split("T")[0],
  steps: 0,
  stepsGoal: 10000,
  activeZoneMinutes: 0,
  activeZoneMinutesGoal: 30,
  caloriesBurned: 0,
  caloriesGoal: 2400,
  distanceKm: 0,
  floors: 0,
  restingHeartRate: null,
  avgHeartRate: null,
  maxHeartRate: null,
  heartRateVariability: null,
  oxygenSaturation: null,
  respiratoryRate: null,
  sleepDurationMinutes: 0,
  sleepScore: 0,
  sleepEfficiency: 0,
  sleepStages: [],
  weightKg: null,
  fatBurnMinutes: 0,
  cardioPeakMinutes: 0,
};

export default async function DashboardPage() {
  const tokens = await getStoredTokens();
  const { clientId, clientSecret } = getCredentials();
  const hasValidToken = Boolean(tokens.access_token);
  const isDemo = !hasValidToken || Boolean(tokens.is_demo_mode);
  const user = hasValidToken ? await getUserProfile().catch(() => null) : null;

  const initialAuthStatus: AuthStatus = {
    isAuthenticated: hasValidToken,
    isDemo,
    hasCredentials: Boolean(clientId && clientSecret),
    user: user || undefined,
    scopesGranted: hasValidToken ? (tokens.scopes || []) : [],
  };

  let initialDevices: PairedDevice[] = [];
  let initialMetrics: {
    today: DailyMetricSummary;
    intradaySteps: IntradayStepPoint[];
    intradayHeartRate: IntradayHeartRatePoint[];
    history7Days: DailyMetricSummary[];
  } = {
    today: EMPTY_TODAY_METRICS,
    intradaySteps: [],
    intradayHeartRate: [],
    history7Days: [],
  };
  let hasInitialMetrics = false;

  if (isDemo) {
    initialDevices = MOCK_DEVICES;
    initialMetrics = {
      today: MOCK_TODAY_METRICS,
      intradaySteps: MOCK_INTRADAY_STEPS,
      intradayHeartRate: MOCK_INTRADAY_HEART_RATE,
      history7Days: MOCK_HISTORY_7_DAYS,
    };
    hasInitialMetrics = true;
  } else {
    // For authenticated users, deliver cached paired devices immediately
    initialDevices = await getPairedDevices().catch(() => []);
    hasInitialMetrics = false;
  }

  return (
    <DashboardClient
      initialAuthStatus={initialAuthStatus}
      initialDevices={initialDevices}
      initialMetrics={initialMetrics}
      hasInitialMetrics={hasInitialMetrics}
    />
  );
}
