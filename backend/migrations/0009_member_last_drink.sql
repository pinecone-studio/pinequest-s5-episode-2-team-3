-- When each member last drank that day, so the family hears when someone under a doctor's limit has
-- gone hours without a drink (shared/family.ts familyAlerts). Null until a phone that sends it reports.
ALTER TABLE member_days ADD COLUMN last_drink_at TEXT;
