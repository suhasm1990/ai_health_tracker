import { CalendarCheck, Crown, Flag, Flame, Footprints, Lock, Medal, Mountain, Rocket, Star, Target, Trophy, Zap, type LucideIcon } from "lucide-react";
import type { Badge, BadgeIcon, BadgeTier } from "@/lib/goals/types";
import { formatShortDate } from "@/lib/utils";

const ICONS: Record<BadgeIcon, LucideIcon> = {
  footprints: Footprints,
  flag: Flag,
  flame: Flame,
  medal: Medal,
  trophy: Trophy,
  mountain: Mountain,
  zap: Zap,
  crown: Crown,
  star: Star,
  target: Target,
  rocket: Rocket,
  calendar: CalendarCheck,
};

const TIERS: Record<BadgeTier, { medal: string; ring: string; label: string }> = {
  bronze: { medal: "from-amber-600 via-orange-500 to-amber-800", ring: "ring-amber-600/40", label: "Bronze" },
  silver: { medal: "from-slate-300 via-slate-100 to-slate-400 text-slate-700", ring: "ring-slate-400/50", label: "Silver" },
  gold: { medal: "from-yellow-300 via-amber-400 to-yellow-600", ring: "ring-amber-400/60", label: "Gold" },
  legend: { medal: "from-fuchsia-500 via-violet-500 to-indigo-600", ring: "ring-violet-500/50", label: "Legend" },
};

const SIZES = {
  sm: { box: "w-9 h-9", icon: "w-4 h-4", width: "w-14" },
  md: { box: "w-12 h-12", icon: "w-5 h-5", width: "w-[68px]" },
};

/** A medal: full colour once earned; locked ones show how close they are. */
export function BadgeMedal({ badge, size = "md", isNew = false }: { badge: Badge; size?: keyof typeof SIZES; isNew?: boolean }) {
  const Icon = ICONS[badge.icon];
  const tier = TIERS[badge.tier];
  const s = SIZES[size];
  const pct = Math.round((badge.progress ?? 0) * 100);
  const title = badge.earned
    ? `${badge.name} (${tier.label}) · earned ${badge.earnedOn ? formatShortDate(badge.earnedOn) : ""}\n${badge.description}`
    : `${badge.name} (locked${badge.progress !== null ? `, ${pct}%` : ""})\n${badge.description}`;

  return (
    <div className={`flex flex-col items-center text-center ${s.width} shrink-0`} title={title}>
      {badge.earned ? (
        <div className={`relative ${s.box} rounded-full bg-gradient-to-br ${tier.medal} text-white flex items-center justify-center shadow-md ring-2 ring-offset-2 ring-offset-white dark:ring-offset-slate-900 ${tier.ring} ${isNew ? "animate-bounce" : ""}`}>
          <Icon className={`${s.icon} drop-shadow`} />
          <span className="absolute inset-0 rounded-full bg-gradient-to-tr from-transparent via-white/25 to-transparent pointer-events-none" />
        </div>
      ) : (
        <div
          className={`relative ${s.box} rounded-full flex items-center justify-center`}
          style={{ background: `conic-gradient(rgb(16 185 129) ${pct}%, rgb(148 163 184 / 0.25) 0)` }}
        >
          <div className="absolute inset-[3px] rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500">
            {pct > 0 ? <Icon className={`${s.icon} opacity-60`} /> : <Lock className="w-3.5 h-3.5" />}
          </div>
        </div>
      )}
      <span className={`mt-1.5 text-[10px] leading-tight font-medium line-clamp-2 ${badge.earned ? "text-slate-700 dark:text-slate-200" : "text-slate-400 dark:text-slate-500"}`}>{badge.name}</span>
    </div>
  );
}

/** Earned badges first (newest first), then locked ones by how close they are. */
export function sortBadges(badges: Badge[]): Badge[] {
  return [...badges].sort((a, b) => {
    if (a.earned !== b.earned) return a.earned ? -1 : 1;
    if (a.earned) return (b.earnedOn ?? "").localeCompare(a.earnedOn ?? "");
    return (b.progress ?? 0) - (a.progress ?? 0);
  });
}

export function BadgeRow({ badges, newIds, size = "md" }: { badges: Badge[]; newIds?: Set<string>; size?: keyof typeof SIZES }) {
  const earned = badges.filter((b) => b.earned).length;
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-2">
        <span>Badges</span>
        <span>
          {earned} of {badges.length} earned
        </span>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pt-1.5 pb-1 -mx-1 px-1">
        {sortBadges(badges).map((b) => (
          <BadgeMedal key={b.id} badge={b} size={size} isNew={newIds?.has(b.id)} />
        ))}
      </div>
    </div>
  );
}
