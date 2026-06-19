import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor wrapper config. The native shells are added with
 * `npx cap add android` / `npx cap add ios` (those folders are gitignored).
 *
 * LIVE mode — set CAPACITOR_SERVER_URL to the deployed PWA origin before
 * `npx cap sync`, so the shell loads the latest web build straight from the
 * server. Because the app loads the remote origin on every launch, each Vercel
 * deploy is effectively an instant, free over-the-air update — no separate OTA
 * service is needed. A new store binary is only required when native code or
 * plugins change. Without CAPACITOR_SERVER_URL the bundled `capacitor-www`
 * shell (a loading screen) is shown.
 *
 * `server.errorPath` points at a local page bundled in capacitor-www, shown
 * when the remote origin can't be reached (e.g. offline) instead of a blank
 * white webview.
 *
 * See docs/CAPACITOR.md for the full runbook.
 */
const serverUrl = process.env.CAPACITOR_SERVER_URL;

const config: CapacitorConfig = {
	// Matches the existing Firebase registration (google-services.json
	// package_name) so FCM works without re-registering the app.
	appId: "com.qurancompanion",
	appName: "Quran Companion",
	webDir: "capacitor-www",
	server: {
		...(serverUrl ? { url: serverUrl } : {}),
		androidScheme: "https",
		// Local offline fallback (lives in public/, copied into capacitor-www).
		errorPath: "error.html",
	},
	plugins: {
		PushNotifications: { presentationOptions: ["badge", "sound", "alert"] },
	},
};

export default config;
