/* Push service worker. Registered by the client after the user grants
 * notification permission (Phase 4 wires the subscribe flow → subscribePush). */

// Activate a new worker immediately instead of waiting for every tab to close,
// so notification-handling fixes roll out on the next visit.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
	event.waitUntil(self.clients.claim()),
);

self.addEventListener("push", (event) => {
	let data = {};
	try {
		data = event.data ? event.data.json() : {};
	} catch (_) {
		data = { title: "Quran Companion", body: event.data ? event.data.text() : "" };
	}
	const title = data.title || "Quran Companion";
	const meta = data.data || {};
	event.waitUntil(
		self.registration.showNotification(title, {
			body: data.body || "",
			icon: "/icons/icon-192.png",
			badge: "/icons/icon-192.png",
			// Per-recipient language sent by the server; Arabic/RTL as before.
			dir: meta.dir || "rtl",
			lang: meta.lang || "ar",
			data: meta,
		}),
	);
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
