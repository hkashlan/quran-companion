import { auth } from "@/lib/auth";
import { db } from "@quran/db/db";
import { joinRequests } from "@quran/db/tables/join-request.drizzle";
import { reviews } from "@quran/db/tables/review.drizzle";
import { listCirclesForUser, findCircleByCode } from "@quran/db/repositories/circle";
import { getLeaderboard, type LeaderboardPeriod } from "@quran/db/repositories/leaderboard";
import {
	listNotifications,
	markAllRead,
	unreadCount,
} from "@quran/db/repositories/notification";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

async function requireUser() {
	const session = await auth.api.getSession({ headers: getRequestHeaders() });
	if (!session) throw new Error("unauthorized");
	return session.user as typeof session.user & {
		role: "teacher" | "student";
		points: number;
		streak: number;
		language?: string;
		timezone?: string | null;
	};
}

function today(): string {
	return new Date().toISOString().slice(0, 10);
}

/** Public VAPID key for the client push-subscribe flow ("" if unconfigured). */
export const getVapidPublicKey = createServerFn({ method: "GET" }).handler(async () => {
	return { key: process.env.VAPID_PUBLIC_KEY ?? "" };
});

/** Minimal current-user info for headers/settings. */
export const getMe = createServerFn({ method: "GET" }).handler(async () => {
	const u = await requireUser();
	return { id: u.id, name: u.name, role: u.role, points: u.points, streak: u.streak };
});

/** Student home payload: circles, active + undone reviews, and the 4 stat cards. */
export const getStudentHome = createServerFn({ method: "GET" }).handler(async () => {
	const u = await requireUser();
	const circles = await listCirclesForUser(u.id);

	const pending = await db
		.select()
		.from(reviews)
		.where(and(eq(reviews.studentId, u.id), eq(reviews.status, "pending")))
		.orderBy(desc(reviews.assignedDate));

	const missed = await db
		.select()
		.from(reviews)
		.where(and(eq(reviews.studentId, u.id), eq(reviews.status, "missed")))
		.orderBy(desc(reviews.assignedDate));

	const [{ completed }] = await db
		.select({ completed: count() })
		.from(reviews)
		.where(and(eq(reviews.studentId, u.id), eq(reviews.status, "completed")));

	const [{ onTime }] = await db
		.select({ onTime: count() })
		.from(reviews)
		.where(
			and(
				eq(reviews.studentId, u.id),
				eq(reviews.status, "completed"),
				sql`${reviews.completedAt} is not null`,
			),
		);

	const completedCount = Number(completed);
	const onTimeRate = completedCount > 0 ? Math.round((Number(onTime) / completedCount) * 100) : 0;

	return {
		user: { id: u.id, name: u.name, points: u.points, streak: u.streak },
		circles,
		activeReview: pending[0] ?? null,
		undoneReviews: [...pending.slice(1), ...missed],
		stats: { points: u.points, completed: completedCount, onTime: onTimeRate, streak: u.streak },
	};
});

export const getLeaderboardData = createServerFn({ method: "GET" })
	.validator((d: { period: LeaderboardPeriod }) => d)
	.handler(async ({ data }) => {
		const u = await requireUser();
		const entries = await getLeaderboard(data.period, today());
		return { entries, meId: u.id };
	});

export const getNotifications = createServerFn({ method: "GET" }).handler(async () => {
	const u = await requireUser();
	const [items, unread] = await Promise.all([listNotifications(u.id), unreadCount(u.id)]);
	return { items, unread };
});

export const markAllNotificationsRead = createServerFn({ method: "POST" }).handler(async () => {
	const u = await requireUser();
	const marked = await markAllRead(u.id);
	return { marked };
});

/** Teacher: circles I own/teach, each with its student members. */
export const getTeacherHome = createServerFn({ method: "GET" }).handler(async () => {
	const u = await requireUser();
	const circles = await listCirclesForUser(u.id);
	const { circleMemberships } = await import("@quran/db/tables/circle-membership.drizzle");
	const { user: userTable } = await import("@quran/db/tables/auth.drizzle");
	const withStudents = await Promise.all(
		circles.map(async (c) => {
			const students = await db
				.select({ id: userTable.id, name: userTable.name })
				.from(circleMemberships)
				.innerJoin(userTable, eq(circleMemberships.userId, userTable.id))
				.where(and(eq(circleMemberships.circleId, c.id), eq(circleMemberships.role, "student")));
			return { ...c, students };
		}),
	);
	return { user: { id: u.id, name: u.name }, circles: withStudents };
});

/** Teacher: pending join requests across circles I own. */
export const getJoinRequests = createServerFn({ method: "GET" }).handler(async () => {
	const u = await requireUser();
	const { learningCircles } = await import("@quran/db/tables/learning-circle.drizzle");
	const { user: userTable } = await import("@quran/db/tables/auth.drizzle");
	const rows = await db
		.select({
			id: joinRequests.id,
			status: joinRequests.status,
			requestedRole: joinRequests.requestedRole,
			circleTitle: learningCircles.title,
			userName: userTable.name,
			userEmail: userTable.email,
		})
		.from(joinRequests)
		.innerJoin(learningCircles, eq(joinRequests.circleId, learningCircles.id))
		.innerJoin(userTable, eq(joinRequests.userId, userTable.id))
		.where(and(eq(learningCircles.ownerTeacherId, u.id), eq(joinRequests.status, "pending")))
		.orderBy(desc(joinRequests.createdAt));
	return { requests: rows };
});

export const respondJoinRequest = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.string().uuid(), status: z.enum(["approved", "rejected"]) }))
	.handler(async ({ data }) => {
		await requireUser();
		const { circleMemberships } = await import("@quran/db/tables/circle-membership.drizzle");
		const [req] = await db
			.update(joinRequests)
			.set({ status: data.status })
			.where(eq(joinRequests.id, data.id))
			.returning();
		if (req && data.status === "approved") {
			await db.insert(circleMemberships).values({
				circleId: req.circleId,
				userId: req.userId,
				role: req.requestedRole === "teacher" ? "teacher" : "student",
			});
		}
		return { ok: true };
	});

/** Teacher: full detail for one student — info, active plan, reviews, sessions. */
export const getStudentDetail = createServerFn({ method: "GET" })
	.validator(z.object({ studentId: z.string() }))
	.handler(async ({ data }) => {
		await requireUser();
		const { user: userTable } = await import("@quran/db/tables/auth.drizzle");
		const { reviewPlans } = await import("@quran/db/tables/review-plan.drizzle");
		const { sessionRecords } = await import("@quran/db/tables/session-record.drizzle");
		const [student] = await db
			.select({
				id: userTable.id,
				name: userTable.name,
				email: userTable.email,
				points: userTable.points,
				streak: userTable.streak,
			})
			.from(userTable)
			.where(eq(userTable.id, data.studentId))
			.limit(1);
		const [plan] = await db
			.select()
			.from(reviewPlans)
			.where(and(eq(reviewPlans.studentId, data.studentId), eq(reviewPlans.isActive, true)))
			.limit(1);
		const reviewRows = await db
			.select({
				id: reviews.id,
				surahName: reviews.surahName,
				verseFrom: reviews.verseFrom,
				verseTo: reviews.verseTo,
				assignedDate: reviews.assignedDate,
				status: reviews.status,
				pointsEarned: reviews.pointsEarned,
			})
			.from(reviews)
			.where(eq(reviews.studentId, data.studentId))
			.orderBy(reviews.assignedDate);
		const sessionRows = await db
			.select({
				id: sessionRecords.id,
				memorizedSurah: sessionRecords.memorizedSurah,
				memorizedVerseFrom: sessionRecords.memorizedVerseFrom,
				memorizedVerseTo: sessionRecords.memorizedVerseTo,
				sessionDate: sessionRecords.sessionDate,
				evaluation: sessionRecords.evaluation,
			})
			.from(sessionRecords)
			.where(eq(sessionRecords.studentId, data.studentId))
			.orderBy(sessionRecords.sessionDate);
		return { student: student ?? null, plan: plan ?? null, reviews: reviewRows, sessions: sessionRows };
	});

/** Teacher: deactivate a student's active review plan. */
export const removeReviewPlan = createServerFn({ method: "POST" })
	.validator(z.object({ studentId: z.string() }))
	.handler(async ({ data }) => {
		await requireUser();
		const { reviewPlans } = await import("@quran/db/tables/review-plan.drizzle");
		await db
			.update(reviewPlans)
			.set({ isActive: false })
			.where(and(eq(reviewPlans.studentId, data.studentId), eq(reviewPlans.isActive, true)));
		return { ok: true };
	});

/** Current student's reviews + sessions for the progress screen. */
export const getStudentProgress = createServerFn({ method: "GET" }).handler(async () => {
	const u = await requireUser();
	const { sessionRecords } = await import("@quran/db/tables/session-record.drizzle");
	const reviewRows = await db
		.select({
			id: reviews.id,
			surahName: reviews.surahName,
			verseFrom: reviews.verseFrom,
			verseTo: reviews.verseTo,
			assignedDate: reviews.assignedDate,
			status: reviews.status,
			pointsEarned: reviews.pointsEarned,
		})
		.from(reviews)
		.where(eq(reviews.studentId, u.id))
		.orderBy(reviews.assignedDate);
	const sessionRows = await db
		.select({
			id: sessionRecords.id,
			memorizedSurah: sessionRecords.memorizedSurah,
			memorizedVerseFrom: sessionRecords.memorizedVerseFrom,
			memorizedVerseTo: sessionRecords.memorizedVerseTo,
			sessionDate: sessionRecords.sessionDate,
			evaluation: sessionRecords.evaluation,
		})
		.from(sessionRecords)
		.where(eq(sessionRecords.studentId, u.id))
		.orderBy(sessionRecords.sessionDate);
	return {
		reviews: reviewRows,
		sessions: sessionRows,
		streak: u.streak,
		points: u.points,
	};
});

// ── Review modals (assign-review, add-session, submit-review) ──

const rangeFields = {
	rangeMode: z.enum(["verses", "pages"]).default("verses"),
	startSurahNumber: z.number().int(),
	startVerse: z.number().int(),
	endSurahNumber: z.number().int(),
	endVerse: z.number().int(),
};

/** Teacher: a student's name + current active review plan (for edit prefill). */
export const getStudentModalData = createServerFn({ method: "GET" })
	.validator(z.object({ studentId: z.string() }))
	.handler(async ({ data }) => {
		await requireUser();
		const { user: userTable } = await import("@quran/db/tables/auth.drizzle");
		const { reviewPlans } = await import("@quran/db/tables/review-plan.drizzle");
		const [student] = await db
			.select({ id: userTable.id, name: userTable.name })
			.from(userTable)
			.where(eq(userTable.id, data.studentId))
			.limit(1);
		const [plan] = await db
			.select()
			.from(reviewPlans)
			.where(and(eq(reviewPlans.studentId, data.studentId), eq(reviewPlans.isActive, true)))
			.limit(1);
		return { student: student ?? null, plan: plan ?? null };
	});

/** Teacher: create or update the student's active review plan. */
export const assignReviewPlan = createServerFn({ method: "POST" })
	.validator(z.object({ studentId: z.string(), dailyAmount: z.number().int().min(1), ...rangeFields }))
	.handler(async ({ data }) => {
		const teacher = await requireUser();
		const { reviewPlans } = await import("@quran/db/tables/review-plan.drizzle");
		const existing = await db
			.select({ id: reviewPlans.id })
			.from(reviewPlans)
			.where(and(eq(reviewPlans.studentId, data.studentId), eq(reviewPlans.isActive, true)))
			.limit(1);
		const values = {
			studentId: data.studentId,
			teacherId: teacher.id,
			startSurahNumber: data.startSurahNumber,
			startVerse: data.startVerse,
			endSurahNumber: data.endSurahNumber,
			endVerse: data.endVerse,
			rangeMode: data.rangeMode,
			dailyAmount: data.dailyAmount,
			dailyUnit: data.rangeMode,
			isActive: true,
		};
		if (existing[0]) {
			await db.update(reviewPlans).set(values).where(eq(reviewPlans.id, existing[0].id));
			return { ok: true, updated: true };
		}
		await db.insert(reviewPlans).values(values);
		return { ok: true, updated: false };
	});

/** Teacher: log a memorization session. */
export const createSession = createServerFn({ method: "POST" })
	.validator(
		z.object({
			studentId: z.string(),
			sessionDate: z.string(),
			sessionTime: z.string().optional(),
			notes: z.string().optional(),
			evaluation: z.string().optional(),
			...rangeFields,
		}),
	)
	.handler(async ({ data }) => {
		const teacher = await requireUser();
		const { getSurahName } = await import("@quran/db/domain/surahs");
		const { sessionRecords } = await import("@quran/db/tables/session-record.drizzle");
		await db.insert(sessionRecords).values({
			studentId: data.studentId,
			teacherId: teacher.id,
			memorizedSurah: getSurahName(data.startSurahNumber, "ar"),
			memorizedVerseFrom: data.startVerse,
			startSurahNumber: data.startSurahNumber,
			endSurahNumber: data.endSurahNumber,
			endSurahName: getSurahName(data.endSurahNumber, "ar"),
			memorizedVerseTo: data.endVerse,
			rangeMode: data.rangeMode,
			sessionDate: data.sessionDate,
			sessionTime: data.sessionTime ?? null,
			notes: data.notes ?? null,
			evaluation: data.evaluation ?? null,
		});
		return { ok: true };
	});

/** Student: the review being submitted (assigned range + ownership check). */
export const getSubmitReviewData = createServerFn({ method: "GET" })
	.validator(z.object({ reviewId: z.string() }))
	.handler(async ({ data }) => {
		const u = await requireUser();
		const [review] = await db
			.select()
			.from(reviews)
			.where(and(eq(reviews.id, data.reviewId), eq(reviews.studentId, u.id)))
			.limit(1);
		return { review: review ?? null };
	});

/** Student: submit a completion → records submission, completes review, scores it. */
export const submitReview = createServerFn({ method: "POST" })
	.validator(z.object({ reviewId: z.string(), ...rangeFields }))
	.handler(async ({ data }) => {
		const u = await requireUser();
		const { getSurahName } = await import("@quran/db/domain/surahs");
		const { calculatePoints, nextStreak, applyPoints } = await import("@quran/db/domain/scoring");
		const { reviewSubmissions } = await import("@quran/db/tables/review-submission.drizzle");
		const { user: userTable } = await import("@quran/db/tables/auth.drizzle");

		const [review] = await db
			.select()
			.from(reviews)
			.where(and(eq(reviews.id, data.reviewId), eq(reviews.studentId, u.id)))
			.limit(1);
		if (!review) return { ok: false as const };

		await db.insert(reviewSubmissions).values({
			reviewId: review.id,
			studentId: u.id,
			startSurahNumber: data.startSurahNumber,
			startSurahName: getSurahName(data.startSurahNumber, "ar"),
			startVerse: data.startVerse,
			endSurahNumber: data.endSurahNumber,
			endSurahName: getSurahName(data.endSurahNumber, "ar"),
			endVerse: data.endVerse,
		});

		const todayStr = today();
		const [earned] = calculatePoints(review.assignedDate, todayStr);
		if (review.status !== "completed") {
			await db
				.update(reviews)
				.set({ status: "completed", completedAt: new Date(), pointsEarned: earned })
				.where(eq(reviews.id, review.id));
			const newPoints = applyPoints(u.points, earned);
			const newStreak = nextStreak(u.streak, (u as { streakLastDate?: string | null }).streakLastDate ?? null, todayStr);
			await db
				.update(userTable)
				.set({ points: newPoints, streak: newStreak, streakLastDate: todayStr })
				.where(eq(userTable.id, u.id));
		}
		return { ok: true as const, earned };
	});

export const joinCircleByCode = createServerFn({ method: "POST" })
	.validator(z.object({ code: z.string().min(1).max(8) }))
	.handler(async ({ data }) => {
		const u = await requireUser();
		const circle = await findCircleByCode(data.code);
		if (!circle) return { ok: false as const, error: "not_found" };
		await db.insert(joinRequests).values({
			userId: u.id,
			circleId: circle.id,
			requestedRole: u.role === "teacher" ? "teacher" : "student",
			status: "pending",
		});
		return { ok: true as const, circleTitle: circle.title };
	});
