import { getVapidPublicKey } from "@/server/queries";
import { subscribePush } from "@/server/subscribe-push";

/** VAPID base64url → Uint8Array for PushManager.subscribe. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
	const padding = "=".repeat((4 - (base64.length % 4)) % 4);
	const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
	const raw = atob(b64);
	const out = new Uint8Array(raw.length);
	for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
	return out;
}

export type PushResult = "subscribed" | "denied" | "unsupported" | "no-vapid";

/**
 * Register the service worker, request notification permission, subscribe to
 * Web Push, and persist the subscription server-side. Safe to call from a click
 * handler. Returns a status the UI can surface.
 */
export async function enablePush(): Promise<PushResult> {
	if (
		typeof window === "undefined" ||
		!("serviceWorker" in navigator) ||
		!("PushManager" in window)
	) {
		return "unsupported";
	}
	const { key } = await getVapidPublicKey();
	if (!key) return "no-vapid";

	const permission = await Notification.requestPermission();
	if (permission !== "granted") return "denied";

	const reg = await navigator.serviceWorker.register("/sw.js");
	await navigator.serviceWorker.ready;

	const existing = await reg.pushManager.getSubscription();
	const sub =
		existing ??
		(await reg.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey: urlBase64ToUint8Array(key),
		}));

	const json = sub.toJSON() as {
		endpoint?: string;
		keys?: { p256dh?: string; auth?: string };
	};
	if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth)
		return "unsupported";

	await subscribePush({
		data: {
			endpoint: json.endpoint,
			keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
			platform: "web",
		},
	});
	return "subscribed";
}
