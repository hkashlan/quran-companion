import {
	index,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth.drizzle";

/** Which composer a saved message belongs to — chasing vs congratulating. */
export const messageTemplateKindEnum = pgEnum("message_template_kind", [
	// the "late students" screen
	"late",
	// the "done students" screen
	"done",
]);

/**
 * A message a teacher saved to reuse when nudging students. Owned by the
 * teacher, not by a circle: the same phrasing is reused across every circle they
 * teach. Scoped by `kind`, though — a chase-up and a congratulation are never
 * interchangeable, so each composer only ever offers its own saved messages.
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
		kind: messageTemplateKindEnum("kind").notNull(),
		body: text("body").notNull(),
		/** Bumped on every reuse so the composer can show the handiest ones first. */
		lastUsedAt: timestamp("last_used_at").defaultNow().notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("message_templates_teacherId_kind_idx").on(
			table.teacherId,
			table.kind,
		),
	],
);
