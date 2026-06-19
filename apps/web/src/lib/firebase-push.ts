import { getFirebaseConfig } from "@/server/queries";
import { subscribeNativePush } from "@/server/subscribe-push";

import { enablePush, isIosNeedingInstall, type PushResult } from "./push-client.ts";

/**
 * Web push via Firebase Cloud Messaging. Obtains an FCM registration token with
 * the Firebase JS SDK and stores it as an `fcm` token, so browser and native
 * push both flow through the server-side sendFcm() path.
 *
 * Falls back to the native VAPID web-push flow (enablePush) whenever Firebase
 * web push isn't configured or the browser can't support FCM — so partial
 * setups keep working. Firebase plugins are dynamically imported to keep them
 * out of the SSR/server bundle; call from a click handler.
 */
export async function enableFirebasePush(): Promise<PushResult> {
	if (
		typeof window === "undefined" ||
		!("serviceWorker" in navigator) ||
		!("Notification" in window)
	) {
		return isIosNeedingInstall() ? "ios-install" : "unsupported";
	}

	const { config, vapidKey } = await getFirebaseConfig();
	// No Firebase web setup → use the existing VAPID web-push flow instead.
	if (!config || !vapidKey) return enablePush();

	const { isSupported, getMessaging, getToken, onMessage } = await import(
		"firebase/messaging"
	);
	if (!(await isSupported())) return enablePush();

	const permission = await Notification.requestPermission();
	if (permission !== "granted") return "denied";

	const { initializeApp, getApps } = await import("firebase/app");
	const app = getApps()[0] ?? initializeApp(config);

	// The config (public) is passed to the SW via query string so it can render
	// background notifications without the values being hardcoded into the file.
	const reg = await navigator.serviceWorker.register(
		`/firebase-messaging-sw.js?config=${encodeURIComponent(JSON.stringify(config))}`,
	);
	await navigator.serviceWorker.ready;

	const messaging = getMessaging(app);
	const token = await getToken(messaging, {
		vapidKey,
		serviceWorkerRegistration: reg,
	});
	if (!token) return "unsupported";

	await subscribeNativePush({
		data: { token, kind: "fcm", platform: "web" },
	});

	// Foreground messages aren't auto-displayed — render them via the SW.
	onMessage(messaging, (payload) => {
		const d = (payload.data ?? {}) as Record<string, string>;
		reg.showNotification(d.title || "Quran Companion", {
			body: d.body || "",
			icon: "/icons/icon-192.png",
			badge: "/icons/icon-192.png",
			dir: "rtl",
			lang: "ar",
			data: { url: d.url || "/" },
		});
	});

	return "subscribed";
}

/**
 * Best-effort enable on app load, so push is on by default without the user
 * tapping the Settings button. Silently refreshes the token when permission is
 * already granted; prompts once when it's still undecided. No-ops when the user
 * previously denied, and on the Capacitor native shell (handled by
 * registerNativePush). Failures are swallowed — the manual button remains.
 */
export async function autoEnablePush(): Promise<void> {
	if (typeof window === "undefined" || !("Notification" in window)) return;
	if (Notification.permission === "denied") return;
	try {
		const { Capacitor } = await import("@capacitor/core");
		if (Capacitor.isNativePlatform()) return;
	} catch {
		// @capacitor/core unavailable on a pure web build — continue on web.
	}
	try {
		await enableFirebasePush();
	} catch {
		// Ignore — Settings → Enable Notifications stays available as a fallback.
	}
}
