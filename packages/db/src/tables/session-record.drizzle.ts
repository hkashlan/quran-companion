import {
	date,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";

import { user } from "./auth.drizzle";

export const sessionRecords = pgTable(
	"session_records",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		studentId: text("student_id")
			.notNull()
			.references(() => user.id),
		teacherId: text("teacher_id")
			.notNull()
			.references(() => user.id),
		startSurahNumber: integer("start_surah_number"),
		memorizedSurah: text("memorized_surah").notNull(),
		memorizedVerseFrom: integer("memorized_verse_from").notNull(),
		endSurahNumber: integer("end_surah_number"),
		endSurahName: text("end_surah_name"),
		memorizedVerseTo: integer("memorized_verse_to").notNull(),
		rangeMode: varchar("range_mode", { length: 10 }).default("verses").notNull(),
		startPage: integer("start_page"),
		endPage: integer("end_page"),
		sessionDate: date("session_date").notNull(),
		sessionTime: varchar("session_time", { length: 5 }),
		notes: text("notes"),
		evaluation: text("evaluation"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("session_records_studentId_idx").on(table.studentId),
		index("session_records_teacherId_idx").on(table.teacherId),
	],
);
