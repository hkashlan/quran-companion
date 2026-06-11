import { and, desc, eq, gte, lte } from "drizzle-orm";

import { db } from "../db.ts";
import { reviews } from "../tables/review.drizzle.ts";
import type { CreateReviewInput } from "../validation/review.schema.ts";
import { createReviewInputSchema } from "../validation/review.schema.ts";

/** All reviews for a student, newest assigned first. */
export async function listReviewsForStudent(studentId: string) {
	return db
		.select()
		.from(reviews)
		.where(eq(reviews.studentId, studentId))
		.orderBy(desc(reviews.assignedDate), desc(reviews.createdAt));
}

/** Reviews assigned on a given date (used by the daily scheduler / home screen). */
export async function listReviewsByDate(studentId: string, date: string) {
	return db
		.select()
		.from(reviews)
		.where(and(eq(reviews.studentId, studentId), eq(reviews.assignedDate, date)));
}

/** Pending reviews whose assigned date is in [from, to] — for "undone" lists. */
export async function listPendingReviews(
	studentId: string,
	from: string,
	to: string,
) {
	return db
		.select()
		.from(reviews)
		.where(
			and(
				eq(reviews.studentId, studentId),
				eq(reviews.status, "pending"),
				gte(reviews.assignedDate, from),
				lte(reviews.assignedDate, to),
			),
		)
		.orderBy(desc(reviews.assignedDate));
}

export async function getReviewById(id: string) {
	const rows = await db.select().from(reviews).where(eq(reviews.id, id)).limit(1);
	return rows[0] ?? null;
}

export async function createReview(input: CreateReviewInput) {
	const validated = createReviewInputSchema.parse(input);
	const rows = await db.insert(reviews).values(validated).returning();
	return rows[0];
}

export async function markReviewCompleted(id: string, pointsEarned: number) {
	const rows = await db
		.update(reviews)
		.set({ status: "completed", completedAt: new Date(), pointsEarned })
		.where(eq(reviews.id, id))
		.returning();
	return rows[0] ?? null;
}
