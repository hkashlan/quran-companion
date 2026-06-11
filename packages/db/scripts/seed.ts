/**
 * Dev seed — placeholder for Phase 1. Run with:
 *   pnpm --filter @quran/db db:seed
 *
 * Note: users must be created through better-auth (so credentials land in the
 * `account` table); seed domain rows referencing those user ids afterwards.
 */
import { db } from "../src/db.ts";

async function main() {
	console.log("seed: connected", db ? "ok" : "no db");
	console.log("seed: nothing to do yet (Phase 1). See MIGRATION_PLAN.md.");
}

main().then(() => process.exit(0));
