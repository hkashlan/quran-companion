// Apply pending Drizzle migrations to the PRODUCTION database.
//
// Reads PROD_DATABASE_URL (NOT DATABASE_URL) so it can never accidentally run
// against the local/dev database, and refuses outright if it points at
// localhost. Set PROD_DATABASE_URL in the repo-root .env first.
//
//   pnpm --filter @quran/db db:migrate:prod
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

config({ path: ["../../.env", ".env"] });

const url = process.env.PROD_DATABASE_URL?.trim();
if (!url) {
	throw new Error(
		"PROD_DATABASE_URL is not set in .env — add the production connection string first.",
	);
}
if (/localhost|127\.0\.0\.1/.test(url)) {
	throw new Error(
		"Refusing to run: PROD_DATABASE_URL points to localhost, not production.",
	);
}

const host = url.replace(/.*@([^/?]+).*/, "$1");
console.log(`Applying migrations to production (${host})…`);

const pool = new Pool({ connectionString: url, max: 1 });
const db = drizzle(pool);
await migrate(db, { migrationsFolder: "./drizzle" });
await pool.end();

console.log("✓ Production migrations applied.");
process.exit(0);
