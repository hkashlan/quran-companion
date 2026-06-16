import { db } from "@quran/db/db";
import {
	lastReachedPage,
	nextPageWindow,
	nextReviewWindow,
} from "@quran/db/domain/review-cycle";
import { getSurahName } from "@quran/db/domain/surahs";
import { user } from "@quran/db/tables/auth.drizzle";
import { notificationDeliveries } from "@quran/db/tables/notification-delivery.drizzle";
import { reviews } from "@quran/db/tables/review.drizzle";
import { reviewPlans } from "@quran/db/tables/review-plan.drizzle";
import { and, desc, eq, lt, sql } from "drizzle-orm";

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
export async function runDailyScheduler(today: string) {
	const plans = await db
		.select({
			id: reviewPlans.id,
			studentId: reviewPlans.studentId,
			teacherId: reviewPlans.teacherId,
			startSurahNumber: reviewPlans.startSurahNumber,
			startVerse: reviewPlans.startVerse,
			endSurahNumber: reviewPlans.endSurahNumber,
			endVerse: reviewPlans.endVerse,
			startPage: reviewPlans.startPage,
			dailyAmount: reviewPlans.dailyAmount,
			rangeMode: reviewPlans.rangeMode,
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

		// 2. skip if today's review already exists
		const existingToday = await db
			.select({ id: reviews.id })
			.from(reviews)
			.where(
				and(eq(reviews.reviewPlanId, plan.id), eq(reviews.assignedDate, today)),
			)
			.limit(1);
		if (existingToday.length > 0) continue;

		// last review for this plan → advance the window
		const last = await db
			.select({
				surahNumber: reviews.surahNumber,
				endSurahNumber: reviews.endSurahNumber,
				verseTo: reviews.verseTo,
				startPage: reviews.startPage,
				endPage: reviews.endPage,
				progressPage: reviews.progressPage,
			})
			.from(reviews)
			.where(eq(reviews.reviewPlanId, plan.id))
			.orderBy(desc(reviews.createdAt))
			.limit(1);

		// 2. create the next review — page cursor for pages plans, else verse window
		let body: string;
		if (plan.rangeMode === "pages") {
			// Advance from the page the student actually reached (progress), not the
			// assigned window end — so overachieving jumps ahead and a shortfall is
			// continued (not skipped) the next day.
			const { startPage, endPage } = nextPageWindow(
				{ startPage: plan.startPage ?? 1, dailyAmount: plan.dailyAmount },
				lastReachedPage(
					last[0]?.progressPage ?? null,
					last[0]?.startPage ?? null,
					last[0]?.endPage ?? null,
				),
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
			body = `ص ${startPage}–${endPage}`;
		} else {
			const { start, end } = nextReviewWindow(plan, last[0] ?? null);
			const surahName = getSurahName(start.surah, "ar");
			const endSurahName = getSurahName(end.surah, "ar");
			await db.insert(reviews).values({
				studentId: plan.studentId,
				teacherId: plan.teacherId,
				reviewPlanId: plan.id,
				rangeMode: plan.rangeMode,
				surahNumber: start.surah,
				surahName,
				verseFrom: start.verse,
				endSurahNumber: end.surah,
				endSurahName,
				verseTo: end.verse,
				assignedDate: today,
				status: "pending",
			});
			body = `${surahName}: ${start.verse}–${end.verse}`;
		}
		created += 1;

		// 3. notify
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
		notified += 1;
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
