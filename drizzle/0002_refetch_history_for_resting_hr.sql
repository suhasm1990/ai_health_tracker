-- Resting heart rate now comes from Google's daily resting value instead of the day's minimum,
-- and sleep from non-Fitbit sources is read when it has no summary. Clearing the marker makes the
-- next sync or dashboard load re-fetch each user's 30 days so baselines are not mixed.
UPDATE "users" SET "backfilled_at" = NULL;
