import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth.drizzle";

/**
 * A message a teacher saved to reuse when nudging students (the "late students"
 * and "done students" screens). Owned by the teacher, not by a circle: the same
 * phrasing is reused across every circle they teach.
 *
 * `body` is the exact text that gets sent — emoji included — so picking a
 * template is a plain copy into the composer, not a template expansion.
 */
export const messageTemplates = pgTable(
	"message_templates",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		teacherId: text("teacher_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		body: text("body").notNull(),
		/** Bumped on every reuse so the composer can show the handiest ones first. */
		lastUsedAt: timestamp("last_used_at").defaultNow().notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [index("message_templates_teacherId_idx").on(table.teacherId)],
);
