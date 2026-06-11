import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: [".env.local", ".env", "../../.env"] });

export default defineConfig({
	out: "./drizzle",
	schema: ["./src/tables/**/*.ts"],
	dialect: "postgresql",
	dbCredentials: {
		url: process.env.DATABASE_URL ?? "",
	},
});
