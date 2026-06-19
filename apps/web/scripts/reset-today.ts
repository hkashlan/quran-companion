/**
 * Dev helper: reset & regenerate review rows for a student.
 *
 *   pnpm reset:today                          # all students, today only
 *   pnpm reset:today student@x.com            # one student, today only
 *   pnpm reset:today student@x.com --days=1   # + yesterday left UNFINISHED
 *   pnpm reset:today 2026-06-18 --days=3      # base date + 3 prior days
 *
 * For the chosen date range it (1) reverses points earned on those reviews,
 * (2) rewinds a streak bumped in that range, (3) deletes those review rows + their
 * "review assigned" notifications, then (4) regenerates one review per active plan
 * per day in chronological order via the plan cursor (start = last page read + 1).
 *
 * `--days=N` backfills N prior days as pending/unfinished reviews and leaves the
 * base day not-started — so you can test "did not finish yesterday + today is new"
 * and the student catching up on the past. NOT for production (mutates points).
 */
import { db } from "@quran/db/db";
import { user } from "@quran/db/tables/auth.drizzle";
import { notificationDeliveries } from "@quran/db/tables/notification-delivery.drizzle";
import { reviews } from "@quran/db/tables/review.drizzle";
import { reviewPlans } from "@quran/db/tables/review-plan.drizzle";
import { and, eq, inArray } from "drizzle-orm";

import { ensureTodayReview } from "../src/server/scheduler.ts";

const args = process.argv.slice(2);
const baseDate =
	args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) ??
	new Date().toISOString().slice(0, 10);
const email = args.find((a) => a.includes("@"));
const daysArg = args.find((a) => /^--days=\d+$/.test(a));
const days = daysArg ? Number(daysArg.split("=")[1]) : 0;

/** Shift a YYYY-MM-DD date by `delta` days (UTC, DST-safe). */
function addDays(dateStr: string, delta: number): string {
	const d = new Date(`${dateStr}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + delta);
	return d.toISOString().slice(0, 10);
}

// Oldest → newest, so the cursor chains correctly (each day continues the last).
const dates = Array.from({ length: days + 1 }, (_, i) =>
	addDays(baseDate, i - days),
);

async function main() {
	let studentId: string | undefined;
	if (email) {
		const [u] = await db
			.select({ id: user.id })
			.from(user)
			.where(eq(user.email, email))
			.limit(1);
		if (!u) {
			console.error(`No user with email ${email}`);
			process.exit(1);
		}
		studentId = u.id;
	}

	const where = studentId
		? and(inArray(reviews.assignedDate, dates), eq(reviews.studentId, studentId))
		: inArray(reviews.assignedDate, dates);

	const existing = await db.select().from(reviews).where(where);
	console.log(
		`Resetting ${existing.length} review(s) over ${dates[0]}…${dates[dates.length - 1]}${email ? ` (${email})` : ""}.`,
	);

	// 1 + 2. Reverse points and rewind a streak earned within the range, per user.
	const byUser = new Map<string, { earned: number; completed: Set<string> }>();
	for (const r of existing) {
		const agg = byUser.get(r.studentId) ?? { earned: 0, completed: new Set() };
		agg.earned += r.pointsEarned ?? 0;
		if (r.completedAt != null) agg.completed.add(r.assignedDate);
		byUser.set(r.studentId, agg);
	}
	for (const [uid, { earned, completed }] of byUser) {
		const [u] = await db.select().from(user).where(eq(user.id, uid)).limit(1);
		if (!u) continue;
		const streakInRange = dates.includes(
			(u as { streakLastDate?: string | null }).streakLastDate ?? "",
		);
		await db
			.update(user)
			.set({
				points: Math.max(0, u.points - earned),
				...(streakInRange
					? { streak: Math.max(0, u.streak - completed.size), streakLastDate: null }
					: {}),
			})
			.where(eq(user.id, uid));
	}

	// 3. Delete those reviews + their "review assigned" notifications.
	await db.delete(reviews).where(where);
	await db
		.delete(notificationDeliveries)
		.where(
			inArray(
				notificationDeliveries.dedupeKey,
				dates.flatMap((d) =>
					existing.map((r) => `review_assigned:${r.reviewPlanId}:${d}`),
				),
			),
		);

	// 4. Regenerate one review per active plan per day, oldest → newest. Prior days
	// stay pending (unfinished); the base day is created last, not started.
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
		.where(
			studentId
				? and(
						eq(reviewPlans.isActive, true),
						eq(reviewPlans.studentId, studentId),
					)
				: eq(reviewPlans.isActive, true),
		);

	let created = 0;
	for (const d of dates)
		for (const plan of plans)
			if (await ensureTodayReview(plan, d)) created += 1;

	console.log(
		`Regenerated ${created} review(s) across ${plans.length} plan(s) × ${dates.length} day(s).`,
	);
	console.log("Done.");
}

main().then(() => process.exit(0));
