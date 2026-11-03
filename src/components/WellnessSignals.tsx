import { Thermometer, TrendingUp } from "lucide-react";
import type { WellnessMarker, WellnessSignals as Signals } from "@/lib/types";

function MarkerList({ markers }: { markers: WellnessMarker[] }) {
  return (
    <ul className="mt-1.5 space-y-0.5 text-xs text-slate-700 dark:text-slate-300">
      {markers.map((m) => (
        <li key={m.metric}>
          <span className="font-medium capitalize">{m.metric}</span>: {m.detail}
        </li>
      ))}
    </ul>
  );
}

/** Shown only when a multi-day pattern is present; silence is the normal state. */
export function WellnessSignals({ signals, onAsk }: { signals?: Signals; onAsk: (text: string) => void }) {
  if (!signals || (!signals.illness && !signals.drift.length)) return null;
  const { illness, drift } = signals;
  const urgent = illness?.level === "attention";

  return (
    <section className="space-y-3" aria-label="Wellness signals">
      {illness && (
        <div
          className={`p-3.5 sm:p-4 rounded-2xl border ${
            urgent ? "bg-rose-500/10 border-rose-500/30" : "bg-amber-500/10 border-amber-500/30"
          }`}
        >
          <div className="flex items-start gap-3">
            <Thermometer className={`w-5 h-5 shrink-0 mt-0.5 ${urgent ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400"}`} />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Your body may be fighting something off</h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Several readings have shifted together for 2 or more nights. This often comes before a cold or flu, but stress, alcohol, travel or hard training can do the same.
              </p>
              <MarkerList markers={illness.markers} />
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">
                Take it easy and sleep well. If you feel unwell, or it continues, check with a doctor.
              </p>
              <button
                onClick={() => onAsk("What does my possible illness pattern mean and what should I do?")}
                className="mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
              >
                Ask the coach about this
              </button>
            </div>
          </div>
        </div>
      )}

      {drift.length > 0 && (
        <div className="p-3.5 sm:p-4 rounded-2xl border bg-sky-500/10 border-sky-500/30">
          <div className="flex items-start gap-3">
            <TrendingUp className="w-5 h-5 shrink-0 mt-0.5 text-sky-600 dark:text-sky-400" />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">A slow change over the last 3 months</h2>
              <MarkerList markers={drift} />
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">
                Not urgent, and often explained by routine or fitness changes. If it isn&apos;t, it&apos;s a good reason for a routine checkup.
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
