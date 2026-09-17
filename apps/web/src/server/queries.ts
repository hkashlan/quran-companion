import { db } from "@quran/db/db";
import {
	backlogDebtPages,
	collapseBacklog,
	outstandingPageUnion,
} from "@quran/db/domain/backlog";
import {
	canExcuse,
	excuseAllowance,
	excuseBalance,
	monthKey,
} from "@quran/db/domain/excuse";
import {
	CATCHUP_DAY_CHOICES,
	distributePreview,
	effectiveDailyAmount,
	startTodayPreview,
} from "@quran/db/domain/plan-reset";
import { MUSHAF_PAGES } from "@quran/db/domain/review-cycle";
import {
	createCircle,
	findCircleByCode,
	leaveCircle,
	listCircleMates,
	listCirclesForUser,
} from "@quran/db/repositories/circle";
import {
	getLeaderboard,
	type LeaderboardPeriod,
} from "@quran/db/repositories/leaderboard";
import {
	deleteAll,
	deleteOne,
	listNotifications,
	markAllRead,
	markRead,
	unreadCount,
} from "@quran/db/repositories/notification";
import { excuseDays } from "@quran/db/tables/excuse-day.drizzle";
import { joinRequests } from "@quran/db/tables/join-request.drizzle";
import { reviews } from "@quran/db/tables/review.drizzle";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { and, asc, count, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { circleMateDoneMessage } from "./notification-i18n.ts";
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

/**
 * Arabic clock time ("14:30") for a notification body, in the reader's zone.
 * Latin digits to match the page numbers already used in those bodies. Falls
 * back to UTC when the stored timezone is missing or not a valid IANA name.
 */
function formatTimeAr(at: Date, timeZone: string | null | undefined): string {
	const opts: Intl.DateTimeFormatOptions = {
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
		numberingSystem: "latn",
	};
	try {
		return new Intl.DateTimeFormat("ar", {
			...opts,
			timeZone: timeZone ?? "UTC",
		}).format(at);
	} catch {
		return new Intl.DateTimeFormat("ar", { ...opts, timeZone: "UTC" }).format(
			at,
		);
	}
}

/**
 * Arabic calendar-day label ("الأحد 5 أغسطس") for a `YYYY-MM-DD` review date.
 * Formatted in UTC on purpose: the value is a calendar date, not an instant, so
 * applying a zone offset would shift it onto the wrong day.
 */
function formatDayAr(isoDate: string): string {
	return new Intl.DateTimeFormat("ar", {
		timeZone: "UTC",
		weekday: "long",
		day: "numeric",
		month: "long",
		numberingSystem: "latn",
	}).format(new Date(`${isoDate}T00:00:00Z`));
}

/** Circle "did you do it yet?" nudges are held back before this local hour. */
const CIRCLE_NUDGE_HOUR = 14;

/**
 * Wall-clock hour (0-23) right now in the given IANA zone; UTC when the zone
 * is missing or invalid.
 */
function hourIn(timeZone: string | null | undefined): number {
	try {
		return Number(
			new Intl.DateTimeFormat("en-GB", {
				hour: "2-digit",
				hour12: false,
				timeZone: timeZone ?? "UTC",
			}).format(new Date()),
		);
	} catch {
		return new Date().getUTCHours();
	}
}

/**
 * Every circle the teacher *teaches*, with its student members. Shared by the
 * teacher screens. Circles the teacher joined as a student are left out — those
 * belong to their student view, and their classmates are not their students.
 */
async function circlesWithStudents(userId: string) {
	const circles = (await listCirclesForUser(userId)).filter(
		(c) => c.memberRole !== "student",
	);
	const { circleMemberships } = await import(
		"@quran/db/tables/circle-membership.drizzle"
	);
	const { user: userTable } = await import("@quran/db/tables/auth.drizzle");
	return Promise.all(
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
}

/**
 * Newest review assigned today per student (first row wins). Looked up by
 * student (circle membership) rather than by `reviews.teacherId`, so every
 * teacher of the circle sees the student's progress whoever assigned the plan.
 */
async function todayReviewByStudent(studentIds: string[], todayStr: string) {
	const rows =
		studentIds.length === 0
			? []
			: await db
					.select({
						studentId: reviews.studentId,
						startPage: reviews.startPage,
						endPage: reviews.endPage,
						progressPage: reviews.progressPage,
						status: reviews.status,
					})
					.from(reviews)
					.where(
						and(
							inArray(reviews.studentId, studentIds),
							eq(reviews.assignedDate, todayStr),
						),
					)
					.orderBy(desc(reviews.createdAt));
	const byStudent = new Map<string, (typeof rows)[number]>();
	for (const r of rows) {
		if (!byStudent.has(r.studentId)) byStudent.set(r.studentId, r);
	}
	return byStudent;
}

/** Public VAPID key for the client push-subscribe flow ("" if unconfigured). */
export const getVapidPublicKey = createServerFn({ method: "GET" }).handler(
	async () => {
		return { key: process.env.VAPID_PUBLIC_KEY ?? "" };
	},
);

/**
 * Public Firebase web config + Web Push VAPID key for the FCM browser flow.
 * The config object is non-secret (shipped to every browser), so it lives in
 * env as one-line JSON. Returns `{ config: null }` when Firebase web push isn't
 * configured, letting the client fall back to the native VAPID web-push path.
 */
export const getFirebaseConfig = createServerFn({ method: "GET" }).handler(
	async () => {
		const raw = process.env.FIREBASE_WEB_CONFIG;
		const vapidKey = process.env.FIREBASE_VAPID_KEY ?? "";
		if (!raw || !vapidKey) return { config: null, vapidKey: "" };
		try {
			return {
				config: JSON.parse(raw) as Record<string, string>,
				vapidKey,
			};
		} catch {
			return { config: null, vapidKey: "" };
		}
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
		// Only circles I'm a *student* in — a teacher opening this view to follow
		// their own learning shouldn't see the circles they teach here.
		const circles = (await listCirclesForUser(u.id)).filter(
			(c) => c.memberRole === "student",
		);

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

		// "On time" means the full 10 points were awarded — i.e. completed on the
		// day it was assigned. Testing `completedAt is not null` would be vacuous:
		// the cron only ever promotes a stamped row to "completed", so that
		// predicate made the rate a permanent 100%. Same rule as ReviewProgress.
		const [{ onTime }] = await db
			.select({ onTime: count() })
			.from(reviews)
			.where(
				and(
					eq(reviews.studentId, u.id),
					eq(reviews.status, "completed"),
					eq(reviews.pointsEarned, 10),
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

		// The home "active review" is today's review — surfaced even after it is
		// completed/target-met, so the student can keep adjusting what they did
		// today. If the daily cron hasn't created it yet (and there's an active
		// plan), create it now so the card is never empty for an enrolled student.
		const todayStr = today();
		const { reviewPlans } = await import(
			"@quran/db/tables/review-plan.drizzle"
		);
		const [activePlan] = await db
			.select()
			.from(reviewPlans)
			.where(
				and(eq(reviewPlans.studentId, u.id), eq(reviewPlans.isActive, true)),
			)
			.limit(1);
		const loadTodayReview = async () =>
			(
				await db
					.select()
					.from(reviews)
					.where(
						and(
							eq(reviews.studentId, u.id),
							eq(reviews.assignedDate, todayStr),
						),
					)
					.orderBy(desc(reviews.createdAt))
					.limit(1)
			)[0] ?? null;
		let activeReview = await loadTodayReview();
		if (!activeReview && activePlan) {
			const { ensureTodayReview } = await import("./scheduler.ts");
			await ensureTodayReview(activePlan, todayStr);
			activeReview = await loadTodayReview();
		}
		if (!activeReview) activeReview = pending[0] ?? null;

		// Outstanding work: older pending + missed reviews, minus today's active
		// review and any pages review that already met its target (still editable
		// on the active-review card).
		const undone = [...pending, ...missed].filter(
			(r) =>
				r.id !== activeReview?.id &&
				!(r.rangeMode === "pages" && r.completedAt != null),
		);

		return {
			user: {
				id: u.id,
				name: u.name,
				role: u.role,
				points: u.points,
				streak: u.streak,
			},
			circles,
			pendingRequests,
			hasPendingPlanChange: pendingPlanChange.length > 0,
			activeReview,
			// Collapsed view for the home screen: newest few, colour-graded by age,
			// with the escalation flags. Pages are a *union* — a missed day re-issues
			// its window, so the rows overlap and must never be summed.
			backlog: {
				...collapseBacklog(undone, todayStr),
				pages: outstandingPageUnion(undone),
			},
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

/** Mark a single notification (owned by the current user) as read. */
export const markNotificationRead = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.string() }))
	.handler(async ({ data }) => {
		const u = await requireUser();
		await markRead(u.id, data.id);
		return { ok: true };
	});

/** Delete a single notification owned by the current user. */
export const deleteNotification = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.string() }))
	.handler(async ({ data }) => {
		const u = await requireUser();
		await deleteOne(u.id, data.id);
		return { ok: true };
	});

/** Delete all of the current user's notifications. */
export const deleteAllNotifications = createServerFn({
	method: "POST",
}).handler(async () => {
	const u = await requireUser();
	const deleted = await deleteAll(u.id);
	return { deleted };
});

/**
 * Teacher home: the circles I teach, each with its students. (The teacher's own
 * learning — circles joined as a student — comes from getStudentHome.)
 */
export const getTeacherHome = createServerFn({ method: "GET" }).handler(
	async () => {
		const u = await requireUser();
		const circles = await circlesWithStudents(u.id);
		return { user: { id: u.id, name: u.name }, circles };
	},
);

/**
 * Teacher: today's progress for every student in my circles — pages they were
 * assigned to read today (target) and how far they've reached (done). Powers the
 * "Today" section on the leaderboard screen (nudge + jump-to-plan live there).
 */
export const getTeacherToday = createServerFn({ method: "GET" }).handler(
	async () => {
		const u = await requireUser();
		const circles = await circlesWithStudents(u.id);
		const reviewByStudent = await todayReviewByStudent(
			circles.flatMap((c) => c.students.map((s) => s.id)),
			today(),
		);
		return {
			circles: circles.map((c) => ({
				id: c.id,
				title: c.title,
				students: c.students.map((s) => {
					const r = reviewByStudent.get(s.id);
					if (!r || r.startPage == null || r.endPage == null) {
						return { id: s.id, name: s.name, today: null };
					}
					const target = Math.max(1, r.endPage - r.startPage + 1);
					const reached =
						r.progressPage != null
							? Math.max(r.progressPage - r.startPage + 1, 0)
							: 0;
					const done = Math.min(reached, target);
					// Pages read past today's assigned range (overachievement).
					const over = Math.max(reached - target, 0);
					return {
						id: s.id,
						name: s.name,
						today: { target, done, over, status: r.status },
					};
				}),
			})),
		};
	},
);

/**
 * Teacher: nudge a student with a push reminder to do today's review. Always
 * allowed (the dedupe key is per-send), so a teacher can re-remind if needed.
 */
export const nudgeStudent = createServerFn({ method: "POST" })
	.validator(z.object({ studentId: z.string() }))
	.handler(async ({ data }) => {
		const u = await requireUser();
		await notifyPlanChange(
			data.studentId,
			"review_reminder",
			"تذكير بالمراجعة",
			`${u.name} يذكّرك بمراجعة اليوم`,
			`review_reminder:${data.studentId}:${Date.now()}`,
			"/student",
		);
		return { ok: true as const };
	});

/**
 * Teacher: students in my circles who haven't finished today's assigned review
 * (not started or mid-review). Powers the "message late students" screen opened
 * from the hourly per-student push (see runTeacherSummary).
 */
export const getLateStudents = createServerFn({ method: "GET" }).handler(
	async () => {
		const u = await requireUser();
		const circles = await circlesWithStudents(u.id);
		const reviewByStudent = await todayReviewByStudent(
			circles.flatMap((c) => c.students.map((s) => s.id)),
			today(),
		);

		const seen = new Set<string>();
		const students: {
			id: string;
			name: string;
			done: number;
			target: number;
		}[] = [];
		for (const c of circles) {
			for (const s of c.students) {
				if (seen.has(s.id)) continue;
				const r = reviewByStudent.get(s.id);
				// No plan/review today → nothing due, so not "late".
				if (!r || r.startPage == null || r.endPage == null) continue;
				// An excused day counts as settled: the student asked for it and the
				// day no longer counts against them, so they must not be chased.
				const finished =
					r.status === "completed" ||
					r.status === "excused" ||
					r.status === "waived" ||
					(r.progressPage != null && r.progressPage >= r.endPage);
				if (finished) continue;
				const target = Math.max(1, r.endPage - r.startPage + 1);
				const reached =
					r.progressPage != null
						? Math.max(r.progressPage - r.startPage + 1, 0)
						: 0;
				const done = Math.min(reached, target);
				seen.add(s.id);
				students.push({ id: s.id, name: s.name, done, target });
			}
		}
		return { students };
	},
);

/**
 * Teacher: students in my circles who *have* finished today's assigned review.
 * Mirror of getLateStudents — powers the "message done students" screen, where
 * the teacher congratulates rather than chases.
 */
export const getDoneStudents = createServerFn({ method: "GET" }).handler(
	async () => {
		const u = await requireUser();
		const circles = await circlesWithStudents(u.id);
		const reviewByStudent = await todayReviewByStudent(
			circles.flatMap((c) => c.students.map((s) => s.id)),
			today(),
		);

		const seen = new Set<string>();
		const students: {
			id: string;
			name: string;
			done: number;
			target: number;
		}[] = [];
		for (const c of circles) {
			for (const s of c.students) {
				if (seen.has(s.id)) continue;
				const r = reviewByStudent.get(s.id);
				// No plan/review today → nothing to celebrate.
				if (!r || r.startPage == null || r.endPage == null) continue;
				// Only genuinely finished reading counts here: an excused/waived day is
				// settled for the "late" screen but is not an achievement to praise.
				const finished =
					r.status === "completed" ||
					(r.progressPage != null && r.progressPage >= r.endPage);
				if (!finished) continue;
				const target = Math.max(1, r.endPage - r.startPage + 1);
				// They're done, so the row always reads "target / target" — pages read
				// beyond today's range belong to tomorrow's assignment, not to this one.
				const done = target;
				seen.add(s.id);
				students.push({ id: s.id, name: s.name, done, target });
			}
		}
		return { students };
	},
);

/**
 * Teacher: send a free-text message (emoji-friendly) to the selected students —
 * used from the "late students" and "done students" screens. Restricted to
 * students that are actually in one of the teacher's circles. Each send is
 * un-deduped (timestamped key) so a teacher can message again.
 *
 * `saveTemplate` also stores the text for reuse (deduplicated per teacher, so
 * saving the same phrasing twice just refreshes its recency).
 */
export const messageStudents = createServerFn({ method: "POST" })
	.validator(
		z.object({
			studentIds: z.array(z.string()).min(1),
			message: z.string().trim().min(1).max(500),
			saveTemplate: z.boolean().optional(),
		}),
	)
	.handler(async ({ data }) => {
		const u = await requireUser();
		// Only message students who are genuinely in one of my circles.
		const circles = await circlesWithStudents(u.id);
		const mine = new Set(circles.flatMap((c) => c.students.map((s) => s.id)));
		const targets = data.studentIds.filter((id) => mine.has(id));
		const title = `رسالة من ${u.name}`;
		const stamp = Date.now();
		for (const studentId of targets) {
			await notifyPlanChange(
				studentId,
				"teacher_message",
				title,
				data.message,
				`teacher_message:${studentId}:${stamp}`,
				"/student",
			);
		}
		if (data.saveTemplate) await upsertTemplate(u.id, data.message);
		return { ok: true as const, sent: targets.length };
	});

/** Store (or refresh) one saved message for a teacher, most-recent-use first. */
async function upsertTemplate(teacherId: string, body: string) {
	const { messageTemplates } = await import(
		"@quran/db/tables/message-template.drizzle"
	);
	const [existing] = await db
		.select({ id: messageTemplates.id })
		.from(messageTemplates)
		.where(
			and(
				eq(messageTemplates.teacherId, teacherId),
				eq(messageTemplates.body, body),
			),
		)
		.limit(1);
	if (existing) {
		await db
			.update(messageTemplates)
			.set({ lastUsedAt: new Date() })
			.where(eq(messageTemplates.id, existing.id));
		return existing.id;
	}
	const [row] = await db
		.insert(messageTemplates)
		.values({ teacherId, body })
		.returning({ id: messageTemplates.id });
	return row.id;
}

/** Teacher: my saved messages, handiest (most recently used) first. */
export const getMessageTemplates = createServerFn({ method: "GET" }).handler(
	async () => {
		const u = await requireUser();
		const { messageTemplates } = await import(
			"@quran/db/tables/message-template.drizzle"
		);
		const templates = await db
			.select({ id: messageTemplates.id, body: messageTemplates.body })
			.from(messageTemplates)
			.where(eq(messageTemplates.teacherId, u.id))
			.orderBy(desc(messageTemplates.lastUsedAt))
			.limit(20);
		return { templates };
	},
);

/** Teacher: drop one of my saved messages. */
export const deleteMessageTemplate = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.string() }))
	.handler(async ({ data }) => {
		const u = await requireUser();
		const { messageTemplates } = await import(
			"@quran/db/tables/message-template.drizzle"
		);
		await db
			.delete(messageTemplates)
			.where(
				and(
					eq(messageTemplates.id, data.id),
					eq(messageTemplates.teacherId, u.id),
				),
			);
		return { ok: true as const };
	});

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

/**
 * Teacher: how many requests await my decision — join requests to circles I
 * own plus plan changes my students proposed. Badge on the Students tab.
 */
export const getPendingRequestsCount = createServerFn({
	method: "GET",
}).handler(async () => {
	const u = await requireUser();
	const { learningCircles } = await import(
		"@quran/db/tables/learning-circle.drizzle"
	);
	const { planChangeRequests } = await import(
		"@quran/db/tables/plan-change-request.drizzle"
	);
	const [[{ joins }], [{ plans }]] = await Promise.all([
		db
			.select({ joins: count() })
			.from(joinRequests)
			.innerJoin(learningCircles, eq(joinRequests.circleId, learningCircles.id))
			.where(
				and(
					eq(learningCircles.ownerTeacherId, u.id),
					eq(joinRequests.status, "pending"),
				),
			),
		db
			.select({ plans: count() })
			.from(planChangeRequests)
			.where(
				and(
					eq(planChangeRequests.teacherId, u.id),
					eq(planChangeRequests.status, "pending"),
				),
			),
	]);
	return { pending: Number(joins) + Number(plans) };
});

export const respondJoinRequest = createServerFn({ method: "POST" })
	.validator(
		z.object({
			id: z.string().uuid(),
			status: z.enum(["approved", "rejected"]),
		}),
	)
	.handler(async ({ data }) => {
		const u = await requireUser();
		const { circleMemberships } = await import(
			"@quran/db/tables/circle-membership.drizzle"
		);
		const { learningCircles } = await import(
			"@quran/db/tables/learning-circle.drizzle"
		);
		// Only the circle's owner may let someone in.
		const [req] = await db
			.select({
				userId: joinRequests.userId,
				circleId: joinRequests.circleId,
				requestedRole: joinRequests.requestedRole,
				status: joinRequests.status,
				ownerTeacherId: learningCircles.ownerTeacherId,
			})
			.from(joinRequests)
			.innerJoin(learningCircles, eq(joinRequests.circleId, learningCircles.id))
			.where(eq(joinRequests.id, data.id))
			.limit(1);
		if (!req || req.ownerTeacherId !== u.id) {
			return {
				ok: false as const,
				error: "forbidden" as const,
				userId: null,
				requestedRole: null,
			};
		}
		if (req.status !== "pending") {
			return {
				ok: false as const,
				error: "not_pending" as const,
				userId: null,
				requestedRole: null,
			};
		}
		await db
			.update(joinRequests)
			.set({ status: data.status })
			.where(eq(joinRequests.id, data.id));
		if (data.status === "approved") {
			await db
				.insert(circleMemberships)
				.values({
					circleId: req.circleId,
					userId: req.userId,
					role: req.requestedRole === "teacher" ? "teacher" : "student",
				})
				.onConflictDoNothing();
		}
		// Return the joiner so the teacher UI can send them straight to the
		// assign-plan screen after approving a student.
		return {
			ok: true as const,
			userId: req.userId,
			requestedRole: req.requestedRole,
		};
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
				rangeMode: sessionRecords.rangeMode,
				startPage: sessionRecords.startPage,
				endPage: sessionRecords.endPage,
				sessionDate: sessionRecords.sessionDate,
				evaluation: sessionRecords.evaluation,
			})
			.from(sessionRecords)
			.where(eq(sessionRecords.studentId, data.studentId))
			.orderBy(sessionRecords.sessionDate);
		// Self-serve plan resets need no teacher approval, so this log is how the
		// teacher finds out what the student changed and by how much.
		const { planResetEvents } = await import(
			"@quran/db/tables/plan-reset-event.drizzle"
		);
		const resetEvents = await db
			.select()
			.from(planResetEvents)
			.where(eq(planResetEvents.studentId, data.studentId))
			.orderBy(desc(planResetEvents.createdAt))
			.limit(10);
		const excuse = await excuseStateFor(data.studentId, today());
		return {
			student: student ?? null,
			plan: plan ?? null,
			reviews: reviewRows,
			sessions: sessionRows,
			resetEvents,
			excuse,
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
				rangeMode: sessionRecords.rangeMode,
				startPage: sessionRecords.startPage,
				endPage: sessionRecords.endPage,
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

const pageRangeFields = {
	startPage: z.number().int().min(1).max(MUSHAF_PAGES),
	endPage: z.number().int().min(1).max(MUSHAF_PAGES),
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

/** Teacher: create or update the student's active page-based review plan. */
export const assignReviewPlan = createServerFn({ method: "POST" })
	.validator(
		z
			.object({
				studentId: z.string(),
				dailyAmount: z.number().int().min(1),
				startPage: z.number().int().min(1).max(MUSHAF_PAGES),
				endPage: z.number().int().min(1).max(MUSHAF_PAGES),
			})
			.refine((d) => d.endPage >= d.startPage, {
				message: "endPage must be >= startPage",
				path: ["endPage"],
			}),
	)
	.handler(async ({ data }) => {
		const teacher = await requireUser();
		const { reviewPlans } = await import(
			"@quran/db/tables/review-plan.drizzle"
		);
		const existing = await db
			.select({ id: reviewPlans.id })
			.from(reviewPlans)
			.where(
				and(
					eq(reviewPlans.studentId, data.studentId),
					eq(reviewPlans.isActive, true),
				),
			)
			.limit(1);
		const values = {
			studentId: data.studentId,
			teacherId: teacher.id,
			// Verse columns are NOT NULL legacy fields; store placeholders. Plans are
			// entirely page-based — the scheduler uses startPage/endPage.
			startSurahNumber: 1,
			startVerse: 1,
			endSurahNumber: 1,
			endVerse: 1,
			rangeMode: "pages",
			startPage: data.startPage,
			endPage: data.endPage,
			dailyAmount: data.dailyAmount,
			dailyUnit: "pages",
			isActive: true,
			// The teacher's number wins: assigning a plan ends any catch-up window
			// the student had started, rather than stacking an extra on top of it.
			catchupExtraPages: null,
			catchupUntil: null,
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
				startPage: values.startPage,
				endPage: values.endPage,
				dailyAmount: values.dailyAmount,
				catchupExtraPages: values.catchupExtraPages,
				catchupUntil: values.catchupUntil,
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
	url = "/",
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
	await sendPush(userId, { title, body, data: { url } });
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
 * Student: request a change to their active plan. A change that *increases* the
 * workload applies immediately (the teacher is just notified): a lower start page
 * (widening the range backwards) or more pages/day. A change that *eases* the
 * workload — a later start page (skipping ahead) or fewer pages/day — is queued
 * for teacher approval. Returns `applied` to tell the UI which path happened.
 *
 * Either way the student keeps the page they are on: a new start page only moves
 * the plan's range, and a new daily amount first takes effect on the next review
 * the scheduler generates — today's assigned review is never rewritten.
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

		// Proposed value, the current value, and whether the change increases the
		// workload (→ apply immediately) or eases it (→ needs teacher approval).
		let proposed: number;
		let current: number;
		let increasesWorkload: boolean;
		if (data.field === "daily_amount") {
			if (data.dailyAmount == null)
				return { ok: false as const, error: "invalid" as const };
			proposed = data.dailyAmount;
			current = plan.dailyAmount;
			increasesWorkload = proposed > current; // more pages/day
		} else {
			if (data.startPage == null)
				return { ok: false as const, error: "invalid" as const };
			proposed = data.startPage;
			current = plan.startPage ?? 1;
			increasesWorkload = proposed < current; // earlier start page
		}

		// Unchanged → nothing to do.
		if (proposed === current)
			return { ok: true as const, applied: true as const };

		if (increasesWorkload) {
			if (data.field === "daily_amount")
				await db
					.update(reviewPlans)
					.set({ dailyAmount: proposed })
					.where(eq(reviewPlans.id, plan.id));
			// Only the plan's range moves — the student keeps the page they are on.
			else
				await db
					.update(reviewPlans)
					.set({ startPage: proposed })
					.where(eq(reviewPlans.id, plan.id));
			await notifyPlanChange(
				plan.teacherId,
				"plan_changed",
				"تعديل الخطة",
				`${u.name} عدّل خطته`,
				`plan_changed:${plan.id}:${data.field}:${proposed}`,
			);
			return { ok: true as const, applied: true as const };
		}

		// Eases the workload → queue for approval (one pending request at a time).
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

		await db.insert(planChangeRequests).values({
			reviewPlanId: plan.id,
			studentId: u.id,
			teacherId: plan.teacherId,
			field: data.field,
			proposedDailyAmount: data.field === "daily_amount" ? proposed : null,
			proposedStartPage: data.field === "start_page" ? proposed : null,
			status: "pending",
		});
		await notifyPlanChange(
			plan.teacherId,
			"plan_change_requested",
			"طلب تعديل الخطة",
			`${u.name} يطلب تعديل خطته`,
			`plan_change:${plan.id}:${data.field}:${proposed}`,
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
					.set({ startPage: req.proposedStartPage })
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

/** Teacher: log a page-based memorization session. */
export const createSession = createServerFn({ method: "POST" })
	.validator(
		z.object({
			studentId: z.string(),
			sessionDate: z.string(),
			sessionTime: z.string().optional(),
			notes: z.string().optional(),
			evaluation: z.string().optional(),
			...pageRangeFields,
		}),
	)
	.handler(async ({ data }) => {
		const teacher = await requireUser();
		const { getSurahNameForPage, getSurahNumberForPage } = await import(
			"@quran/db/domain/surahs"
		);
		const { sessionRecords } = await import(
			"@quran/db/tables/session-record.drizzle"
		);
		const startPage = Math.min(data.startPage, data.endPage);
		const endPage = Math.max(data.startPage, data.endPage);
		await db.insert(sessionRecords).values({
			studentId: data.studentId,
			teacherId: teacher.id,
			// memorized* / verse columns are NOT NULL legacy fields; the session is
			// page-based, so derive a surah label and store 0 for the verse columns.
			memorizedSurah: getSurahNameForPage(startPage, "ar"),
			memorizedVerseFrom: 0,
			memorizedVerseTo: 0,
			startSurahNumber: getSurahNumberForPage(startPage),
			endSurahNumber: getSurahNumberForPage(endPage),
			endSurahName: getSurahNameForPage(endPage, "ar"),
			rangeMode: "pages",
			startPage,
			endPage,
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

/**
 * Forgive overdue reviews. Used for backlog rows old enough that completing them
 * would *cost* points (`calculatePoints` goes negative past two days late) — the
 * student should be able to clear them without a penalty.
 *
 * Takes a list rather than a single id because a backlog is answered as a group:
 * every missed day re-issues the same page window, so "let it go" is one decision
 * about one range, not N decisions about N identical-looking rows.
 *
 * Deliberately leaves `pointsEarned` and the "completed" count untouched: this is
 * an amnesty, not an achievement. Only reviews assigned before today can be
 * waived, so a student can never waive away the work they owe today.
 */
export const waiveReview = createServerFn({ method: "POST" })
	.validator(
		z.object({ reviewIds: z.array(z.string().uuid()).min(1).max(200) }),
	)
	.handler(async ({ data }) => {
		const u = await requireUser();
		const todayStr = today();
		const rows = await db
			.select()
			.from(reviews)
			.where(
				and(
					inArray(reviews.id, data.reviewIds),
					eq(reviews.studentId, u.id),
					lt(reviews.assignedDate, todayStr),
				),
			);
		if (rows.length === 0)
			return { ok: false as const, error: "not_found" as const };

		const pending = rows.filter((r) => r.status !== "waived");
		if (pending.length > 0) {
			await db
				.update(reviews)
				.set({ status: "waived", waivedAt: new Date() })
				.where(
					inArray(
						reviews.id,
						pending.map((r) => r.id),
					),
				);
		}

		// Waiving forgives the calendar days, not the pages: the cursor still sits
		// where the student actually stopped, so later windows re-derive from the
		// progress that stands (a no-op when the days had no progress at all).
		// Re-anchor from the *oldest* row, since recalcFutureReviews only touches
		// what comes after the row it is given.
		const oldest = rows.reduce((a, b) =>
			a.assignedDate <= b.assignedDate ? a : b,
		);
		if (oldest.reviewPlanId) {
			const { recalcFutureReviews } = await import("./scheduler.ts");
			await recalcFutureReviews(oldest.reviewPlanId, {
				assignedDate: oldest.assignedDate,
				progressPage: oldest.progressPage,
				startPage: oldest.startPage,
				endPage: oldest.endPage,
			});
		}
		return { ok: true as const, waived: pending.length };
	});

/**
 * Load everything the plan-reset card needs, with all three strategies costed out
 * so the student sees the numeric consequence of each *before* confirming.
 *
 * `cursorPage` is where the student is actually stuck — the first page of today's
 * window. Because a missed day re-issues its window, that page has not moved for
 * the whole backlog, which is exactly what makes the debt `daily × overdueDays`.
 */
export const getPlanResetPreview = createServerFn({ method: "GET" }).handler(
	async () => {
		const u = await requireUser();
		const { reviewPlans } = await import(
			"@quran/db/tables/review-plan.drizzle"
		);
		const [plan] = await db
			.select()
			.from(reviewPlans)
			.where(
				and(eq(reviewPlans.studentId, u.id), eq(reviewPlans.isActive, true)),
			)
			.limit(1);
		if (!plan) return { ok: false as const, error: "no_plan" as const };

		const todayStr = today();
		const overdue = await db
			.select()
			.from(reviews)
			.where(
				and(
					eq(reviews.studentId, u.id),
					eq(reviews.reviewPlanId, plan.id),
					inArray(reviews.status, ["pending", "missed"]),
					lt(reviews.assignedDate, todayStr),
				),
			)
			.orderBy(asc(reviews.assignedDate));
		if (overdue.length === 0)
			return { ok: false as const, error: "no_backlog" as const };

		const [todayReview] = await db
			.select({ startPage: reviews.startPage })
			.from(reviews)
			.where(
				and(
					eq(reviews.reviewPlanId, plan.id),
					eq(reviews.assignedDate, todayStr),
				),
			)
			.orderBy(desc(reviews.createdAt))
			.limit(1);

		const input = {
			today: todayStr,
			dailyAmount: plan.dailyAmount,
			planStartPage: plan.startPage ?? 1,
			planEndPage: plan.endPage ?? MUSHAF_PAGES,
			cursorPage:
				todayReview?.startPage ?? overdue[0].startPage ?? plan.startPage ?? 1,
			overdueDays: overdue.length,
		};

		const { planChangeRequests } = await import(
			"@quran/db/tables/plan-change-request.drizzle"
		);
		const blocking = await db
			.select({ id: planChangeRequests.id })
			.from(planChangeRequests)
			.where(
				and(
					eq(planChangeRequests.reviewPlanId, plan.id),
					eq(planChangeRequests.status, "pending"),
				),
			)
			.limit(1);

		return {
			ok: true as const,
			backlog: {
				days: overdue.length,
				pages: outstandingPageUnion(overdue),
				debtPages: backlogDebtPages(overdue.length, plan.dailyAmount),
				oldestDate: overdue[0].assignedDate,
			},
			dailyAmount: plan.dailyAmount,
			cursorPage: input.cursorPage,
			planEndPage: input.planEndPage,
			catchupActive: plan.catchupUntil != null,
			pendingPlanChange: blocking.length > 0,
			distribute: CATCHUP_DAY_CHOICES.map((d) => distributePreview(input, d)),
			startToday: startTodayPreview(input),
		};
	},
);

/**
 * Apply one of the three exits. Every strategy waives the overdue rows; they
 * differ only in what happens to the plan going forward:
 *
 *   distribute → raise the daily amount for a fixed catch-up window
 *   extend     → nothing; forgiving the backlog is the whole effect
 *   skip       → jump today's window forward past the pages that were missed
 *
 * Never trusts the client's numbers: the preview is recomputed here from the
 * rows as they stand. Points and the "completed" count are never touched — a
 * reset is an amnesty, not a penalty.
 */
export const applyPlanReset = createServerFn({ method: "POST" })
	.validator(
		z.object({
			strategy: z.enum(["distribute", "skip"]),
			catchupDays: z.number().int().min(3).max(60).optional(),
		}),
	)
	.handler(async ({ data }) => {
		const u = await requireUser();
		const { reviewPlans } = await import(
			"@quran/db/tables/review-plan.drizzle"
		);
		const { planResetEvents } = await import(
			"@quran/db/tables/plan-reset-event.drizzle"
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

		// A queued plan-change request also mutates dailyAmount. Two writers racing
		// on the same number would leave the student with a plan neither of them
		// described, so the reset defers until the teacher has answered.
		const blocking = await db
			.select({ id: planChangeRequests.id })
			.from(planChangeRequests)
			.where(
				and(
					eq(planChangeRequests.reviewPlanId, plan.id),
					eq(planChangeRequests.status, "pending"),
				),
			)
			.limit(1);
		if (blocking.length > 0)
			return { ok: false as const, error: "pending_plan_change" as const };

		const todayStr = today();
		const overdue = await db
			.select()
			.from(reviews)
			.where(
				and(
					eq(reviews.studentId, u.id),
					eq(reviews.reviewPlanId, plan.id),
					inArray(reviews.status, ["pending", "missed"]),
					lt(reviews.assignedDate, todayStr),
				),
			)
			.orderBy(asc(reviews.assignedDate));
		if (overdue.length === 0)
			return { ok: false as const, error: "no_backlog" as const };

		// Today's row must exist before we can move it (the cron may not have run).
		const { ensureTodayReview } = await import("./scheduler.ts");
		await ensureTodayReview(plan, todayStr);
		const loadToday = async () =>
			(
				await db
					.select()
					.from(reviews)
					.where(
						and(
							eq(reviews.reviewPlanId, plan.id),
							eq(reviews.assignedDate, todayStr),
						),
					)
					.orderBy(desc(reviews.createdAt))
					.limit(1)
			)[0] ?? null;
		const todayReview = await loadToday();
		if (!todayReview) return { ok: false as const, error: "no_plan" as const };

		const input = {
			today: todayStr,
			dailyAmount: plan.dailyAmount,
			planStartPage: plan.startPage ?? 1,
			planEndPage: plan.endPage ?? MUSHAF_PAGES,
			cursorPage: todayReview.startPage ?? plan.startPage ?? 1,
			overdueDays: overdue.length,
		};

		const catchupDays = data.catchupDays ?? CATCHUP_DAY_CHOICES[1];
		if (
			data.strategy === "distribute" &&
			!CATCHUP_DAY_CHOICES.includes(
				catchupDays as (typeof CATCHUP_DAY_CHOICES)[number],
			)
		)
			return { ok: false as const, error: "invalid" as const };

		const dist =
			data.strategy === "distribute"
				? distributePreview(input, catchupDays)
				: null;
		const start = data.strategy === "skip" ? startTodayPreview(input) : null;

		const [event] = await db
			.insert(planResetEvents)
			.values({
				reviewPlanId: plan.id,
				studentId: u.id,
				teacherId: plan.teacherId,
				strategy: data.strategy,
				backlogDays: overdue.length,
				backlogPages: outstandingPageUnion(overdue),
				waivedCount: overdue.length,
				extraPagesPerDay: dist?.extraPerDay ?? null,
				catchupDays: dist?.catchupDays ?? null,
				catchupUntil: dist?.catchupUntil ?? null,
				// Nothing is written off any more: "start today" forgives the calendar
				// days, never the pages. The columns stay for events recorded before
				// that changed.
				skippedFromPage: null,
				skippedToPage: null,
				skippedPages: null,
				khatmahBefore: dist?.khatmahBefore ?? start?.khatmahBefore ?? null,
				khatmahAfter: dist?.khatmahAfter ?? start?.khatmahAfter ?? null,
			})
			.returning();

		// Waive the backlog. `lt(assignedDate, today)` keeps today's row live.
		await db
			.update(reviews)
			.set({ status: "waived", waivedAt: new Date(), resetEventId: event.id })
			.where(
				and(
					eq(reviews.studentId, u.id),
					eq(reviews.reviewPlanId, plan.id),
					inArray(reviews.status, ["pending", "missed"]),
					lt(reviews.assignedDate, todayStr),
				),
			);

		if (dist) {
			// Set, never increment: a student who distributes, lapses again and
			// distributes a second time gets one window sized for the new backlog —
			// two stacked catch-ups would be unpayable.
			await db
				.update(reviewPlans)
				.set({
					catchupExtraPages: dist.extraPerDay,
					catchupUntil: dist.catchupUntil,
				})
				.where(eq(reviewPlans.id, plan.id));
		}

		// Re-derive today's window in place. `ensureTodayReview` is idempotent, so it
		// will not touch a row that already exists — without this the reset would
		// only take effect tomorrow, and "today's goal" would contradict the
		// preview the student just confirmed.
		const todayDaily = effectiveDailyAmount(
			{
				dailyAmount: plan.dailyAmount,
				catchupExtraPages: dist?.extraPerDay ?? null,
				catchupUntil: dist?.catchupUntil ?? null,
			},
			todayStr,
		);
		// Neither strategy moves the cursor, so only the window's *width* can change
		// here — distribute widens it by the catch-up extra. Any progress already
		// recorded today stays valid because the window still starts where it did.
		const newStart = todayReview.startPage ?? input.cursorPage;
		const newEnd = Math.min(
			newStart + Math.max(1, todayDaily) - 1,
			input.planEndPage,
		);
		if (newEnd !== todayReview.endPage) {
			await db
				.update(reviews)
				.set({ startPage: newStart, endPage: newEnd })
				.where(eq(reviews.id, todayReview.id));
		}

		const refreshed = (await loadToday()) ?? todayReview;

		// Tell the teacher: the student resets on their own, but never silently.
		const { notificationDeliveries } = await import(
			"@quran/db/tables/notification-delivery.drizzle"
		);
		const label =
			data.strategy === "distribute"
				? `وزّع المتأخر على ${dist?.catchupDays} يومًا (+${dist?.extraPerDay} صفحة يوميًا)`
				: `بدأ من اليوم — يتأخر الختم ${start?.delayDays} يومًا`;
		const title = "إعادة ضبط الخطة";
		const body = `${u.name} ${label} بعد ${overdue.length} يومًا متأخرًا`;
		await db
			.insert(notificationDeliveries)
			.values({
				userId: plan.teacherId,
				eventType: "plan_reset",
				title,
				body,
				status: "sent",
				dedupeKey: `plan_reset:${event.id}`,
				sentAt: new Date(),
			})
			.onConflictDoNothing({ target: notificationDeliveries.dedupeKey });
		await sendPush(plan.teacherId, {
			title,
			body,
			data: { url: `/student-detail?studentId=${u.id}` },
		});

		return {
			ok: true as const,
			eventId: event.id,
			today: {
				startPage: refreshed.startPage,
				endPage: refreshed.endPage,
				dailyAmount: todayDaily,
			},
		};
	});

/**
 * A student's excuse-day standing for the current month. The allowance comes
 * from the circles they learn in (most generous wins, null inherits the global
 * default); usage is counted, never stored, so it resets on the 1st by itself.
 */
async function excuseStateFor(userId: string, todayStr: string) {
	const { circleMemberships } = await import(
		"@quran/db/tables/circle-membership.drizzle"
	);
	const { learningCircles } = await import(
		"@quran/db/tables/learning-circle.drizzle"
	);
	const circles = await db
		.select({ allowance: learningCircles.excuseDaysPerMonth })
		.from(circleMemberships)
		.innerJoin(
			learningCircles,
			eq(circleMemberships.circleId, learningCircles.id),
		)
		.where(
			and(
				eq(circleMemberships.userId, userId),
				eq(circleMemberships.role, "student"),
			),
		);
	const allowed = excuseAllowance(circles.map((c) => c.allowance));

	const month = monthKey(todayStr);
	const days = await db
		.select({ date: excuseDays.date, reason: excuseDays.reason })
		.from(excuseDays)
		.where(
			and(
				eq(excuseDays.userId, userId),
				sql`to_char(${excuseDays.date}, 'YYYY-MM') = ${month}`,
			),
		)
		.orderBy(desc(excuseDays.date));

	return { ...excuseBalance(allowed, days.length), month, days };
}

export const getExcuseStatus = createServerFn({ method: "GET" }).handler(
	async () => {
		const u = await requireUser();
		const todayStr = today();
		const state = await excuseStateFor(u.id, todayStr);
		return {
			...state,
			todayExcused: state.days.some((d) => d.date === todayStr),
		};
	},
);

/**
 * Mark a day as excused. The day's review becomes "excused": not an achievement
 * and not a miss — it leaves the backlog, the on-time rate and the streak alone,
 * while the pages stay owed (the window is simply re-issued).
 */
export const excuseDayFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
			reason: z.string().trim().max(200).optional(),
		}),
	)
	.handler(async ({ data }) => {
		const u = await requireUser();
		const todayStr = today();
		const state = await excuseStateFor(u.id, todayStr);
		if (state.days.some((d) => d.date === data.date))
			return { ok: false as const, error: "already_excused" as const };

		const verdict = canExcuse(data.date, todayStr, state.remaining);
		if (!verdict.ok) return { ok: false as const, error: verdict.reason };

		await db
			.insert(excuseDays)
			.values({ userId: u.id, date: data.date, reason: data.reason ?? null })
			.onConflictDoNothing();

		// Take that day's review out of the backlog. Only an unfinished day can be
		// excused away — a completed review keeps its points and its status.
		await db
			.update(reviews)
			.set({ status: "excused" })
			.where(
				and(
					eq(reviews.studentId, u.id),
					eq(reviews.assignedDate, data.date),
					inArray(reviews.status, ["pending", "missed"]),
					sql`${reviews.completedAt} is null`,
				),
			);

		return { ok: true as const, remaining: Math.max(0, state.remaining - 1) };
	});

/** Undo an excuse, returning the day to the backlog. Same 24-hour window. */
export const removeExcuseDay = createServerFn({ method: "POST" })
	.validator(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
	.handler(async ({ data }) => {
		const u = await requireUser();
		const todayStr = today();
		const verdict = canExcuse(data.date, todayStr, 1);
		if (!verdict.ok && verdict.reason === "too_old")
			return { ok: false as const, error: "too_old" as const };

		const removed = await db
			.delete(excuseDays)
			.where(and(eq(excuseDays.userId, u.id), eq(excuseDays.date, data.date)))
			.returning({ id: excuseDays.id });
		if (removed.length === 0)
			return { ok: false as const, error: "not_found" as const };

		await db
			.update(reviews)
			.set({ status: data.date >= todayStr ? "pending" : "missed" })
			.where(
				and(
					eq(reviews.studentId, u.id),
					eq(reviews.assignedDate, data.date),
					eq(reviews.status, "excused"),
				),
			);
		return { ok: true as const };
	});

/**
 * Teacher: set the circle's monthly allowance (null = inherit the default).
 * Unlike most mutations here, requireUser() alone is not enough — this changes a
 * rule for every student in the circle, so the caller must own it.
 */
export const setCircleExcuseDays = createServerFn({ method: "POST" })
	.validator(
		z.object({
			circleId: z.string().uuid(),
			excuseDaysPerMonth: z.number().int().min(0).max(10).nullable(),
		}),
	)
	.handler(async ({ data }) => {
		const u = await requireUser();
		const { learningCircles } = await import(
			"@quran/db/tables/learning-circle.drizzle"
		);
		const updated = await db
			.update(learningCircles)
			.set({ excuseDaysPerMonth: data.excuseDaysPerMonth })
			.where(
				and(
					eq(learningCircles.id, data.circleId),
					eq(learningCircles.ownerTeacherId, u.id),
				),
			)
			.returning({ id: learningCircles.id });
		if (updated.length === 0)
			return { ok: false as const, error: "forbidden" as const };
		return { ok: true as const };
	});

/** Teacher: this month's excuse usage for every student in one circle. */
export const getCircleExcuseUsage = createServerFn({ method: "GET" })
	.validator(z.object({ circleId: z.string().uuid() }))
	.handler(async ({ data }) => {
		const u = await requireUser();
		const { learningCircles } = await import(
			"@quran/db/tables/learning-circle.drizzle"
		);
		const { circleMemberships } = await import(
			"@quran/db/tables/circle-membership.drizzle"
		);
		const [circle] = await db
			.select()
			.from(learningCircles)
			.where(
				and(
					eq(learningCircles.id, data.circleId),
					eq(learningCircles.ownerTeacherId, u.id),
				),
			)
			.limit(1);
		if (!circle) return { ok: false as const, error: "forbidden" as const };

		const { user: userTable } = await import("@quran/db/tables/auth.drizzle");
		const students = await db
			.select({ id: userTable.id, name: userTable.name })
			.from(circleMemberships)
			.innerJoin(userTable, eq(circleMemberships.userId, userTable.id))
			.where(
				and(
					eq(circleMemberships.circleId, data.circleId),
					eq(circleMemberships.role, "student"),
				),
			);

		const month = monthKey(today());
		const rows = await db
			.select({ userId: excuseDays.userId, date: excuseDays.date })
			.from(excuseDays)
			.where(
				and(
					inArray(
						excuseDays.userId,
						students.map((s) => s.id),
					),
					sql`to_char(${excuseDays.date}, 'YYYY-MM') = ${month}`,
				),
			);

		return {
			ok: true as const,
			excuseDaysPerMonth: circle.excuseDaysPerMonth,
			allowed: excuseAllowance([circle.excuseDaysPerMonth]),
			month,
			students: students.map((s) => {
				const dates = rows
					.filter((r) => r.userId === s.id)
					.map((r) => r.date)
					.sort();
				return { id: s.id, name: s.name, used: dates.length, dates };
			}),
		};
	});

/** Student: report page progress → completes + scores the review once the target is met. */
export const submitReview = createServerFn({ method: "POST" })
	.validator(
		z.object({
			reviewId: z.string(),
			// the absolute page the student has reached now
			currentPage: z.number().int().min(1).max(MUSHAF_PAGES).optional(),
		}),
	)
	.handler(async ({ data }) => {
		const u = await requireUser();
		const { calculatePoints, nextStreak, applyPoints, diffDays } = await import(
			"@quran/db/domain/scoring"
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

		// The student reports the page reached now — editable up or down so a
		// mistaken entry can be corrected, but never below the day's start page.
		// Points are awarded once, the moment the day's target is first met; status
		// stays pending until the cron finalizes at day-end so the review remains
		// submittable for overachieving.
		const dayStart = review.startPage ?? 1;
		const dayEnd = review.endPage ?? dayStart;
		const progressPage = Math.min(
			Math.max(data.currentPage ?? dayEnd, dayStart),
			MUSHAF_PAGES,
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
			// Days the student excused since their last completion don't break the
			// chain. Only the gap matters, so nothing is loaded when there isn't one.
			const excusedDates =
				streakLastDate && diffDays(todayStr, streakLastDate) > 1
					? (
							await db
								.select({ date: excuseDays.date })
								.from(excuseDays)
								.where(
									and(
										eq(excuseDays.userId, u.id),
										gt(excuseDays.date, streakLastDate),
										lt(excuseDays.date, todayStr),
									),
								)
						).map((r) => r.date)
					: [];
			const newStreak = nextStreak(
				u.streak,
				streakLastDate,
				todayStr,
				excusedDates,
			);
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

		// Doing/editing an older review changes the "last page read", so re-derive
		// the page windows of any later reviews on this plan from the new progress.
		if (review.reviewPlanId) {
			const { recalcFutureReviews } = await import("./scheduler.ts");
			await recalcFutureReviews(review.reviewPlanId, {
				assignedDate: review.assignedDate,
				progressPage,
				startPage: review.startPage,
				endPage: review.endPage,
			});
		}

		// Notify the teacher that the student recorded new progress. Only when the
		// page actually moved (skip no-op resubmits), and deduped per page so the
		// same page is never announced twice while a new page always is.
		if (progressPage !== review.progressPage) {
			const { notificationDeliveries } = await import(
				"@quran/db/tables/notification-delivery.drizzle"
			);
			const targetPages = Math.max(dayEnd - dayStart + 1, 1);
			const donePages = Math.min(
				Math.max(progressPage - dayStart + 1, 0),
				targetPages,
			);
			// The review's own day — not necessarily today, since a back-dated review
			// can be reported later — plus the wall-clock time of this report, read
			// in the teacher's zone because the teacher is who reads the message.
			const [teacher] = await db
				.select({ timezone: userTable.timezone })
				.from(userTable)
				.where(eq(userTable.id, review.teacherId))
				.limit(1);
			const dayLabel = formatDayAr(review.assignedDate);
			const timeLabel = formatTimeAr(
				new Date(),
				teacher?.timezone ?? u.timezone ?? null,
			);
			const title = "تحديث تقدم الطالب";
			const body = targetMet
				? `${u.name} أتمّ مراجعة يوم ${dayLabel} (ص ${progressPage}) — الساعة ${timeLabel}`
				: `${u.name} وصل إلى ص ${progressPage} (${donePages}/${targetPages}) في مراجعة يوم ${dayLabel} — الساعة ${timeLabel}`;
			const inserted = await db
				.insert(notificationDeliveries)
				.values({
					userId: review.teacherId,
					eventType: "progress_update",
					title,
					body,
					status: "sent",
					dedupeKey: `progress_update:${review.id}:${progressPage}`,
					sentAt: new Date(),
				})
				.onConflictDoNothing({ target: notificationDeliveries.dedupeKey })
				.returning({ id: notificationDeliveries.id });
			if (inserted.length > 0) {
				await sendPush(review.teacherId, {
					title,
					body,
					data: { url: `/student-detail?studentId=${review.studentId}` },
				});
			}
		}

		// Motivate circle mates who are behind: the first time today's target is
		// met, count how many circle students already finished today's review and
		// nudge the student mates whose review is still open — anonymously (no
		// names), each in their own language, only after 14:00 in the recipient's
		// timezone, and at most once per student per day (deduped on date +
		// recipient). Back-dated completions don't announce.
		if (targetMet && !alreadyScored && review.assignedDate === todayStr) {
			const mates = await listCircleMates(u.id);
			if (mates.length > 0) {
				const todayRows = await db
					.select({
						studentId: reviews.studentId,
						completedAt: reviews.completedAt,
					})
					.from(reviews)
					.where(
						and(
							inArray(
								reviews.studentId,
								mates.map((m) => m.id),
							),
							eq(reviews.assignedDate, todayStr),
						),
					);
				const finished = new Set<string>();
				const pending = new Set<string>();
				for (const r of todayRows) {
					if (r.completedAt) finished.add(r.studentId);
					else pending.add(r.studentId);
				}
				// A mate with several reviews today is behind while any is open.
				for (const id of pending) finished.delete(id);
				const finishedCount = finished.size + 1; // + the student who just did
				const recipients = mates.filter(
					(m) => pending.has(m.id) && hourIn(m.timezone) >= CIRCLE_NUDGE_HOUR,
				);
				if (recipients.length > 0) {
					const { notificationDeliveries } = await import(
						"@quran/db/tables/notification-delivery.drizzle"
					);
					for (const mate of recipients) {
						const msg = circleMateDoneMessage(mate.language, finishedCount);
						const inserted = await db
							.insert(notificationDeliveries)
							.values({
								userId: mate.id,
								eventType: "circle_mate_done",
								title: msg.title,
								body: msg.body,
								status: "sent",
								dedupeKey: `circle_mate_done:${todayStr}:${mate.id}`,
								sentAt: new Date(),
							})
							.onConflictDoNothing({
								target: notificationDeliveries.dedupeKey,
							})
							.returning({ id: notificationDeliveries.id });
						if (inserted.length > 0) {
							await sendPush(mate.id, {
								title: msg.title,
								body: msg.body,
								data: { url: "/", lang: msg.locale, dir: msg.dir },
							});
						}
					}
				}
			}
		}
		return { ok: true as const, earned, progressPage, targetMet };
	});

/**
 * Persist the caller's UI language (+ device timezone) so server-composed
 * pushes are translated and time-gated correctly per recipient.
 */
export const setLanguage = createServerFn({ method: "POST" })
	.validator(
		z.object({
			language: z.enum(["ar", "en", "de"]),
			timezone: z.string().min(1).max(64).optional(),
		}),
	)
	.handler(async ({ data }) => {
		const session = await auth.api.getSession({ headers: getRequestHeaders() });
		// Best-effort call from the client — anonymous visitors no-op.
		if (!session) return { ok: false as const };
		const { user: userTable } = await import("@quran/db/tables/auth.drizzle");
		await db
			.update(userTable)
			.set({
				language: data.language,
				...(data.timezone ? { timezone: data.timezone } : {}),
			})
			.where(eq(userTable.id, session.user.id));
		return { ok: true as const };
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

		// Everyone joins as a student — including teachers, who can follow their
		// own memorisation in another teacher's circle from the student view.
		const [request] = await db
			.insert(joinRequests)
			.values({
				userId: u.id,
				circleId: circle.id,
				requestedRole: "student",
				status: "pending",
			})
			.returning({ id: joinRequests.id });

		// Notify the circle owner so they can approve/reject from the requests
		// screen (and straight from the push notification).
		await notifyPlanChange(
			circle.ownerTeacherId,
			"join_requested",
			"طلب انضمام جديد",
			`${u.name} يطلب الانضمام إلى ${circle.title}`,
			`join_requested:${request.id}`,
			"/teacher",
		);

		return { ok: true as const, circleTitle: circle.title };
	});

export const leaveCircleFn = createServerFn({ method: "POST" })
	.validator(z.object({ circleId: z.string().uuid() }))
	.handler(async ({ data }) => {
		const u = await requireUser();
		const left = await leaveCircle(u.id, data.circleId);
		return left
			? { ok: true as const }
			: { ok: false as const, error: "not_member" };
	});
