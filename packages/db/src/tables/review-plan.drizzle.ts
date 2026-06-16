import {
	boolean,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";

import { user } from "./auth.drizzle";

export const reviewPlans = pgTable(
	"review_plans",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		studentId: text("student_id")
			.notNull()
			.references(() => user.id),
		teacherId: text("teacher_id")
			.notNull()
			.references(() => user.id),
		startSurahNumber: integer("start_surah_number").notNull(),
		startVerse: integer("start_verse").notNull(),
		endSurahNumber: integer("end_surah_number").notNull(),
		endVerse: integer("end_verse").notNull(),
		rangeMode: varchar("range_mode", { length: 10 })
			.default("verses")
			.notNull(),
		startPage: integer("start_page"),
		endPage: integer("end_page"),
		dailyAmount: integer("daily_amount").notNull(),
		dailyUnit: varchar("daily_unit", { length: 10 })
			.default("verses")
			.notNull(),
		isActive: boolean("is_active").default(true).notNull(),
		// Set when the start page changes (pages mode): the next generated review
		// re-anchors to startPage instead of continuing from progress. Cleared once
		// that review is created.
		cursorReset: boolean("cursor_reset").default(false).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("review_plans_studentId_idx").on(table.studentId),
		index("review_plans_teacherId_idx").on(table.teacherId),
	],
);
