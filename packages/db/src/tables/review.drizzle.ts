import {
	date,
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";

import { user } from "./auth.drizzle";
import { reviewPlans } from "./review-plan.drizzle";

export const reviewStatusEnum = pgEnum("review_status", [
	"pending",
	"completed",
	"missed",
]);

export const reviews = pgTable(
	"reviews",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		studentId: text("student_id")
			.notNull()
			.references(() => user.id),
		teacherId: text("teacher_id")
			.notNull()
			.references(() => user.id),
		reviewPlanId: uuid("review_plan_id").references(() => reviewPlans.id),
		surahNumber: integer("surah_number").notNull(),
		surahName: text("surah_name").notNull(),
		verseFrom: integer("verse_from").notNull(),
		endSurahNumber: integer("end_surah_number"),
		endSurahName: text("end_surah_name"),
		verseTo: integer("verse_to").notNull(),
		rangeMode: varchar("range_mode", { length: 10 })
			.default("verses")
			.notNull(),
		startPage: integer("start_page"),
		endPage: integer("end_page"),
		assignedDate: date("assigned_date").notNull(),
		completedAt: timestamp("completed_at"),
		pointsEarned: integer("points_earned").default(0).notNull(),
		status: reviewStatusEnum("status").default("pending").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("reviews_studentId_idx").on(table.studentId),
		index("reviews_teacherId_idx").on(table.teacherId),
		index("reviews_assignedDate_idx").on(table.assignedDate),
		index("reviews_status_idx").on(table.status),
	],
);
