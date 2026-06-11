import { db } from "@quran/db/db";
import { pushTokens } from "@quran/db/tables/push-token.drizzle";
import { and, eq } from "drizzle-orm";
import webpush from "web-push";

/**
 * Push fan-out. Web Push (VAPID) is wired now for the PWA; native FCM/APNs is
 * added in Phase 5 (same `push_tokens` table, discriminated by `kind`).
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

	for (const sub of subs) {
		if (sub.kind !== "webpush" || !sub.endpoint || !sub.p256dh || !sub.auth) {
			continue; // native handled in Phase 5
		}
		try {
			await webpush.sendNotification(
				{ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
				payload,
			);
			sent++;
		} catch (err) {
			failed++;
			// 404/410 → subscription gone; deactivate so we stop trying.
			const status = (err as { statusCode?: number }).statusCode;
			if (status === 404 || status === 410) {
				await db
					.update(pushTokens)
					.set({ isActive: false })
					.where(eq(pushTokens.id, sub.id));
			}
		}
	}

	return { sent, failed };
}
