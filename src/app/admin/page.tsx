import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Users } from "lucide-react";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { isAdmin, loadAdminOverview, type AdminUserRow, type HealthStatus, type SyncStatus } from "@/lib/admin";
import { getAuthState } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { formatRelativeTime, formatShortDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Admin | AI Health Tracker", robots: { index: false, follow: false } };

const BADGE = "inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium";

const HEALTH_BADGES: Record<HealthStatus, { label: string; className: string }> = {
  attention: { label: "Needs attention", className: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300" },
  watch: { label: "Watch", className: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  ok: { label: "No concerns", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  limited: { label: "Limited data", className: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  unknown: { label: "Not enough data", className: "border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300" },
};

const SYNC_ISSUES: Partial<Record<SyncStatus, string>> = {
  stale: "Sync overdue",
  reconnect: "Must sign in again",
  pending: "First sync pending",
};

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <Panel>
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">{value}</p>
    </Panel>
  );
}

function UserRow({ user }: { user: AdminUserRow }) {
  const badge = HEALTH_BADGES[user.healthStatus];
  const syncIssue = SYNC_ISSUES[user.syncStatus];
  return (
    <tr className="align-top">
      <td className="py-3 pr-4">
        <p className="font-medium text-slate-900 dark:text-white">{user.displayName || user.email || user.id}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
      </td>
      <td className="py-3 pr-4">
        <span className={`${BADGE} ${badge.className}`}>{badge.label}</span>
        {user.flags.map((flag) => (
          <p key={flag.message} className="mt-1 text-xs text-slate-600 dark:text-slate-300">{flag.message}</p>
        ))}
        {user.note && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{user.note}</p>}
        {user.checked.length > 0 && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Checked: {user.checked.join(", ")}</p>}
      </td>
      <td className="py-3 pr-4 whitespace-nowrap">
        <p className="text-slate-700 dark:text-slate-200">{user.lastSyncedAt ? formatRelativeTime(user.lastSyncedAt.toISOString()) : "Never"}</p>
        {syncIssue && <p className="text-xs text-amber-700 dark:text-amber-300">{syncIssue}</p>}
      </td>
      <td className="py-3 pr-4 whitespace-nowrap text-slate-700 dark:text-slate-200">{user.lastDataDate ? formatShortDate(user.lastDataDate) : "None"}</td>
      <td className="py-3 whitespace-nowrap text-slate-700 dark:text-slate-200">{formatRelativeTime(user.createdAt.toISOString())}</td>
    </tr>
  );
}

export default async function AdminPage() {
  const { session, isAuthenticated } = await getAuthState();
  // A 404 rather than a 403, so the page does not reveal itself to other users.
  if (!isAuthenticated || !isAdmin(session)) notFound();

  const db = getDb();
  const overview = db ? await loadAdminOverview(db) : null;

  return (
    <main className="mx-auto max-w-6xl space-y-4 px-4 py-6 sm:px-6">
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">Admin</h1>

      {!overview ? (
        <Panel>
          <p className="text-sm text-slate-600 dark:text-slate-300">Set DATABASE_URL to see registered users. Without a database, no users are stored.</p>
        </Panel>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Registered users" value={overview.users.length} />
            <StatTile label="Needs attention" value={overview.attention} />
            <StatTile label="Watch" value={overview.watch} />
            <StatTile label="Sync or data issues" value={overview.syncIssues} />
          </div>

          <Panel>
            <PanelHeader
              icon={Users}
              iconClass="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
              title="Users"
              subtitle="Most concerning first. Automated wellness signals from wearable data, not a medical assessment. A clear status only covers what is listed as checked."
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <tr>
                    <th scope="col" className="py-2 pr-4 font-medium">User</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Status</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Last sync</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Latest data</th>
                    <th scope="col" className="py-2 font-medium">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {overview.users.map((user) => (
                    <UserRow key={user.id} user={user} />
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </main>
  );
}
