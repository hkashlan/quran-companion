import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "../db.ts";
import { notificationDeliveries } from "../tables/notification-delivery.drizzle.ts";

export async function listNotifications(userId: string, limit = 30, offset = 0) {
	return db
		.select()
		.from(notificationDeliveries)
		.where(eq(notificationDeliveries.userId, userId))
		.orderBy(desc(notificationDeliveries.createdAt))
		.limit(limit)
		.offset(offset);
}

export async function unreadCount(userId: string): Promise<number> {
	const [{ count }] = await db
		.select({ count: sql<number>`count(*)` })
		.from(notificationDeliveries)
		.where(
			and(eq(notificationDeliveries.userId, userId), eq(notificationDeliveries.isRead, false)),
		);
	return Number(count);
}

export async function markRead(userId: string, id: string) {
	const rows = await db
		.update(notificationDeliveries)
		.set({ isRead: true, readAt: new Date() })
		.where(and(eq(notificationDeliveries.id, id), eq(notificationDeliveries.userId, userId)))
		.returning();
	return rows[0] ?? null;
}

export async function markAllRead(userId: string): Promise<number> {
	const rows = await db
		.update(notificationDeliveries)
		.set({ isRead: true, readAt: new Date() })
		.where(
			and(eq(notificationDeliveries.userId, userId), eq(notificationDeliveries.isRead, false)),
		)
		.returning({ id: notificationDeliveries.id });
	return rows.length;
}
