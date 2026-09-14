import {
	date,
	index,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth.drizzle";

/**
 * One row per day a student has excused. The monthly allowance is derived by
 * counting rows in the current month rather than stored as a counter, so it
 * resets on the 1st by construction — no cron, no carryover, nothing to drift.
 */
export const excuseDays = pgTable(
	"excuse_days",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		date: date("date").notNull(),
		reason: text("reason"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		unique("uq_excuse_days_user_date").on(table.userId, table.date),
		index("excuse_days_userId_idx").on(table.userId),
	],
);
