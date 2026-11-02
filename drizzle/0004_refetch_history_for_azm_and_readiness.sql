-- Active Zone Minutes counted cardio/peak minutes double twice, and readiness scored days without HRV
-- above measured ones. Clearing the marker re-fetches each user's 30 days so stored values use the fixes.
UPDATE "users" SET "backfilled_at" = NULL;
