/* Firebase Cloud Messaging service worker for Web Push. The Firebase web config
 * is public, so it's passed as a `config` query param at registration time
 * (see firebase-push.ts) rather than hardcoded here.
 *
 * Web messages are sent data-only (see server/fcm.ts) so this SW renders them
 * with the app's RTL/icon styling — and the SDK doesn't auto-show a duplicate. */
importScripts(
	"https://www.gstatic.com/firebasejs/12.15.0/firebase-app-compat.js",
);
importScripts(
	"https://www.gstatic.com/firebasejs/12.15.0/firebase-messaging-compat.js",
);

const params = new URL(self.location).searchParams;
let config = {};
try {
	config = JSON.parse(params.get("config") || "{}");
} catch (_) {
	config = {};
}

firebase.initializeApp(config);
const messaging = firebase.messaging();

// Activate a new worker immediately instead of waiting for every tab to close,
// so notification-handling fixes roll out on the next visit.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
	event.waitUntil(self.clients.claim()),
);

messaging.onBackgroundMessage((payload) => {
	const d = payload.data || {};
	self.registration.showNotification(d.title || "Quran Companion", {
		body: d.body || "",
		icon: "/icons/icon-192.png",
		badge: "/icons/icon-192.png",
		// Per-recipient language sent by the server; Arabic/RTL as before.
		dir: d.dir || "rtl",
		lang: d.lang || "ar",
		data: { url: d.url || "/" },
	});
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	const raw = (event.notification.data && event.notification.data.url) || "/";
	// Resolve to an absolute, in-scope URL so openWindow() reopens the installed
	// PWA (WebAPK) rather than the browser.
	const target = new URL(raw, self.location.origin).href;
	event.waitUntil(
		self.clients
			.matchAll({ type: "window", includeUncontrolled: true })
			.then((clients) => {
				// Reuse an existing app window on the same origin if one is open…
				for (const client of clients) {
					if (
						new URL(client.url).origin === self.location.origin &&
						"focus" in client
					) {
						if ("navigate" in client && client.url !== target) {
							return client.navigate(target).then((c) => (c || client).focus());
						}
						return client.focus();
					}
				}
				// …otherwise open a fresh window, which routes to the installed PWA.
				return self.clients.openWindow(target);
			}),
	);
});
