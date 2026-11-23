import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Clock,
  Eye,
  Footprints,
  Gauge,
  HeartPulse,
  Moon,
  RefreshCw,
  Users,
  Waves,
  type LucideIcon,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Panel } from "@/components/ui/Panel";
import { hasSyncIssue, type AdminFlag, type AdminMetric, type AdminOverview, type AdminUserRow, type HealthStatus, type SyncStatus } from "@/lib/admin";
import { formatRelativeTime, formatShortDate } from "@/lib/utils";

export type AdminFilter = "all" | "attention" | "watch" | "sync" | "ok" | "other";

export const ADMIN_FILTERS: AdminFilter[] = ["all", "attention", "watch", "sync", "ok", "other"];

const FILTER_LABELS: Record<AdminFilter, string> = {
  all: "All",
  attention: "Needs attention",
  watch: "Watch",
  sync: "Sync issues",
  ok: "All clear",
  other: "Not assessed",
};

const MATCHES: Record<AdminFilter, (u: AdminUserRow) => boolean> = {
  all: () => true,
  attention: (u) => u.healthStatus === "attention",
  watch: (u) => u.healthStatus === "watch",
  sync: hasSyncIssue,
  ok: (u) => u.healthStatus === "ok",
  other: (u) => u.healthStatus === "limited" || u.healthStatus === "unknown",
};

const BADGE = "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold";

const HEALTH_BADGES: Record<HealthStatus, { label: string; className: string; icon: LucideIcon }> = {
  attention: { label: "Needs attention", icon: AlertTriangle, className: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300" },
  watch: { label: "Watch", icon: Eye, className: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  ok: { label: "All clear", icon: CheckCircle2, className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  limited: { label: "Limited data", icon: Waves, className: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  unknown: { label: "No assessment", icon: Clock, className: "border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300" },
};

/** What the admin should do about each sync state. */
const SYNC_ISSUES: Partial<Record<SyncStatus, { label: string; action: string }>> = {
  stale: { label: "Sync overdue", action: "The nightly sync has not succeeded in over a day. Their Google access may have been revoked." },
  reconnect: { label: "Signed out", action: "No stored Google access, so nightly sync is off until they sign in again." },
  pending: { label: "First sync pending", action: "Joined recently and the first import has not finished yet." },
};

const TILE_TONES = {
  rose: { dot: "bg-rose-500", value: "text-rose-600 dark:text-rose-400", ring: "hover:border-rose-400/60 dark:hover:border-rose-500/50" },
  amber: { dot: "bg-amber-500", value: "text-amber-600 dark:text-amber-400", ring: "hover:border-amber-400/60 dark:hover:border-amber-500/50" },
  orange: { dot: "bg-orange-500", value: "text-orange-600 dark:text-orange-400", ring: "hover:border-orange-400/60 dark:hover:border-orange-500/50" },
  emerald: { dot: "bg-emerald-500", value: "text-emerald-600 dark:text-emerald-400", ring: "hover:border-emerald-400/60 dark:hover:border-emerald-500/50" },
} as const;

function SummaryTile({ label, value, total, tone, filter, active }: { label: string; value: number; total: number; tone: keyof typeof TILE_TONES; filter: AdminFilter; active: boolean }) {
  const t = TILE_TONES[tone];
  return (
    <Link
      href={active ? "/admin" : `/admin?status=${filter}`}
      aria-current={active ? "true" : undefined}
      className={`group block rounded-2xl border bg-white/80 p-3.5 shadow-xs transition-colors dark:bg-slate-900/60 sm:p-4 ${t.ring} ${
        active ? "border-slate-400 ring-1 ring-slate-400/40 dark:border-slate-500" : "border-slate-200 dark:border-slate-800"
      }`}
    >
      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
        <span className={`h-2 w-2 rounded-full ${value ? t.dot : "bg-slate-300 dark:bg-slate-700"}`} />
        {label}
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className={`text-2xl font-bold tabular-nums sm:text-3xl ${value ? t.value : "text-slate-400 dark:text-slate-600"}`}>{value}</span>
        <span className="text-xs text-slate-400 dark:text-slate-500">of {total}</span>
      </div>
    </Link>
  );
}

function FlagLine({ flag }: { flag: AdminFlag }) {
  const Icon = flag.longTerm ? Clock : flag.severity === "attention" ? AlertTriangle : Eye;
  const color = flag.severity === "attention" ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400";
  return (
    <li className="flex gap-2 text-sm text-slate-700 dark:text-slate-200">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${color}`} aria-hidden />
      <span className="min-w-0">
        {flag.message}
        {flag.longTerm && <span className="ml-1.5 text-xs text-slate-400 dark:text-slate-500">ongoing</span>}
      </span>
    </li>
  );
}

interface MetricSpec {
  label: string;
  icon: LucideIcon;
  format: (v: number) => string;
  /** Change from usual, in the direction that is worse, as a share or absolute amount that counts as notable. */
  notable: (recent: number, usual: number) => boolean;
  delta: (recent: number, usual: number) => string;
}

const hoursOf = (minutes: number) => `${(minutes / 60).toFixed(1)}h`;
const signed = (n: number, unit = "") => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n).toLocaleString("en-US")}${unit}`;
const pctChange = (recent: number, usual: number) => Math.round(((recent - usual) / usual) * 100);

const METRICS: { key: "sleepMinutes" | "restingHeartRate" | "heartRateVariability" | "steps"; spec: MetricSpec }[] = [
  {
    key: "sleepMinutes",
    spec: {
      label: "Sleep",
      icon: Moon,
      format: hoursOf,
      notable: (r, u) => u - r >= 45,
      delta: (r, u) => `${signed(Number(((r - u) / 60).toFixed(1)), "h")}`,
    },
  },
  {
    key: "restingHeartRate",
    spec: { label: "Resting HR", icon: HeartPulse, format: (v) => `${v} bpm`, notable: (r, u) => r - u >= 3, delta: (r, u) => signed(r - u) },
  },
  {
    key: "heartRateVariability",
    spec: { label: "HRV", icon: Activity, format: (v) => `${v} ms`, notable: (r, u) => r / u <= 0.85, delta: (r, u) => signed(pctChange(r, u), "%") },
  },
  {
    key: "steps",
    spec: { label: "Steps", icon: Footprints, format: (v) => v.toLocaleString("en-US"), notable: (r, u) => r / u <= 0.7, delta: (r, u) => signed(pctChange(r, u), "%") },
  },
];

function MetricCell({ spec, metric }: { spec: MetricSpec; metric: AdminMetric }) {
  const { recent, usual } = metric;
  const notable = recent !== null && usual !== null && spec.notable(recent, usual);
  return (
    <div className="min-w-0 rounded-xl bg-slate-50 px-2.5 py-2 dark:bg-slate-800/40">
      <div className="flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
        <spec.icon className="h-3 w-3" aria-hidden />
        {spec.label}
      </div>
      <div className="mt-0.5 truncate text-sm font-semibold tabular-nums text-slate-900 dark:text-white">{recent !== null ? spec.format(recent) : "—"}</div>
      <div className={`truncate text-[11px] tabular-nums ${notable ? "font-semibold text-amber-600 dark:text-amber-400" : "text-slate-400 dark:text-slate-500"}`}>
        {recent !== null && usual !== null ? `${spec.delta(recent, usual)} vs ${spec.format(usual)}` : usual === null && recent !== null ? "No usual yet" : "No readings"}
      </div>
    </div>
  );
}

function ReadinessCell({ value }: { value: number | null }) {
  const tone =
    value === null ? "text-slate-900 dark:text-white" : value < 50 ? "text-rose-600 dark:text-rose-400" : value < 70 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400";
  return (
    <div className="col-span-2 flex min-w-0 items-center justify-between rounded-xl bg-slate-50 px-2.5 py-2 dark:bg-slate-800/40 sm:col-span-1 sm:block">
      <div className="flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
        <Gauge className="h-3 w-3" aria-hidden />
        Readiness
      </div>
      <div className={`mt-0.5 text-sm font-semibold tabular-nums ${tone}`}>{value ?? "—"}</div>
      <div className="text-[11px] text-slate-400 dark:text-slate-500">Latest day</div>
    </div>
  );
}

/** One square per completed day, so gaps in what the device sends are visible at a glance. */
function DataStrip({ days }: { days: AdminUserRow["recentDays"] }) {
  const withData = days.filter((d) => d.hasData).length;
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-[3px]" role="img" aria-label={`Device data on ${withData} of the last ${days.length} days`}>
        {days.map((d) => (
          <span
            key={d.date}
            title={`${formatShortDate(d.date)}: ${d.hasData ? "data" : "no data"}`}
            className={`h-3 w-2 rounded-[2px] ${d.hasData ? "bg-emerald-500/80 dark:bg-emerald-400/70" : "bg-slate-200 dark:bg-slate-700/70"}`}
          />
        ))}
      </div>
      <span className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
        {withData}/{days.length} days
      </span>
    </div>
  );
}

function initialsOf(user: AdminUserRow) {
  const source = user.displayName || user.email || "?";
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (user.displayName && parts[1] ? parts[1][0] : "")).toUpperCase();
}

function Meta({ label, children, warn }: { label: string; children: React.ReactNode; warn?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-slate-400 dark:text-slate-500">{label}</dt>
      <dd className={`truncate text-xs font-medium ${warn ? "text-orange-600 dark:text-orange-400" : "text-slate-700 dark:text-slate-200"}`}>{children}</dd>
    </div>
  );
}

function UserCard({ user }: { user: AdminUserRow }) {
  const badge = HEALTH_BADGES[user.healthStatus];
  const syncIssue = SYNC_ISSUES[user.syncStatus];
  const accent =
    user.healthStatus === "attention" ? "before:bg-rose-500" : user.healthStatus === "watch" ? "before:bg-amber-500" : user.healthStatus === "ok" ? "before:bg-emerald-500" : "before:bg-slate-300 dark:before:bg-slate-700";

  return (
    <li
      className={`relative overflow-hidden rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-xs before:absolute before:inset-y-0 before:left-0 before:w-1 dark:border-slate-800 dark:bg-slate-900/60 sm:p-5 ${accent}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 text-xs font-bold text-white">{initialsOf(user)}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p className="min-w-0 truncate font-semibold text-slate-900 dark:text-white">{user.displayName || user.email || user.id}</p>
            <span className={`${BADGE} ${badge.className}`}>
              <badge.icon className="h-3 w-3" aria-hidden />
              {badge.label}
            </span>
          </div>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
        </div>
      </div>

      {(user.flags.length > 0 || user.note || syncIssue || user.dataStopped) && (
        <ul className="mt-3 space-y-1.5">
          {user.flags.map((flag) => (
            <FlagLine key={flag.message} flag={flag} />
          ))}
          {(syncIssue || user.dataStopped) && (
            <li className="flex gap-2 text-sm text-slate-700 dark:text-slate-200">
              <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400" aria-hidden />
              <span className="min-w-0">{syncIssue ? `${syncIssue.label}: ${syncIssue.action}` : "Device stopped sending data, though sync is running. They may not be wearing it."}</span>
            </li>
          )}
          {user.note && <li className="pl-6 text-xs text-slate-500 dark:text-slate-400">{user.note}</li>}
        </ul>
      )}

      {user.lastDataDate && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {METRICS.map(({ key, spec }) => (
            <MetricCell key={key} spec={spec} metric={user.metrics[key]} />
          ))}
          <ReadinessCell value={user.metrics.readiness} />
        </div>
      )}

      <div className="mt-3 flex flex-col gap-3 border-t border-slate-100 pt-3 dark:border-slate-800 sm:flex-row sm:items-end sm:justify-between">
        <dl className="grid grid-cols-3 gap-3 sm:flex sm:gap-6">
          <Meta label="Last sync" warn={user.syncStatus === "stale" || user.syncStatus === "reconnect"}>
            {user.lastSyncedAt ? formatRelativeTime(user.lastSyncedAt.toISOString()) : "Never"}
          </Meta>
          <Meta label="Latest data" warn={user.dataStopped}>
            {user.lastDataDate ? formatShortDate(user.lastDataDate) : "None"}
          </Meta>
          <Meta label="Joined">{formatRelativeTime(user.createdAt.toISOString())}</Meta>
        </dl>
        <DataStrip days={user.recentDays} />
      </div>

      {(user.checked.length > 0 || user.receives.length > 0) && (
        <details className="group mt-3 text-xs text-slate-500 dark:text-slate-400">
          <summary className="flex cursor-pointer list-none items-center gap-1 font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white [&::-webkit-details-marker]:hidden">
            <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden />
            What was checked
          </summary>
          <div className="mt-2 space-y-1 pl-4.5">
            <p>
              <span className="font-medium text-slate-600 dark:text-slate-300">Compared with their usual:</span> {user.checked.length ? user.checked.join(", ") : "nothing yet"}
            </p>
            {user.receives.length > 0 && (
              <p>
                <span className="font-medium text-slate-600 dark:text-slate-300">Device sends:</span> {user.receives.join(", ")}
              </p>
            )}
            {user.notReceived.length > 0 && (
              <p className="text-amber-700 dark:text-amber-300">
                <span className="font-medium">Not received in 14 days:</span> {user.notReceived.join(", ")}
              </p>
            )}
          </div>
        </details>
      )}
    </li>
  );
}

export function AdminDashboard({ overview, filter }: { overview: AdminOverview; filter: AdminFilter }) {
  const total = overview.users.length;
  const shown = overview.users.filter(MATCHES[filter]);
  const counts = Object.fromEntries(ADMIN_FILTERS.map((f) => [f, overview.users.filter(MATCHES[f]).length])) as Record<AdminFilter, number>;

  return (
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
      <header className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Dashboard
          </Link>
          <ThemeToggle />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Admin</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {total} {total === 1 ? "user" : "users"} · {overview.active} sent data in the last 2 days · last sync{" "}
            {overview.lastSyncAt ? formatRelativeTime(overview.lastSyncAt.toISOString()).toLowerCase() : "never"}
          </p>
        </div>
      </header>

      <section aria-label="Summary" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile label="Needs attention" value={overview.attention} total={total} tone="rose" filter="attention" active={filter === "attention"} />
        <SummaryTile label="Watch" value={overview.watch} total={total} tone="amber" filter="watch" active={filter === "watch"} />
        <SummaryTile label="Sync issues" value={overview.syncIssues} total={total} tone="orange" filter="sync" active={filter === "sync"} />
        <SummaryTile label="All clear" value={overview.ok} total={total} tone="emerald" filter="ok" active={filter === "ok"} />
      </section>

      <section aria-labelledby="users-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="users-heading" className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
            <Users className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
            Users
            <span className="text-sm font-normal text-slate-400">{filter === "all" ? "most concerning first" : FILTER_LABELS[filter].toLowerCase()}</span>
          </h2>
        </div>
        <nav aria-label="Filter users" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {ADMIN_FILTERS.map((f) => {
            const active = f === filter;
            return (
              <Link
                key={f}
                href={f === "all" ? "/admin" : `/admin?status=${f}`}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600"
                }`}
              >
                {FILTER_LABELS[f]} <span className="tabular-nums opacity-60">{counts[f]}</span>
              </Link>
            );
          })}
        </nav>

        {shown.length ? (
          <ul className="space-y-3">
            {shown.map((user) => (
              <UserCard key={user.id} user={user} />
            ))}
          </ul>
        ) : (
          <Panel>
            <p className="text-sm text-slate-500 dark:text-slate-400">No users match this filter.</p>
          </Panel>
        )}
      </section>

      <footer className="space-y-1.5 border-t border-slate-200 pt-4 text-xs leading-relaxed text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <p>
          <span className="font-medium text-slate-600 dark:text-slate-300">How status works.</span> Each user is compared with their own last 30 days. Watch means one body
          system (sleep, heart, or activity) changed on at least 2 of the last 3 days, or a habit or 3-month trend is worth a conversation. Needs attention means a large
          change, or changes in two systems at once. Metrics show the last 7 days against the 30 before.
        </p>
        <p>Automated wellness signals from wearable data, not a medical assessment. No status here can rule out heart disease or an emergency, and All clear only covers what was checked.</p>
      </footer>
    </main>
  );
}
