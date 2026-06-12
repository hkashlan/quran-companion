import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor wrapper config (Phase 5). The native shells are added with
 * `npx cap add android` / `npx cap add ios` (those folders are gitignored).
 *
 * Two ways to run:
 *  - Bundled: point `webDir` at the built PWA (`vite build` → `.output/public`)
 *    and `npx cap copy`.
 *  - Live (recommended for the Vercel-hosted PWA + OTA): set `server.url` to the
 *    deployed origin so the shell loads the latest web build, and use Capgo for
 *    OTA of the bundled fallback.
 *
 * See docs/CAPACITOR.md for the full runbook.
 */
const config: CapacitorConfig = {
	appId: "com.hkashlan.qurancompanion",
	appName: "Quran Companion",
	webDir: ".output/public",
	server: {
		// For live mode, set this to your Vercel URL (or comment out for bundled):
		// url: "https://quran-companion.vercel.app",
		androidScheme: "https",
	},
	plugins: {
		// Capgo OTA live updates (free tier). Token + setup in docs/CAPACITOR.md.
		CapacitorUpdater: {
			autoUpdate: true,
		},
		PushNotifications: {
			presentationOptions: ["badge", "sound", "alert"],
		},
	},
};

export default config;
