import {
	integer,
	pgTable,
	text,
	timestamp,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";

import { user } from "./auth.drizzle";

export const learningCircles = pgTable("learning_circles", {
	id: uuid("id").defaultRandom().primaryKey(),
	ownerTeacherId: text("owner_teacher_id")
		.notNull()
		.references(() => user.id),
	title: text("title").notNull(),
	description: text("description"),
	location: text("location"),
	reminderHoursBeforeStart: integer("reminder_hours_before_start")
		.default(2)
		.notNull(),
	code: varchar("code", { length: 8 }).notNull().unique(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const learningCircleSlots = pgTable("learning_circle_slots", {
	id: uuid("id").defaultRandom().primaryKey(),
	circleId: uuid("circle_id")
		.notNull()
		.references(() => learningCircles.id, { onDelete: "cascade" }),
	dayOfWeek: integer("day_of_week").notNull(),
	startTime: varchar("start_time", { length: 5 }).notNull(),
	endTime: varchar("end_time", { length: 5 }).notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});
