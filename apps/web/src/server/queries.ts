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

/** Teacher: circles I own/teach. */
export const getTeacherHome = createServerFn({ method: "GET" }).handler(async () => {
	const u = await requireUser();
	const circles = await listCirclesForUser(u.id);
	return { user: { id: u.id, name: u.name }, circles };
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
