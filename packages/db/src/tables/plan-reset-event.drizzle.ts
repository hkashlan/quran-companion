import {
	date,
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth.drizzle";
import { reviewPlans } from "./review-plan.drizzle";

export const planResetStrategyEnum = pgEnum("plan_reset_strategy", [
	// raise the daily amount for a fixed window to make up the lost days
	"distribute",
	// keep the daily amount and accept a later khatmah
	"extend",
	// jump the cursor to where the plan should be today; write off the gap
	"skip",
]);

/**
 * One record per time a student resets their plan after falling behind.
 *
 * Kept as its own table rather than folded into `audit_logs` (circle-scoped,
 * teacher-authored, never written) or `notification_deliveries` (free-text
 * delivery log): the teacher's dashboard needs the *numbers* — how far behind,
 * what was skipped, how the khatmah date moved — and those must be queryable.
 */
export const planResetEvents = pgTable(
	"plan_reset_events",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		reviewPlanId: uuid("review_plan_id")
			.notNull()
			.references(() => reviewPlans.id),
		studentId: text("student_id")
			.notNull()
			.references(() => user.id),
		teacherId: text("teacher_id")
			.notNull()
			.references(() => user.id),
		strategy: planResetStrategyEnum("strategy").notNull(),
		// Backlog as it stood at the moment of the reset.
		backlogDays: integer("backlog_days").notNull(),
		backlogPages: integer("backlog_pages").notNull(),
		waivedCount: integer("waived_count").notNull(),
		// distribute only
		extraPagesPerDay: integer("extra_pages_per_day"),
		catchupDays: integer("catchup_days"),
		catchupUntil: date("catchup_until"),
		// skip only
		skippedFromPage: integer("skipped_from_page"),
		skippedToPage: integer("skipped_to_page"),
		skippedPages: integer("skipped_pages"),
		// Derived khatmah estimate before/after the reset, for the teacher's view.
		khatmahBefore: date("khatmah_before"),
		khatmahAfter: date("khatmah_after"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("plan_reset_events_studentId_idx").on(table.studentId),
		index("plan_reset_events_teacherId_idx").on(table.teacherId),
	],
);
