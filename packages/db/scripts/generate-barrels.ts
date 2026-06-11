/**
 * Regenerates src/tables/schema.gen.ts — a barrel that re-exports every
 * `*.drizzle.ts` in src/tables except the auth schema (imported as a namespace
 * directly in db.ts). Run after adding/removing a table file:
 *
 *   pnpm --filter @quran/db db:barrels
 */
import { readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const TABLES_DIR = join(root, "src/tables");
const EXCLUDES = new Set(["schema.gen.ts", "auth.drizzle.ts"]);

const files = readdirSync(TABLES_DIR)
	.filter((f) => f.endsWith(".drizzle.ts") && !EXCLUDES.has(f))
	.sort();

const banner =
	"// @generated — do not edit manually. Run `pnpm --filter @quran/db db:barrels`\n" +
	"// Re-exports every domain table module (auth.drizzle is imported as a namespace\n" +
	"// directly in db.ts and is intentionally excluded here).\n\n";

const body = files.map((f) => `export * from "./${f}";`).join("\n") + "\n";

writeFileSync(join(TABLES_DIR, "schema.gen.ts"), banner + body, "utf8");
console.log(`schema.gen.ts — ${files.length} table modules`);
