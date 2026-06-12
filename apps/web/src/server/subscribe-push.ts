import { auth } from "@/lib/auth";
import { db } from "@quran/db/db";
import { pushTokens } from "@quran/db/tables/push-token.drizzle";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

const subscriptionSchema = z.object({
	endpoint: z.string().url(),
	keys: z.object({ p256dh: z.string(), auth: z.string() }),
	platform: z.string().optional(),
});

/** Store (or refresh) the caller's Web Push subscription. */
export const subscribePush = createServerFn({ method: "POST" })
	.validator(subscriptionSchema)
	.handler(async ({ data }) => {
		const headers = getRequestHeaders();
		const session = await auth.api.getSession({ headers });
		if (!session) throw new Error("unauthorized");

		const existing = await db
			.select()
			.from(pushTokens)
			.where(
				and(
					eq(pushTokens.userId, session.user.id),
					eq(pushTokens.endpoint, data.endpoint),
				),
			)
			.limit(1);

		if (existing[0]) {
			await db
				.update(pushTokens)
				.set({ p256dh: data.keys.p256dh, auth: data.keys.auth, isActive: true })
				.where(eq(pushTokens.id, existing[0].id));
			return { ok: true, updated: true };
		}

		await db.insert(pushTokens).values({
			userId: session.user.id,
			kind: "webpush",
			endpoint: data.endpoint,
			p256dh: data.keys.p256dh,
			auth: data.keys.auth,
			platform: data.platform ?? "web",
		});
		return { ok: true, updated: false };
	});

const nativeSchema = z.object({
	token: z.string().min(1),
	kind: z.enum(["fcm", "apns"]).default("fcm"),
	platform: z.string().optional(),
});

/** Store (or refresh) a Capacitor native push token (FCM/APNs). */
export const subscribeNativePush = createServerFn({ method: "POST" })
	.validator(nativeSchema)
	.handler(async ({ data }) => {
		const headers = getRequestHeaders();
		const session = await auth.api.getSession({ headers });
		if (!session) throw new Error("unauthorized");

		const existing = await db
			.select()
			.from(pushTokens)
			.where(and(eq(pushTokens.userId, session.user.id), eq(pushTokens.token, data.token)))
			.limit(1);
		if (existing[0]) {
			await db
				.update(pushTokens)
				.set({ isActive: true, kind: data.kind })
				.where(eq(pushTokens.id, existing[0].id));
			return { ok: true, updated: true };
		}
		await db.insert(pushTokens).values({
			userId: session.user.id,
			kind: data.kind,
			token: data.token,
			platform: data.platform ?? "native",
		});
		return { ok: true, updated: false };
	});
