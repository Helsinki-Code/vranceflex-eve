import { sql } from "drizzle-orm";
import { getDatabase } from "../database";

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();

// Never point these suites at a real dev/production database by accident.
if (testDatabaseUrl && !/test/i.test(testDatabaseUrl)) {
  throw new Error(
    "TEST_DATABASE_URL must point at a database whose name contains 'test' as a safety guard.",
  );
}

export const hasTestDatabase = Boolean(testDatabaseUrl);

if (testDatabaseUrl) {
  process.env.DATABASE_URL = testDatabaseUrl;
}

const tablesToTruncate = [
  "delivery_jobs",
  "outreach_messages",
  "outreach_sequences",
  "inbound_replies",
  "provider_events",
  "suppression_entries",
  "usage_ledger",
  "audit_events",
  "leads",
  "icp_profiles",
  "campaign_executions",
  "campaigns",
  "organization_invites",
  "organization_billing",
  "organization_sending_settings",
  "auth_sessions",
  "auth_challenges",
  "organization_memberships",
  "organizations",
  "users",
];

export async function truncateAllTables() {
  if (!hasTestDatabase) return;
  const database = getDatabase();
  await database.execute(
    sql.raw(`truncate table ${tablesToTruncate.map((name) => `"${name}"`).join(", ")} cascade`),
  );
}
