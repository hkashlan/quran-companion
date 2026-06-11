import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth.drizzle";
import { reviews } from "./review.drizzle";

export const reviewSubmissions = pgTable(
	"review_submissions",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		reviewId: uuid("review_id")
			.notNull()
			.references(() => reviews.id, { onDelete: "cascade" }),
		studentId: text("student_id")
			.notNull()
			.references(() => user.id),
		startSurahNumber: integer("start_surah_number").notNull(),
		startSurahName: text("start_surah_name").notNull(),
		startVerse: integer("start_verse").notNull(),
		endSurahNumber: integer("end_surah_number").notNull(),
		endSurahName: text("end_surah_name").notNull(),
		endVerse: integer("end_verse").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [index("review_submissions_reviewId_idx").on(table.reviewId)],
);
