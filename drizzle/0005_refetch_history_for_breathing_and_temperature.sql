-- Re-fetch 90 days for everyone: breathing rate and skin temperature are now read, and the
-- 3-month comparison needs history older than the previous 30-day backfill.
UPDATE "users" SET "backfilled_at" = NULL;
