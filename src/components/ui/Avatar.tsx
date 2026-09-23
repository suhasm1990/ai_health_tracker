"use client";

import { useEffect, useState } from "react";
import type { UserProfile } from "@/lib/types";

const SIZES = { sm: "w-7 h-7 text-xs", md: "w-8 h-8 text-xs" } as const;

/** Google avatar with an initial-letter fallback when the image cannot load. */
export function Avatar({ user, size = "sm", className = "" }: { user?: UserProfile; size?: keyof typeof SIZES; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [user?.avatarUrl]);

  const initial = (user?.displayName || user?.email || "U").charAt(0).toUpperCase();
  const title = user?.email ? `${user.displayName} (${user.email})` : user?.displayName || "Connected Google User";

  return (
    <div
      title={title}
      className={`${SIZES[size]} rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 ring-2 ring-emerald-500/30 flex items-center justify-center font-bold text-white shadow-xs shrink-0 overflow-hidden ${className}`}
    >
      {user?.avatarUrl && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote Google avatar, no optimisation needed
        <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="w-full h-full object-cover" />
      ) : (
        initial
      )}
    </div>
  );
}
