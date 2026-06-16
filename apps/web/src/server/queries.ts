import { db } from "@quran/db/db";
import { isStartAdvance, MUSHAF_PAGES } from "@quran/db/domain/review-cycle";
import {
	createCircle,
	findCircleByCode,
	listCirclesForUser,
} from "@quran/db/repositories/circle";
import {
	getLeaderboard,
	type LeaderboardPeriod,
} from "@quran/db/repositories/leaderboard";
import {
	listNotifications,
	markAllRead,
	unreadCount,
} from "@quran/db/repositories/notification";
import { joinRequests } from "@quran/db/tables/join-request.drizzle";
import { reviews } from "@quran/db/tables/review.drizzle";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { sendPush } from "./push.ts";

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
export const getVapidPublicKey = createServerFn({ method: "GET" }).handler(
	async () => {
		return { key: process.env.VAPID_PUBLIC_KEY ?? "" };
	},
);

/** Minimal current-user info for headers/settings. */
export const getMe = createServerFn({ method: "GET" }).handler(async () => {
	const u = await requireUser();
	return {
		id: u.id,
		name: u.name,
		role: u.role,
		points: u.points,
		streak: u.streak,
	};
});

/** Student home payload: circles, active + undone reviews, and the 4 stat cards. */
export const getStudentHome = createServerFn({ method: "GET" }).handler(
	async () => {
		const u = await requireUser();
		const circles = await listCirclesForUser(u.id);

		const { learningCircles } = await import(
			"@quran/db/tables/learning-circle.drizzle"
		);
		const pendingRequests = await db
			.select({ id: joinRequests.id, circleTitle: learningCircles.title })
			.from(joinRequests)
			.innerJoin(learningCircles, eq(joinRequests.circleId, learningCircles.id))
			.where(
				and(eq(joinRequests.userId, u.id), eq(joinRequests.status, "pending")),
			)
			.orderBy(desc(joinRequests.createdAt));

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
		const onTimeRate =
			completedCount > 0
				? Math.round((Number(onTime) / completedCount) * 100)
				: 0;

		const { planChangeRequests } = await import(
			"@quran/db/tables/plan-change-request.drizzle"
		);
		const pendingPlanChange = await db
			.select({ id: planChangeRequests.id })
			.from(planChangeRequests)
			.where(
				and(
					eq(planChangeRequests.studentId, u.id),
					eq(planChangeRequests.status, "pending"),
				),
			)
			.limit(1);

		return {
			user: { id: u.id, name: u.name, points: u.points, streak: u.streak },
			circles,
			pendingRequests,
			hasPendingPlanChange: pendingPlanChange.length > 0,
			activeReview: pending[0] ?? null,
			// A pages review that met its target is still `pending` (so it stays
			// submittable today) — don't list it as outstanding work.
			undoneReviews: [...pending.slice(1), ...missed].filter(
				(r) => !(r.rangeMode === "pages" && r.completedAt != null),
			),
			stats: {
				points: u.points,
				completed: completedCount,
				onTime: onTimeRate,
				streak: u.streak,
			},
		};
	},
);

export const getLeaderboardData = createServerFn({ method: "GET" })
	.validator((d: { period: LeaderboardPeriod }) => d)
	.handler(async ({ data }) => {
		const u = await requireUser();
		const entries = await getLeaderboard(data.period, today());
		return { entries, meId: u.id };
	});

export const getNotifications = createServerFn({ method: "GET" }).handler(
	async () => {
		const u = await requireUser();
		const [items, unread] = await Promise.all([
			listNotifications(u.id),
			unreadCount(u.id),
		]);
		return { items, unread };
	},
);

export const markAllNotificationsRead = createServerFn({
	method: "POST",
}).handler(async () => {
	const u = await requireUser();
	const marked = await markAllRead(u.id);
	return { marked };
});

/** Teacher: circles I own/teach, each with its student members. */
export const getTeacherHome = createServerFn({ method: "GET" }).handler(
	async () => {
		const u = await requireUser();
		const circles = await listCirclesForUser(u.id);
		const { circleMemberships } = await import(
			"@quran/db/tables/circle-membership.drizzle"
		);
		const { user: userTable } = await import("@quran/db/tables/auth.drizzle");
		const withStudents = await Promise.all(
			circles.map(async (c) => {
				const students = await db
					.select({ id: userTable.id, name: userTable.name })
					.from(circleMemberships)
					.innerJoin(userTable, eq(circleMemberships.userId, userTable.id))
					.where(
						and(
							eq(circleMemberships.circleId, c.id),
							eq(circleMemberships.role, "student"),
						),
					);
				return { ...c, students };
			}),
		);
		return { user: { id: u.id, name: u.name }, circles: withStudents };
	},
);

/** Teacher: pending join requests across circles I own. */
export const getJoinRequests = createServerFn({ method: "GET" }).handler(
	async () => {
		const u = await requireUser();
		const { learningCircles } = await import(
			"@quran/db/tables/learning-circle.drizzle"
		);
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
			.where(
				and(
					eq(learningCircles.ownerTeacherId, u.id),
					eq(joinRequests.status, "pending"),
				),
			)
			.orderBy(desc(joinRequests.createdAt));
		return { requests: rows };
	},
);

export const respondJoinRequest = createServerFn({ method: "POST" })
	.validator(
		z.object({
			id: z.string().uuid(),
			status: z.enum(["approved", "rejected"]),
		}),
	)
	.handler(async ({ data }) => {
		await requireUser();
		const { circleMemberships } = await import(
			"@quran/db/tables/circle-membership.drizzle"
		);
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
		const { reviewPlans } = await import(
			"@quran/db/tables/review-plan.drizzle"
		);
		const { sessionRecords } = await import(
			"@quran/db/tables/session-record.drizzle"
		);
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
			.where(
				and(
					eq(reviewPlans.studentId, data.studentId),
					eq(reviewPlans.isActive, true),
				),
			)
			.limit(1);
		const reviewRows = await db
			.select({
				id: reviews.id,
				surahName: reviews.surahName,
				verseFrom: reviews.verseFrom,
				verseTo: reviews.verseTo,
				rangeMode: reviews.rangeMode,
				startPage: reviews.startPage,
				endPage: reviews.endPage,
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
		return {
			student: student ?? null,
			plan: plan ?? null,
			reviews: reviewRows,
			sessions: sessionRows,
		};
	});

/** Teacher: deactivate a student's active review plan. */
export const removeReviewPlan = createServerFn({ method: "POST" })
	.validator(z.object({ studentId: z.string() }))
	.handler(async ({ data }) => {
		await requireUser();
		const { reviewPlans } = await import(
			"@quran/db/tables/review-plan.drizzle"
		);
		await db
			.update(reviewPlans)
			.set({ isActive: false })
			.where(
				and(
					eq(reviewPlans.studentId, data.studentId),
					eq(reviewPlans.isActive, true),
				),
			);
		return { ok: true };
	});

/** Current student's reviews + sessions for the progress screen. */
export const getStudentProgress = createServerFn({ method: "GET" }).handler(
	async () => {
		const u = await requireUser();
		const { sessionRecords } = await import(
			"@quran/db/tables/session-record.drizzle"
		);
		const reviewRows = await db
			.select({
				id: reviews.id,
				surahName: reviews.surahName,
				verseFrom: reviews.verseFrom,
				verseTo: reviews.verseTo,
				rangeMode: reviews.rangeMode,
				startPage: reviews.startPage,
				endPage: reviews.endPage,
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
	},
);

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
		const { reviewPlans } = await import(
			"@quran/db/tables/review-plan.drizzle"
		);
		const [student] = await db
			.select({ id: userTable.id, name: userTable.name })
			.from(userTable)
			.where(eq(userTable.id, data.studentId))
			.limit(1);
		const [plan] = await db
			.select()
			.from(reviewPlans)
			.where(
				and(
					eq(reviewPlans.studentId, data.studentId),
					eq(reviewPlans.isActive, true),
				),
			)
			.limit(1);
		return { student: student ?? null, plan: plan ?? null };
	});

/** Teacher: create or update the student's active review plan. */
export const assignReviewPlan = createServerFn({ method: "POST" })
	.validator(
		z.object({
			studentId: z.string(),
			dailyAmount: z.number().int().min(1),
			rangeMode: z.enum(["verses", "pages"]).default("verses"),
			// Verse fields required for verses mode; page fields for pages mode.
			startSurahNumber: z.number().int().optional(),
			startVerse: z.number().int().optional(),
			endSurahNumber: z.number().int().optional(),
			endVerse: z.number().int().optional(),
			startPage: z.number().int().min(1).max(MUSHAF_PAGES).optional(),
		}),
	)
	.handler(async ({ data }) => {
		const teacher = await requireUser();
		const { reviewPlans } = await import(
			"@quran/db/tables/review-plan.drizzle"
		);
		const existing = await db
			.select({ id: reviewPlans.id, startPage: reviewPlans.startPage })
			.from(reviewPlans)
			.where(
				and(
					eq(reviewPlans.studentId, data.studentId),
					eq(reviewPlans.isActive, true),
				),
			)
			.limit(1);
		const isPages = data.rangeMode === "pages";
		// Re-anchor the next review when a teacher edit changes the start page.
		const startPageChanged =
			isPages &&
			!!existing[0] &&
			(existing[0].startPage ?? null) !== (data.startPage ?? 1);
		const values = {
			studentId: data.studentId,
			teacherId: teacher.id,
			// reviewPlans keeps verse columns NOT NULL; pages plans store placeholders
			// (the scheduler ignores them and uses startPage/endPage instead).
			startSurahNumber: data.startSurahNumber ?? 1,
			startVerse: data.startVerse ?? 1,
			endSurahNumber: data.endSurahNumber ?? 1,
			endVerse: data.endVerse ?? 1,
			rangeMode: data.rangeMode,
			startPage: isPages ? (data.startPage ?? 1) : null,
			endPage: isPages ? MUSHAF_PAGES : null,
			dailyAmount: data.dailyAmount,
			dailyUnit: data.rangeMode,
			isActive: true,
			cursorReset: startPageChanged,
		};
		let planId: string;
		let updated: boolean;
		if (existing[0]) {
			await db
				.update(reviewPlans)
				.set(values)
				.where(eq(reviewPlans.id, existing[0].id));
			planId = existing[0].id;
			updated = true;
		} else {
			const [row] = await db
				.insert(reviewPlans)
				.values(values)
				.returning({ id: reviewPlans.id });
			planId = row.id;
			updated = false;
		}

		// Create today's review immediately (don't wait for the daily cron), so the
		// student sees it right after the plan is assigned.
		const { ensureTodayReview } = await import("./scheduler.ts");
		await ensureTodayReview(
			{
				id: planId,
				studentId: values.studentId,
				teacherId: values.teacherId,
				startSurahNumber: values.startSurahNumber,
				startVerse: values.startVerse,
				endSurahNumber: values.endSurahNumber,
				endVerse: values.endVerse,
				startPage: values.startPage,
				dailyAmount: values.dailyAmount,
				rangeMode: values.rangeMode,
				cursorReset: values.cursorReset,
			},
			today(),
		);
		return { ok: true, updated };
	});

// ── Student-initiated plan changes (with teacher approval) ──

/** Queue a teacher notification for a plan-change event (+ best-effort push). */
async function notifyPlanChange(
	userId: string,
	eventType: string,
	title: string,
	body: string,
	dedupeKey: string,
) {
	const { notificationDeliveries } = await import(
		"@quran/db/tables/notification-delivery.drizzle"
	);
	await db.insert(notificationDeliveries).values({
		userId,
		eventType,
		title,
		body,
		status: "sent",
		dedupeKey,
		sentAt: new Date(),
	});
	await sendPush(userId, { title, body, data: { url: "/" } });
}

/** Student: their own active plan + any pending change request (for the editor). */
export const getStudentPlan = createServerFn({ method: "GET" }).handler(
	async () => {
		const u = await requireUser();
		const { reviewPlans } = await import(
			"@quran/db/tables/review-plan.drizzle"
		);
		const { planChangeRequests } = await import(
			"@quran/db/tables/plan-change-request.drizzle"
		);
		const [plan] = await db
			.select()
			.from(reviewPlans)
			.where(
				and(eq(reviewPlans.studentId, u.id), eq(reviewPlans.isActive, true)),
			)
			.limit(1);
		const pendingChange = plan
			? ((
					await db
						.select()
						.from(planChangeRequests)
						.where(
							and(
								eq(planChangeRequests.reviewPlanId, plan.id),
								eq(planChangeRequests.status, "pending"),
							),
						)
						.limit(1)
				)[0] ?? null)
			: null;
		return { plan: plan ?? null, pendingChange };
	},
);

/**
 * Student: request a change to their active plan. Changes that ease the workload
 * (fewer pages/day, or a later start page) are queued for teacher approval; the
 * rest apply immediately. Returns `applied` to tell the UI which path happened.
 */
export const requestPlanChange = createServerFn({ method: "POST" })
	.validator(
		z.object({
			field: z.enum(["daily_amount", "start_page"]),
			dailyAmount: z.number().int().min(1).optional(),
			startPage: z.number().int().min(1).max(MUSHAF_PAGES).optional(),
		}),
	)
	.handler(async ({ data }) => {
		const u = await requireUser();
		const { reviewPlans } = await import(
			"@quran/db/tables/review-plan.drizzle"
		);
		const { planChangeRequests } = await import(
			"@quran/db/tables/plan-change-request.drizzle"
		);
		const [plan] = await db
			.select()
			.from(reviewPlans)
			.where(
				and(eq(reviewPlans.studentId, u.id), eq(reviewPlans.isActive, true)),
			)
			.limit(1);
		if (!plan) return { ok: false as const, error: "no_plan" as const };

		const pending = await db
			.select({ id: planChangeRequests.id })
			.from(planChangeRequests)
			.where(
				and(
					eq(planChangeRequests.reviewPlanId, plan.id),
					eq(planChangeRequests.status, "pending"),
				),
			)
			.limit(1);
		if (pending[0])
			return { ok: false as const, error: "already_requested" as const };

		// Decide: apply immediately, or queue for teacher approval.
		let needsApproval: boolean;
		if (data.field === "daily_amount") {
			const proposed = data.dailyAmount;
			if (proposed == null)
				return { ok: false as const, error: "invalid" as const };
			needsApproval = proposed < plan.dailyAmount; // decreasing → approval
			if (!needsApproval) {
				await db
					.update(reviewPlans)
					.set({ dailyAmount: proposed })
					.where(eq(reviewPlans.id, plan.id));
				return { ok: true as const, applied: true as const };
			}
		} else {
			const proposed = data.startPage;
			if (proposed == null)
				return { ok: false as const, error: "invalid" as const };
			needsApproval = isStartAdvance(plan.startPage ?? 1, proposed); // later → approval
			if (!needsApproval) {
				// cursorReset: the next review re-anchors to the new start page.
				await db
					.update(reviewPlans)
					.set({ startPage: proposed, cursorReset: true })
					.where(eq(reviewPlans.id, plan.id));
				return { ok: true as const, applied: true as const };
			}
		}

		// Queue: keep the old value, notify the teacher.
		await db.insert(planChangeRequests).values({
			reviewPlanId: plan.id,
			studentId: u.id,
			teacherId: plan.teacherId,
			field: data.field,
			proposedDailyAmount:
				data.field === "daily_amount" ? (data.dailyAmount ?? null) : null,
			proposedStartPage:
				data.field === "start_page" ? (data.startPage ?? null) : null,
			status: "pending",
		});
		await notifyPlanChange(
			plan.teacherId,
			"plan_change_requested",
			"طلب تعديل الخطة",
			`${u.name} يطلب تعديل خطته`,
			`plan_change:${plan.id}:${data.field}`,
		);
		return { ok: true as const, applied: false as const };
	});

/** Teacher: pending plan-change requests across my students (+ current values). */
export const getPlanChangeRequests = createServerFn({ method: "GET" }).handler(
	async () => {
		const u = await requireUser();
		const { user: userTable } = await import("@quran/db/tables/auth.drizzle");
		const { reviewPlans } = await import(
			"@quran/db/tables/review-plan.drizzle"
		);
		const { planChangeRequests } = await import(
			"@quran/db/tables/plan-change-request.drizzle"
		);
		const requests = await db
			.select({
				id: planChangeRequests.id,
				field: planChangeRequests.field,
				proposedDailyAmount: planChangeRequests.proposedDailyAmount,
				proposedStartPage: planChangeRequests.proposedStartPage,
				studentName: userTable.name,
				currentDailyAmount: reviewPlans.dailyAmount,
				currentStartPage: reviewPlans.startPage,
			})
			.from(planChangeRequests)
			.innerJoin(userTable, eq(planChangeRequests.studentId, userTable.id))
			.innerJoin(
				reviewPlans,
				eq(planChangeRequests.reviewPlanId, reviewPlans.id),
			)
			.where(
				and(
					eq(planChangeRequests.teacherId, u.id),
					eq(planChangeRequests.status, "pending"),
				),
			)
			.orderBy(desc(planChangeRequests.createdAt));
		return { requests };
	},
);

/** Teacher: approve (apply to the plan) or reject a plan-change request. */
export const respondPlanChange = createServerFn({ method: "POST" })
	.validator(
		z.object({
			id: z.string().uuid(),
			status: z.enum(["approved", "rejected"]),
		}),
	)
	.handler(async ({ data }) => {
		const u = await requireUser();
		const { reviewPlans } = await import(
			"@quran/db/tables/review-plan.drizzle"
		);
		const { planChangeRequests } = await import(
			"@quran/db/tables/plan-change-request.drizzle"
		);
		const [req] = await db
			.select()
			.from(planChangeRequests)
			.where(eq(planChangeRequests.id, data.id))
			.limit(1);
		if (!req || req.teacherId !== u.id || req.status !== "pending")
			return { ok: false as const };

		await db
			.update(planChangeRequests)
			.set({ status: data.status, resolvedAt: new Date() })
			.where(eq(planChangeRequests.id, req.id));

		if (data.status === "approved") {
			if (req.field === "daily_amount" && req.proposedDailyAmount != null)
				await db
					.update(reviewPlans)
					.set({ dailyAmount: req.proposedDailyAmount })
					.where(eq(reviewPlans.id, req.reviewPlanId));
			else if (req.field === "start_page" && req.proposedStartPage != null)
				await db
					.update(reviewPlans)
					.set({ startPage: req.proposedStartPage, cursorReset: true })
					.where(eq(reviewPlans.id, req.reviewPlanId));
			await notifyPlanChange(
				req.studentId,
				"plan_change_approved",
				"تمت الموافقة على التعديل",
				"وافق معلمك على تعديل خطتك",
				`plan_change_approved:${req.id}`,
			);
		} else {
			await notifyPlanChange(
				req.studentId,
				"plan_change_rejected",
				"تم رفض التعديل",
				"رفض معلمك تعديل خطتك",
				`plan_change_rejected:${req.id}`,
			);
		}
		return { ok: true as const };
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
		const { sessionRecords } = await import(
			"@quran/db/tables/session-record.drizzle"
		);
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
	.validator(
		z.object({
			reviewId: z.string(),
			rangeMode: z.enum(["verses", "pages"]).default("verses"),
			startSurahNumber: z.number().int().optional(),
			startVerse: z.number().int().optional(),
			endSurahNumber: z.number().int().optional(),
			endVerse: z.number().int().optional(),
			// pages-mode: the absolute page the student has reached now
			currentPage: z.number().int().min(1).max(MUSHAF_PAGES).optional(),
		}),
	)
	.handler(async ({ data }) => {
		const u = await requireUser();
		const { getSurahName } = await import("@quran/db/domain/surahs");
		const { calculatePoints, nextStreak, applyPoints } = await import(
			"@quran/db/domain/scoring"
		);
		const { reviewSubmissions } = await import(
			"@quran/db/tables/review-submission.drizzle"
		);
		const { user: userTable } = await import("@quran/db/tables/auth.drizzle");

		const [review] = await db
			.select()
			.from(reviews)
			.where(and(eq(reviews.id, data.reviewId), eq(reviews.studentId, u.id)))
			.limit(1);
		if (!review) return { ok: false as const };

		const todayStr = today();
		const streakLastDate =
			(u as { streakLastDate?: string | null }).streakLastDate ?? null;

		// Pages mode: cumulative actual-progress. The student reports the page
		// reached now; progress is monotonic. Points are awarded once, the moment
		// the day's target is first met; status stays pending until the cron
		// finalizes at day-end so the review remains submittable for overachieving.
		if (review.rangeMode === "pages") {
			const dayStart = review.startPage ?? 1;
			const dayEnd = review.endPage ?? dayStart;
			const reported = Math.min(
				Math.max(data.currentPage ?? dayEnd, dayStart),
				MUSHAF_PAGES,
			);
			const progressPage = Math.max(
				review.progressPage ?? dayStart - 1,
				reported,
			);
			const targetMet = progressPage >= dayEnd;
			const alreadyScored = review.completedAt != null;

			let earned = review.pointsEarned;
			if (targetMet && !alreadyScored) {
				[earned] = calculatePoints(review.assignedDate, todayStr);
				await db
					.update(reviews)
					.set({ progressPage, completedAt: new Date(), pointsEarned: earned })
					.where(eq(reviews.id, review.id));
				const newPoints = applyPoints(u.points, earned);
				const newStreak = nextStreak(u.streak, streakLastDate, todayStr);
				await db
					.update(userTable)
					.set({
						points: newPoints,
						streak: newStreak,
						streakLastDate: todayStr,
					})
					.where(eq(userTable.id, u.id));
			} else {
				await db
					.update(reviews)
					.set({ progressPage })
					.where(eq(reviews.id, review.id));
			}
			return { ok: true as const, earned, progressPage, targetMet };
		}

		// Verses mode: record the verse-range submission and complete once.
		if (
			data.startSurahNumber != null &&
			data.startVerse != null &&
			data.endSurahNumber != null &&
			data.endVerse != null
		)
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

		const [earned] = calculatePoints(review.assignedDate, todayStr);
		if (review.status !== "completed") {
			await db
				.update(reviews)
				.set({
					status: "completed",
					completedAt: new Date(),
					pointsEarned: earned,
				})
				.where(eq(reviews.id, review.id));
			const newPoints = applyPoints(u.points, earned);
			const newStreak = nextStreak(u.streak, streakLastDate, todayStr);
			await db
				.update(userTable)
				.set({ points: newPoints, streak: newStreak, streakLastDate: todayStr })
				.where(eq(userTable.id, u.id));
		}
		return { ok: true as const, earned, targetMet: true };
	});

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "invalid_time");

/** Teacher: create a new learning circle (with optional weekly time slots). */
export const createCircleFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			title: z.string().trim().min(1),
			description: z.string().trim().optional(),
			location: z.string().trim().optional(),
			reminderHoursBeforeStart: z.number().int().min(0).max(24).default(2),
			timeSlots: z
				.array(
					z.object({
						dayOfWeek: z.number().int().min(0).max(6),
						startTime: hhmm,
						endTime: hhmm,
					}),
				)
				.default([]),
		}),
	)
	.handler(async ({ data }) => {
		const u = await requireUser();
		if (u.role !== "teacher") {
			return { ok: false as const, error: "forbidden" };
		}

		// Validate each slot's range and reject same-day overlaps.
		const byDay = new Map<number, { start: string; end: string }[]>();
		for (const s of data.timeSlots) {
			if (s.startTime >= s.endTime) {
				return { ok: false as const, error: "invalid_range" };
			}
			const day = byDay.get(s.dayOfWeek) ?? [];
			for (const other of day) {
				if (s.startTime < other.end && other.start < s.endTime) {
					return { ok: false as const, error: "overlap" };
				}
			}
			day.push({ start: s.startTime, end: s.endTime });
			byDay.set(s.dayOfWeek, day);
		}

		const circle = await createCircle({
			ownerTeacherId: u.id,
			title: data.title,
			description: data.description?.trim() || null,
			location: data.location?.trim() || null,
			reminderHoursBeforeStart: data.reminderHoursBeforeStart,
			slots: data.timeSlots,
		});

		return { ok: true as const, id: circle.id, code: circle.code };
	});

export const joinCircleByCode = createServerFn({ method: "POST" })
	.validator(z.object({ code: z.string().min(1).max(8) }))
	.handler(async ({ data }) => {
		const u = await requireUser();
		const circle = await findCircleByCode(data.code);
		if (!circle) return { ok: false as const, error: "not_found" };

		const { circleMemberships } = await import(
			"@quran/db/tables/circle-membership.drizzle"
		);

		// Owner or existing member → already in this circle.
		if (circle.ownerTeacherId === u.id) {
			return { ok: false as const, error: "already_member" };
		}
		const member = await db
			.select({ id: circleMemberships.id })
			.from(circleMemberships)
			.where(
				and(
					eq(circleMemberships.circleId, circle.id),
					eq(circleMemberships.userId, u.id),
				),
			)
			.limit(1);
		if (member[0]) return { ok: false as const, error: "already_member" };

		// Don't pile up duplicate pending requests.
		const pending = await db
			.select({ id: joinRequests.id })
			.from(joinRequests)
			.where(
				and(
					eq(joinRequests.circleId, circle.id),
					eq(joinRequests.userId, u.id),
					eq(joinRequests.status, "pending"),
				),
			)
			.limit(1);
		if (pending[0]) {
			return {
				ok: false as const,
				error: "already_requested",
				circleTitle: circle.title,
			};
		}

		await db.insert(joinRequests).values({
			userId: u.id,
			circleId: circle.id,
			requestedRole: u.role === "teacher" ? "teacher" : "student",
			status: "pending",
		});
		return { ok: true as const, circleTitle: circle.title };
	});
