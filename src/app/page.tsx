import { Dashboard } from "@/components/Dashboard";
import { buildAuthStatus } from "@/lib/auth";
import { getPairedDevices } from "@/lib/health";
import { getMockDevices, getMockMetrics } from "@/lib/mockData";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const authStatus = await buildAuthStatus();

  // Demo mode is fully server-rendered. Live mode ships cached devices now and
  // loads metrics on the client, which knows the user's date and timezone.
  if (authStatus.isDemo) {
    return <Dashboard initialAuthStatus={authStatus} initialDevices={getMockDevices()} initialMetrics={getMockMetrics()} />;
  }
  const devices = await getPairedDevices().catch(() => []);
  return <Dashboard initialAuthStatus={authStatus} initialDevices={devices} initialMetrics={null} />;
}
