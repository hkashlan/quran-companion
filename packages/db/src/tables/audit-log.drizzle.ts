import {
	index,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth.drizzle";
import { learningCircles } from "./learning-circle.drizzle";

/**
 * Explicit audit trail. The old FastAPI app additionally used
 * sqlalchemy-continuum for automatic row-versioning of several tables; that is
 * intentionally not reproduced here (see MIGRATION_PLAN.md). Add Postgres
 * triggers or shadow `*_versions` tables later if full history is required.
 */
export const auditActionEnum = pgEnum("audit_action", [
	"session_created",
	"review_plan_created",
	"review_plan_updated",
	"review_plan_deleted",
	"review_created",
]);

export const auditLogs = pgTable(
	"audit_logs",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		circleId: uuid("circle_id")
			.notNull()
			.references(() => learningCircles.id, { onDelete: "cascade" }),
		teacherId: text("teacher_id")
			.notNull()
			.references(() => user.id),
		action: auditActionEnum("action").notNull(),
		targetId: uuid("target_id").notNull(),
		studentId: text("student_id").references(() => user.id),
		details: text("details"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [index("audit_logs_circleId_idx").on(table.circleId)],
);
