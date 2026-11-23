import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ADMIN_FILTERS, AdminDashboard, type AdminFilter } from "@/components/admin/AdminDashboard";
import { Panel } from "@/components/ui/Panel";
import { isAdmin, loadAdminOverview } from "@/lib/admin";
import { getAuthState } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Admin | AI Health Tracker", robots: { index: false, follow: false } };

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { session, isAuthenticated } = await getAuthState();
  // A 404 rather than a 403, so the page does not reveal itself to other users.
  if (!isAuthenticated || !isAdmin(session)) notFound();

  const { status } = await searchParams;
  const filter: AdminFilter = ADMIN_FILTERS.find((f) => f === status) ?? "all";
  const db = getDb();
  const overview = db ? await loadAdminOverview(db) : null;

  if (!overview) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <h1 className="mb-4 text-2xl font-bold text-slate-900 dark:text-white">Admin</h1>
        <Panel>
          <p className="text-sm text-slate-600 dark:text-slate-300">Set DATABASE_URL to see registered users. Without a database, no users are stored.</p>
        </Panel>
      </main>
    );
  }
  return <AdminDashboard overview={overview} filter={filter} />;
}
