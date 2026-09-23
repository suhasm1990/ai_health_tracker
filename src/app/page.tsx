import { Dashboard } from "@/components/Dashboard";
import { buildAuthStatus } from "@/lib/auth";
import { getPairedDevices } from "@/lib/health";
import { getMockDevices, getMockMetrics } from "@/lib/mockData";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** The OAuth callback redirects here with `?connected=true` or `?error=...`. */
function redirectNotice(params: Record<string, string | string[] | undefined>): string | null {
  if (params.connected === "true") return "Connected to Google Health API successfully!";
  const error = Array.isArray(params.error) ? params.error[0] : params.error;
  return error ? `Authentication notice: ${error}` : null;
}

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const [authStatus, params] = await Promise.all([buildAuthStatus(), searchParams]);
  const notice = redirectNotice(params);

  // Demo mode is fully server-rendered. Live mode ships cached devices now and
  // loads metrics on the client, which knows the user's date and timezone.
  if (authStatus.isDemo) {
    return <Dashboard initialAuthStatus={authStatus} initialDevices={getMockDevices()} initialMetrics={getMockMetrics()} initialNotice={notice} />;
  }
  const devices = await getPairedDevices().catch(() => []);
  return <Dashboard initialAuthStatus={authStatus} initialDevices={devices} initialMetrics={null} initialNotice={notice} />;
}
