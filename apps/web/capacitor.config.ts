import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor wrapper config. The native shells are added with
 * `npx cap add android` / `npx cap add ios` (those folders are gitignored).
 *
 * Recommended: LIVE mode — set CAPACITOR_SERVER_URL to the deployed PWA origin
 * before `npx cap sync`, so the shell loads the latest web build (and Capgo
 * pushes OTA bundles). Without it, the bundled `capacitor-www` shell is shown.
 *
 * See docs/CAPACITOR.md for the full runbook.
 */
const serverUrl = process.env.CAPACITOR_SERVER_URL;

const config: CapacitorConfig = {
	appId: "com.hkashlan.qurancompanion",
	appName: "Quran Companion",
	webDir: "capacitor-www",
	server: {
		...(serverUrl ? { url: serverUrl } : {}),
		androidScheme: "https",
	},
	plugins: {
		CapacitorUpdater: { autoUpdate: true },
		PushNotifications: { presentationOptions: ["badge", "sound", "alert"] },
	},
};

export default config;
