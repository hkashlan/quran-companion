/* Push service worker. Registered by the client after the user grants
 * notification permission (Phase 4 wires the subscribe flow → subscribePush). */

self.addEventListener("push", (event) => {
	let data = {};
	try {
		data = event.data ? event.data.json() : {};
	} catch (_) {
		data = { title: "Quran Companion", body: event.data ? event.data.text() : "" };
	}
	const title = data.title || "Quran Companion";
	event.waitUntil(
		self.registration.showNotification(title, {
			body: data.body || "",
			icon: "/icons/icon-192.png",
			badge: "/icons/icon-192.png",
			dir: "rtl",
			lang: "ar",
			data: data.data || {},
		}),
	);
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	const url = (event.notification.data && event.notification.data.url) || "/";
	event.waitUntil(
		self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
			for (const client of clients) {
				if (client.url.includes(url) && "focus" in client) return client.focus();
			}
			return self.clients.openWindow(url);
		}),
	);
});
