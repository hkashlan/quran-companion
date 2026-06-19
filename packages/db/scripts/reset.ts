// Reset (wipe all data from) a database — you choose LOCAL or PRODUCTION.
//
// "Reset" here means: TRUNCATE every application table in the `public` schema,
// restarting identity sequences. The schema and Drizzle migration history are
// left intact (the migrations table lives in the `drizzle` schema), so you do
// NOT need to re-run migrations afterwards — only the rows are removed.
//
// Target selection:
//   • local → reads DATABASE_URL
//   • prod  → reads PROD_DATABASE_URL, and refuses if it points at localhost
//
// Usage (interactive — prompts for target + confirmation):
//   pnpm --filter @quran/db db:reset
//
// Non-interactive (CI / scripted):
//   pnpm --filter @quran/db db:reset -- --target=local --yes
//   pnpm --filter @quran/db db:reset -- --target=prod  --yes
import { createInterface } from "node:readline/promises";
import { config } from "dotenv";
import { Pool } from "pg";

config({ path: ["../../.env", ".env"] });

type Target = "local" | "prod";

function parseArg(name: string): string | undefined {
	const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
	return hit?.split("=")[1]?.trim();
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

const rl = createInterface({ input: process.stdin, output: process.stdout });
// Map a closed input stream (EOF / Ctrl-D / piped input that ran out) to a
// clean abort instead of a raw "readline was closed" rejection.
const ask = (q: string) =>
	rl.question(q).catch(() => {
		throw new Error("No input received — aborted.");
	});

async function chooseTarget(): Promise<Target> {
	const fromArg = parseArg("target");
	if (fromArg === "local" || fromArg === "prod") return fromArg;
	if (fromArg) {
		throw new Error(`Invalid --target=${fromArg} (use "local" or "prod").`);
	}
	const answer = (
		await ask("Which database do you want to RESET? [local/prod]: ")
	)
		.trim()
		.toLowerCase();
	if (answer === "local" || answer === "l") return "local";
	if (answer === "prod" || answer === "p" || answer === "production") {
		return "prod";
	}
	throw new Error(`Unrecognized answer "${answer}" — expected local or prod.`);
}

function resolveUrl(target: Target): string {
	if (target === "prod") {
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
		return url;
	}
	const url = process.env.DATABASE_URL?.trim();
	if (!url) {
		throw new Error("DATABASE_URL is not set in .env — cannot reset local DB.");
	}
	return url;
}

const hostOf = (url: string) => url.replace(/.*@([^/?]+).*/, "$1");

async function main() {
	const target = await chooseTarget();
	const url = resolveUrl(target);
	const host = hostOf(url);

	const pool = new Pool({ connectionString: url, max: 1 });

	// Discover the app tables we'll wipe (public schema, excluding Drizzle's
	// migration bookkeeping which lives in the `drizzle` schema).
	const { rows } = await pool.query<{ table_name: string }>(
		`SELECT table_name FROM information_schema.tables
		  WHERE table_schema = 'public'
		    AND table_type = 'BASE TABLE'
		    AND table_name NOT LIKE '\\_\\_drizzle%'
		  ORDER BY table_name`,
	);
	const tables = rows.map((r) => r.table_name);

	if (tables.length === 0) {
		console.log(`No tables found in ${target} (${host}). Nothing to reset.`);
		await pool.end();
		await rl.close();
		return;
	}

	console.log(
		`\nTarget: ${target.toUpperCase()}  (host: ${host})\n` +
			`This will DELETE ALL ROWS from ${tables.length} tables:\n  ${tables.join(", ")}\n`,
	);

	// Confirmation gate. Production always requires typing the host back; --yes
	// only skips the prompt for local.
	// --confirm-host=<host> lets prod run non-interactively but still forces the
	// caller to echo the exact production host (so --yes alone can never nuke prod).
	const confirmHost = parseArg("confirm-host");
	if (!(hasFlag("yes") && target === "local")) {
		if (target === "prod") {
			console.log("⚠️  This is PRODUCTION and cannot be undone.");
			if (confirmHost !== undefined) {
				if (confirmHost !== host) {
					throw new Error(
						`--confirm-host="${confirmHost}" does not match "${host}" — aborted.`,
					);
				}
			} else {
				const typed = (
					await ask(`Type the host "${host}" to confirm: `)
				).trim();
				if (typed !== host) {
					throw new Error("Confirmation did not match — aborted.");
				}
			}
		} else {
			const typed = (await ask('Type "reset" to confirm: ')).trim().toLowerCase();
			if (typed !== "reset") {
				throw new Error("Confirmation did not match — aborted.");
			}
		}
	}

	const list = tables.map((t) => `"${t}"`).join(", ");
	await pool.query(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);

	console.log(`\n✓ Reset complete — ${tables.length} tables truncated on ${target} (${host}).`);
	await pool.end();
	await rl.close();
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error(`\n✗ ${err instanceof Error ? err.message : err}`);
		rl.close();
		process.exit(1);
	});
