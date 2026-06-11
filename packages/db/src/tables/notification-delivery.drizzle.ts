import {
	boolean,
	index,
	pgTable,
	text,
	timestamp,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";

import { user } from "./auth.drizzle";

/**
 * Record of every notification queued/sent to a user. `dedupeKey` is unique so
 * the daily job can be retried without double-sending (e.g. one reminder per
 * circle session per day).
 */
export const notificationDeliveries = pgTable(
	"notification_deliveries",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		eventType: varchar("event_type", { length: 64 }).notNull(),
		title: text("title").notNull(),
		body: text("body").notNull(),
		payload: text("payload"),
		status: varchar("status", { length: 24 }).default("queued").notNull(),
		dedupeKey: varchar("dedupe_key", { length: 255 }).unique(),
		error: text("error"),
		sentAt: timestamp("sent_at"),
		isRead: boolean("is_read").default(false).notNull(),
		readAt: timestamp("read_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("notification_deliveries_userId_idx").on(table.userId),
		index("notification_deliveries_status_idx").on(table.status),
	],
);
