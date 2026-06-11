import { config as loadEnv } from "dotenv";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

// Populate process.env for the dev SSR runtime from the monorepo-root .env
// (vite does not load .env into process.env for SSR by itself). In production
// the host (Vercel) provides these, so the missing file is harmless.
loadEnv({ path: ["../../.env", ".env"] });

export default defineConfig({
	resolve: { tsconfigPaths: true },
	plugins: [
		nitro(),
		tailwindcss(),
		tanstackStart(),
		viteReact({ babel: { presets: [reactCompilerPreset()] } }),
	],
});
