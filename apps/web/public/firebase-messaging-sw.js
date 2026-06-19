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

messaging.onBackgroundMessage((payload) => {
	const d = payload.data || {};
	self.registration.showNotification(d.title || "Quran Companion", {
		body: d.body || "",
		icon: "/icons/icon-192.png",
		badge: "/icons/icon-192.png",
		dir: "rtl",
		lang: "ar",
		data: { url: d.url || "/" },
	});
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	const url = (event.notification.data && event.notification.data.url) || "/";
	event.waitUntil(
		self.clients
			.matchAll({ type: "window", includeUncontrolled: true })
			.then((clients) => {
				for (const client of clients) {
					if (client.url.includes(url) && "focus" in client)
						return client.focus();
				}
				return self.clients.openWindow(url);
			}),
	);
});
