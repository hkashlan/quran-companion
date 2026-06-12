/**
 * Dev seed. Creates users through better-auth (so credentials hash into the
 * `account` table), then inserts domain data (circle, memberships, review plans,
 * reviews, submissions, sessions, notifications) directly via Drizzle.
 *
 * Run:  pnpm --filter @quran/web seed
 * (wraps it with `node --env-file=../../.env --import tsx/esm scripts/seed.ts`)
 *
 * Idempotent: wipes all app tables first, so re-running gives a clean dataset.
 */
import { db } from "@quran/db/db";
import { auditLogs } from "@quran/db/tables/audit-log.drizzle";
import { user as userTable } from "@quran/db/tables/auth.drizzle";
import { circleMemberships } from "@quran/db/tables/circle-membership.drizzle";
import { joinRequests } from "@quran/db/tables/join-request.drizzle";
import {
	learningCircleSlots,
	learningCircles,
} from "@quran/db/tables/learning-circle.drizzle";
import { notificationDeliveries } from "@quran/db/tables/notification-delivery.drizzle";
import { pushTokens } from "@quran/db/tables/push-token.drizzle";
import { reviewPlans } from "@quran/db/tables/review-plan.drizzle";
import { reviewSubmissions } from "@quran/db/tables/review-submission.drizzle";
import { reviews } from "@quran/db/tables/review.drizzle";
import { sessionRecords } from "@quran/db/tables/session-record.drizzle";
import { teacherInvitations } from "@quran/db/tables/teacher-invitation.drizzle";
import { account, session } from "@quran/db/tables/auth.drizzle";
import { eq, sql } from "drizzle-orm";

import { auth } from "../src/lib/auth.ts";

const PASSWORD = "Password123!";

// A few surahs (number → Arabic name) used by the seeded reviews/sessions.
const SURAH = {
	1: "الفاتحة",
	2: "البقرة",
	3: "آل عمران",
	36: "يس",
	67: "الملك",
	112: "الإخلاص",
} as const;

/** YYYY-MM-DD for `today - daysAgo` (UTC). */
function dateStr(daysAgo: number): string {
	const ms = Date.parse("2026-06-12T00:00:00Z") - daysAgo * 86_400_000;
	return new Date(ms).toISOString().slice(0, 10);
}

async function wipe() {
	// Order respects FKs (children first).
	for (const t of [
		auditLogs,
		notificationDeliveries,
		pushTokens,
		reviewSubmissions,
		reviews,
		reviewPlans,
		sessionRecords,
		teacherInvitations,
		joinRequests,
		circleMemberships,
		learningCircleSlots,
		learningCircles,
		session,
		account,
		userTable,
	]) {
		await db.delete(t);
	}
}

async function createUser(
	email: string,
	name: string,
	role: "teacher" | "student",
): Promise<string> {
	const res = await auth.api.signUpEmail({
		body: { email, password: PASSWORD, name, role },
	});
	return res.user.id;
}

async function main() {
	console.log("seed: wiping…");
	await wipe();

	console.log("seed: creating users…");
	const teacherId = await createUser("teacher@test.com", "الأستاذ أحمد", "teacher");
	const aliId = await createUser("ali@test.com", "علي حسن", "student");
	const saraId = await createUser("sara@test.com", "سارة محمد", "student");
	const omarId = await createUser("omar@test.com", "عمر خالد", "student");
	// Pre-confirm the demo accounts so they log in without the OTP step.
	await db.update(userTable).set({ emailVerified: true });
	const students = [
		{ id: aliId, name: "علي حسن" },
		{ id: saraId, name: "سارة محمد" },
		{ id: omarId, name: "عمر خالد" },
	];

	console.log("seed: circle + memberships…");
	const [circle] = await db
		.insert(learningCircles)
		.values({
			ownerTeacherId: teacherId,
			title: "حلقة تحفيظ الفجر",
			description: "حلقة لحفظ ومراجعة القرآن الكريم",
			location: "مسجد النور",
			reminderHoursBeforeStart: 2,
			code: "QURAN1",
		})
		.returning();

	await db.insert(learningCircleSlots).values([
		{ circleId: circle.id, dayOfWeek: 0, startTime: "17:00", endTime: "18:30" },
		{ circleId: circle.id, dayOfWeek: 2, startTime: "17:00", endTime: "18:30" },
	]);

	await db.insert(circleMemberships).values([
		{ circleId: circle.id, userId: teacherId, role: "owner" },
		...students.map((s) => ({
			circleId: circle.id,
			userId: s.id,
			role: "student" as const,
		})),
	]);

	console.log("seed: review plans + reviews + submissions…");
	let topPoints: Record<string, number> = {};
	for (const [idx, s] of students.entries()) {
		const [plan] = await db
			.insert(reviewPlans)
			.values({
				studentId: s.id,
				teacherId,
				startSurahNumber: 1,
				startVerse: 1,
				endSurahNumber: 2,
				endVerse: 50,
				rangeMode: "verses",
				dailyAmount: 10,
				dailyUnit: "verses",
				isActive: true,
			})
			.returning();

		// Mix of completed / pending / missed across the last few days.
		const plans: {
			daysAgo: number;
			status: "completed" | "pending" | "missed";
			surah: keyof typeof SURAH;
			from: number;
			to: number;
		}[] = [
			{ daysAgo: 3, status: "completed", surah: 1, from: 1, to: 7 },
			{ daysAgo: 2, status: "completed", surah: 2, from: 1, to: 20 },
			{ daysAgo: 1, status: idx === 2 ? "missed" : "completed", surah: 2, from: 21, to: 40 },
			{ daysAgo: 0, status: "pending", surah: 2, from: 41, to: 60 },
		];

		let points = 0;
		for (const p of plans) {
			const earned = p.status === "completed" ? 10 : 0;
			points += earned;
			const [rev] = await db
				.insert(reviews)
				.values({
					studentId: s.id,
					teacherId,
					reviewPlanId: plan.id,
					surahNumber: p.surah,
					surahName: SURAH[p.surah],
					verseFrom: p.from,
					verseTo: p.to,
					rangeMode: "verses",
					assignedDate: dateStr(p.daysAgo),
					status: p.status,
					pointsEarned: earned,
					completedAt: p.status === "completed" ? new Date() : null,
				})
				.returning();

			if (p.status === "completed") {
				await db.insert(reviewSubmissions).values({
					reviewId: rev.id,
					studentId: s.id,
					startSurahNumber: p.surah,
					startSurahName: SURAH[p.surah],
					startVerse: p.from,
					endSurahNumber: p.surah,
					endSurahName: SURAH[p.surah],
					endVerse: p.to,
				});
			}
		}
		topPoints[s.id] = points;

		await db.insert(sessionRecords).values({
			studentId: s.id,
			teacherId,
			memorizedSurah: SURAH[36],
			memorizedVerseFrom: 1,
			memorizedVerseTo: 12,
			rangeMode: "verses",
			sessionDate: dateStr(2),
			sessionTime: "17:30",
			notes: "أداء جيد",
			evaluation: "ممتاز",
		});
	}

	console.log("seed: points/streaks + notifications…");
	for (const s of students) {
		await db
			.update(userTable)
			.set({ points: topPoints[s.id], streak: 3, streakLastDate: dateStr(1) })
			.where(eq(userTable.id, s.id));
	}

	await db.insert(notificationDeliveries).values([
		{
			userId: aliId,
			eventType: "review_reminder",
			title: "تذكير بالمراجعة",
			body: "لديك مراجعة مستحقة اليوم: سورة البقرة 41-60",
			status: "sent",
			isRead: false,
			dedupeKey: "seed-ali-1",
			sentAt: new Date(),
		},
		{
			userId: aliId,
			eventType: "session_reminder",
			title: "تذكير بالحلقة",
			body: "حلقة تحفيظ الفجر تبدأ بعد ساعتين",
			status: "sent",
			isRead: true,
			readAt: new Date(),
			dedupeKey: "seed-ali-2",
			sentAt: new Date(),
		},
	]);

	// A pending join request to populate the teacher "requests" screen later.
	await db.insert(joinRequests).values({
		userId: omarId,
		circleId: circle.id,
		requestedRole: "student",
		status: "pending",
	});

	const counts = await db.execute(sql`
		select
			(select count(*) from "user") as users,
			(select count(*) from learning_circles) as circles,
			(select count(*) from reviews) as reviews,
			(select count(*) from review_submissions) as submissions,
			(select count(*) from session_records) as sessions,
			(select count(*) from notification_deliveries) as notifications
	`);
	console.log("seed: done", counts.rows[0]);
	console.log(`seed: login with teacher@test.com / ali@test.com … password: ${PASSWORD}`);
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error("seed failed:", err);
		process.exit(1);
	});
