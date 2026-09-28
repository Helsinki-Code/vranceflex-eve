// Runs database migrations as part of a Vercel production build, before
// `next build`, so new tables and columns exist before the new code serves
// traffic. Vercel's "Sensitive" variables (like DATABASE_URL) can't be pulled
// to a laptop, but they are available here at build time.
//
// Preview and local builds skip this so they never migrate the production
// database. A failed migration fails the build, which keeps the previous
// deployment live.
import { execSync } from "node:child_process";

if (process.env.VERCEL_ENV !== "production") {
  console.log(`[migrate] Skipping migrations (VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"}).`);
  process.exit(0);
}
if (!process.env.DATABASE_URL?.trim()) {
  console.error("[migrate] DATABASE_URL is not set for this production build.");
  process.exit(1);
}
console.log("[migrate] Applying database migrations…");
execSync("npx drizzle-kit migrate", { stdio: "inherit" });
console.log("[migrate] Done.");
