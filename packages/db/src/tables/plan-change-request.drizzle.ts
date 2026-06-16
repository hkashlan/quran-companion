import {
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth.drizzle";
import { requestStatusEnum } from "./join-request.drizzle";
import { reviewPlans } from "./review-plan.drizzle";

export const planChangeFieldEnum = pgEnum("plan_change_field", [
	"daily_amount",
	"start_page",
]);

/**
 * A student's request to change their own active plan. Changes that ease the
 * workload (fewer pages/day, or skipping ahead to a later start page) are
 * queued here as `pending` for the teacher to approve/reject; freeing changes
 * apply immediately and never create a row. Mirrors `joinRequests`.
 */
export const planChangeRequests = pgTable(
	"plan_change_requests",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		reviewPlanId: uuid("review_plan_id")
			.notNull()
			.references(() => reviewPlans.id, { onDelete: "cascade" }),
		studentId: text("student_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		teacherId: text("teacher_id")
			.notNull()
			.references(() => user.id),
		field: planChangeFieldEnum("field").notNull(),
		proposedDailyAmount: integer("proposed_daily_amount"),
		proposedStartPage: integer("proposed_start_page"),
		status: requestStatusEnum("status").default("pending").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		resolvedAt: timestamp("resolved_at"),
	},
	(table) => [
		index("plan_change_requests_teacherId_idx").on(table.teacherId),
		index("plan_change_requests_studentId_idx").on(table.studentId),
		index("plan_change_requests_status_idx").on(table.status),
	],
);
