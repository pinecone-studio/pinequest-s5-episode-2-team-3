-- AI endpoints (/api/plan, /api/insight, /api/doctor, /api/drink-parse): requests per caller per hour.
-- The caller is a hash of the IP, never the IP itself; rows older than the last hour are cleared on use.
CREATE TABLE rate_limits (
  caller TEXT NOT NULL,
  route TEXT NOT NULL,
  hour TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(caller, route, hour)
);
