-- Workouts were stored under ids that depended on list position, and the same workout could come
-- from two sources, so copies piled up. Keeps one row of each group of workouts that overlap by more
-- than half of the shorter one (the same rule new fetches use); new syncs replace each day's rows.
DELETE FROM "workouts" AS b
USING "workouts" AS a
WHERE a."user_id" = b."user_id"
  AND a."id" < b."id"
  AND LEAST((a."data"->>'endIso')::timestamptz, (b."data"->>'endIso')::timestamptz)
    - GREATEST((a."data"->>'startIso')::timestamptz, (b."data"->>'startIso')::timestamptz)
    > 0.5 * LEAST(
      (a."data"->>'endIso')::timestamptz - (a."data"->>'startIso')::timestamptz,
      (b."data"->>'endIso')::timestamptz - (b."data"->>'startIso')::timestamptz
    );
