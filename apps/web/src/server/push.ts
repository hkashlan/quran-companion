import { db } from "@quran/db/db";
import { pushTokens } from "@quran/db/tables/push-token.drizzle";
import { and, eq } from "drizzle-orm";
import webpush from "web-push";

import { sendFcm } from "./fcm.ts";

/**
 * Push fan-out across all of a user's devices. Web Push (VAPID) for PWA/browser
 * subscriptions; FCM HTTP v1 for Capacitor native tokens (kind "fcm"). Each
 * channel no-ops when its credentials are absent, so partial setups are safe.
 */
function configureVapid() {
	const pub = process.env.VAPID_PUBLIC_KEY;
	const priv = process.env.VAPID_PRIVATE_KEY;
	const subject = process.env.VAPID_SUBJECT ?? "mailto:admin@example.com";
	if (!pub || !priv) return false;
	webpush.setVapidDetails(subject, pub, priv);
	return true;
}

export type PushMessage = {
	title: string;
	body: string;
	data?: Record<string, unknown>;
};

/** Send a push to every active subscription for a user. Returns counts. */
export async function sendPush(userId: string, message: PushMessage) {
	const ready = configureVapid();
	if (!ready) return { sent: 0, failed: 0, skipped: "no-vapid" as const };

	const subs = await db
		.select()
		.from(pushTokens)
		.where(and(eq(pushTokens.userId, userId), eq(pushTokens.isActive, true)));

	let sent = 0;
	let failed = 0;
	const payload = JSON.stringify(message);

	const deactivate = (id: string) =>
		db.update(pushTokens).set({ isActive: false }).where(eq(pushTokens.id, id));

	for (const sub of subs) {
		// ── Native (FCM) ──
		if (sub.kind === "fcm" && sub.token) {
			const result = await sendFcm(sub.token, message);
			if (result === "ok") sent++;
			else if (result === "skip") continue;
			else {
				failed++;
				if (result === "gone") await deactivate(sub.id);
			}
			continue;
		}

		// ── Web Push (VAPID) ──
		if (sub.kind !== "webpush" || !sub.endpoint || !sub.p256dh || !sub.auth) continue;
		try {
			await webpush.sendNotification(
				{ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
				payload,
			);
			sent++;
		} catch (err) {
			failed++;
			const status = (err as { statusCode?: number }).statusCode;
			if (status === 404 || status === 410) await deactivate(sub.id);
		}
	}

	return { sent, failed };
}
