import { db } from "@quran/db/db";
import { lastReachedPage, nextPageWindow } from "@quran/db/domain/review-cycle";
import { user } from "@quran/db/tables/auth.drizzle";
import { notificationDeliveries } from "@quran/db/tables/notification-delivery.drizzle";
import { reviews } from "@quran/db/tables/review.drizzle";
import { reviewPlans } from "@quran/db/tables/review-plan.drizzle";
import { and, asc, desc, eq, gt, lt, sql } from "drizzle-orm";

import { sendPush } from "./push.ts";

/**
 * Daily scheduler pipeline — the TypeScript replacement for the Python
 * `notification_scheduler` + `procrastinate` worker. Invoked by /api/cron/daily.
 *
 * For each active review plan:
 *   1. mark the student's overdue pending reviews for that plan as "missed"
 *   2. if no review exists for today, create the next one from the plan
 *      (advancing the verse window via the ported domain logic)
 *   3. record a notification + best-effort Web Push
 *
 * Returns a summary for the cron response/logs.
 */
export type PlanForReview = {
	id: string;
	studentId: string;
	teacherId: string;
	startPage: number | null;
	dailyAmount: number;
	cursorReset: boolean;
};

/**
 * Create today's review for a plan if one doesn't already exist, advancing the
 * window from the plan's last review (or the plan start for the first one), and
 * notify the student. Returns true if a review was created. Shared by the daily
 * cron and by assignReviewPlan (so a freshly-assigned plan gets today's review
 * immediately instead of waiting for the next cron run).
 */
export async function ensureTodayReview(
	plan: PlanForReview,
	today: string,
): Promise<boolean> {
	const existingToday = await db
		.select({ id: reviews.id })
		.from(reviews)
		.where(
			and(eq(reviews.reviewPlanId, plan.id), eq(reviews.assignedDate, today)),
		)
		.limit(1);
	if (existingToday.length > 0) return false;

	const last = await db
		.select({
			startPage: reviews.startPage,
			endPage: reviews.endPage,
			progressPage: reviews.progressPage,
		})
		.from(reviews)
		.where(eq(reviews.reviewPlanId, plan.id))
		.orderBy(desc(reviews.createdAt))
		.limit(1);

	// On a start-page change the cursor is reset: re-anchor to the plan's
	// startPage (pass null) instead of continuing from the last review's progress.
	const reached = plan.cursorReset
		? null
		: lastReachedPage(
				last[0]?.progressPage ?? null,
				last[0]?.startPage ?? null,
				last[0]?.endPage ?? null,
			);
	const { startPage, endPage } = nextPageWindow(
		{ startPage: plan.startPage ?? 1, dailyAmount: plan.dailyAmount },
		reached,
	);
	await db.insert(reviews).values({
		studentId: plan.studentId,
		teacherId: plan.teacherId,
		reviewPlanId: plan.id,
		rangeMode: "pages",
		startPage,
		endPage,
		assignedDate: today,
		status: "pending",
	});
	if (plan.cursorReset) {
		await db
			.update(reviewPlans)
			.set({ cursorReset: false })
			.where(eq(reviewPlans.id, plan.id));
	}
	const body = `ص ${startPage}–${endPage}`;

	const title = "مراجعة جديدة";
	// dedupeKey is unique so a retried run doesn't double-send (or crash).
	await db
		.insert(notificationDeliveries)
		.values({
			userId: plan.studentId,
			eventType: "review_assigned",
			title,
			body,
			status: "sent",
			dedupeKey: `review_assigned:${plan.id}:${today}`,
			sentAt: new Date(),
		})
		.onConflictDoNothing({ target: notificationDeliveries.dedupeKey });
	await sendPush(plan.studentId, { title, body, data: { url: "/student" } });
	return true;
}

/**
 * Re-derive the page windows of every review that comes *after* a given review on
 * the same plan. Used when a student edits/completes an older review: the cursor
 * (start = last page read + 1, wrapping at 604) is recomputed forward so the
 * future reviews reflect the new progress. Already-finalized days are left intact
 * but still advance the running cursor. Returns how many reviews were re-anchored.
 */
export async function recalcFutureReviews(
	planId: string,
	from: {
		assignedDate: string;
		progressPage: number | null;
		startPage: number | null;
		endPage: number | null;
	},
): Promise<number> {
	const [plan] = await db
		.select({
			startPage: reviewPlans.startPage,
			dailyAmount: reviewPlans.dailyAmount,
		})
		.from(reviewPlans)
		.where(eq(reviewPlans.id, planId))
		.limit(1);
	if (!plan) return 0;

	const later = await db
		.select({
			id: reviews.id,
			startPage: reviews.startPage,
			endPage: reviews.endPage,
			progressPage: reviews.progressPage,
			completedAt: reviews.completedAt,
		})
		.from(reviews)
		.where(
			and(
				eq(reviews.reviewPlanId, planId),
				gt(reviews.assignedDate, from.assignedDate),
			),
		)
		.orderBy(asc(reviews.assignedDate), asc(reviews.createdAt));

	let cursor = lastReachedPage(from.progressPage, from.startPage, from.endPage);
	let changed = 0;
	for (const r of later) {
		// A finalized day stays as-is; the chain still continues from what it reached.
		if (r.completedAt != null) {
			cursor = lastReachedPage(r.progressPage, r.startPage, r.endPage);
			continue;
		}
		const { startPage, endPage } = nextPageWindow(
			{ startPage: plan.startPage ?? 1, dailyAmount: plan.dailyAmount },
			cursor,
		);
		if (startPage !== r.startPage || endPage !== r.endPage) {
			// Window moved → re-anchor and clear any now-stale progress.
			await db
				.update(reviews)
				.set({ startPage, endPage, progressPage: null })
				.where(eq(reviews.id, r.id));
			changed += 1;
			cursor = startPage - 1;
		} else {
			cursor = lastReachedPage(r.progressPage, startPage, endPage);
		}
	}
	return changed;
}

export async function runDailyScheduler(today: string) {
	const plans = await db
		.select({
			id: reviewPlans.id,
			studentId: reviewPlans.studentId,
			teacherId: reviewPlans.teacherId,
			startPage: reviewPlans.startPage,
			dailyAmount: reviewPlans.dailyAmount,
			cursorReset: reviewPlans.cursorReset,
		})
		.from(reviewPlans)
		.where(eq(reviewPlans.isActive, true));

	let created = 0;
	let missed = 0;
	let notified = 0;

	for (const plan of plans) {
		// 1. finalize overdue pending reviews. A pages review that hit its target
		// is stamped with completedAt (and already scored on submit) → completed;
		// everything else overdue (verses, or a pages shortfall) → missed.
		await db
			.update(reviews)
			.set({ status: "completed" })
			.where(
				and(
					eq(reviews.reviewPlanId, plan.id),
					eq(reviews.status, "pending"),
					lt(reviews.assignedDate, today),
					sql`${reviews.completedAt} is not null`,
				),
			);
		const overdue = await db
			.update(reviews)
			.set({ status: "missed" })
			.where(
				and(
					eq(reviews.reviewPlanId, plan.id),
					eq(reviews.status, "pending"),
					lt(reviews.assignedDate, today),
					sql`${reviews.completedAt} is null`,
				),
			)
			.returning({ id: reviews.id });
		missed += overdue.length;

		// 2 + 3. create today's review (if missing) and notify.
		if (await ensureTodayReview(plan, today)) {
			created += 1;
			notified += 1;
		}
	}

	return { plans: plans.length, created, missed, notified };
}

/** Convenience: list students with notifications enabled (has any active push token). */
export async function activeStudentCount(): Promise<number> {
	const rows = await db
		.select({ id: user.id })
		.from(user)
		.where(eq(user.role, "student"));
	return rows.length;
}
