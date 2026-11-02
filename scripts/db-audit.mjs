// Usage: node scripts/db-audit.mjs  (needs DATABASE_URL in .env.local)
// Read-only coverage audit. Prints counts per anonymised user only: no names, emails or health values.
import { readFileSync } from "node:fs";
import postgres from "postgres";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const url = env.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
if (!url) throw new Error("DATABASE_URL not found in .env.local");

const sql = postgres(url, { prepare: false, max: 1 });
try {
  await sql.begin("read only", async (tx) => {
    const users = await tx`
      select u.id,
        row_number() over (order by u.created_at) as n,
        extract(day from now() - u.created_at)::int as joined_days_ago,
        round(extract(epoch from now() - u.last_synced_at) / 3600)::int as last_sync_hours_ago,
        u.backfilled_at is not null as backfilled,
        u.refresh_token_enc is not null as has_token,
        u.time_zone is not null as has_tz
      from users u order by u.created_at`;
    const label = new Map(users.map((u) => [u.id, `User ${String.fromCharCode(64 + Number(u.n))}`]));

    console.log("== users ==");
    for (const u of users) {
      const { id, n, ...rest } = u;
      console.log(label.get(id), rest);
    }

    const coverage = await tx`
      select user_id, count(*)::int as days, min(date)::text as first, max(date)::text as last,
        count(*) filter (where steps > 0)::int as steps,
        count(*) filter (where resting_heart_rate is not null)::int as rhr,
        count(*) filter (where heart_rate_variability is not null)::int as hrv,
        count(*) filter (where sleep_minutes > 0)::int as sleep,
        count(*) filter (where readiness_score is not null)::int as readiness,
        count(*) filter (where sleep_minutes = 0 and jsonb_array_length(coalesce(data->'sleepStages', '[]'::jsonb)) > 0)::int as stages_but_no_sleep,
        count(*) filter (where resting_heart_rate is not null and resting_heart_rate < 40)::int as rhr_below_40,
        count(*) filter (where steps = 0 and sleep_minutes = 0 and resting_heart_rate is null)::int as empty_days,
        count(*) filter (where date >= current_date - 14)::int as days_last_14
      from daily_metrics group by user_id`;
    console.log("\n== daily_metrics coverage (day counts) ==");
    for (const { user_id, ...row } of coverage) console.log(label.get(user_id) ?? "Unknown user", row);

    const workouts = await tx`
      select user_id, count(*)::int as workouts,
        count(distinct data->>'sourceDevice')::int as sources,
        array_agg(distinct coalesce(data->>'sourceDevice', '(none)')) as source_names
      from workouts group by user_id`;
    console.log("\n== workouts ==");
    for (const { user_id, ...row } of workouts) console.log(label.get(user_id) ?? "Unknown user", row);

    const dupes = await tx`
      select a.user_id, count(*)::int as overlapping_pairs
      from workouts a join workouts b on a.user_id = b.user_id and a.id < b.id
        and (a.data->>'startIso')::timestamptz < (b.data->>'endIso')::timestamptz
        and (b.data->>'startIso')::timestamptz < (a.data->>'endIso')::timestamptz
      group by a.user_id`;
    console.log("\n== overlapping workouts (likely duplicates) ==");
    for (const { user_id, ...row } of dupes) console.log(label.get(user_id) ?? "Unknown user", row);
    if (!dupes.length) console.log("none");
  });
} finally {
  await sql.end();
}
