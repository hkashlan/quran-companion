/**
 * Dev/admin helper: permanently delete one or more users by email.
 *
 *   pnpm delete:user a@x.com b@x.com
 *
 * Removes the user row and every row that references it. Tables whose FK to
 * `user` is `onDelete: cascade` (auth sessions/accounts, notification deliveries,
 * push tokens, circle memberships, join requests, plan-change requests-by-student)
 * are cleaned up automatically when the user row is deleted. The remaining tables
 * have no cascade, so we delete them explicitly first, in FK-dependency order,
 * inside a single transaction per user (all-or-nothing).
 *
 * DESTRUCTIVE and irreversible. Intended for clearing out test accounts.
 */
import { db } from "@quran/db/db";
import { auditLogs } from "@quran/db/tables/audit-log.drizzle";
import { user } from "@quran/db/tables/auth.drizzle";
import { learningCircles } from "@quran/db/tables/learning-circle.drizzle";
import { planChangeRequests } from "@quran/db/tables/plan-change-request.drizzle";
import { reviewPlans } from "@quran/db/tables/review-plan.drizzle";
import { reviewSubmissions } from "@quran/db/tables/review-submission.drizzle";
import { reviews } from "@quran/db/tables/review.drizzle";
import { sessionRecords } from "@quran/db/tables/session-record.drizzle";
import { teacherInvitations } from "@quran/db/tables/teacher-invitation.drizzle";
import { eq, inArray, or, sql } from "drizzle-orm";

async function deleteUser(email: string): Promise<boolean> {
	const [u] = await db
		.select({ id: user.id, name: user.name })
		.from(user)
		.where(eq(user.email, email));

	if (!u) {
		console.warn(`⚠️  no user found for ${email} — skipping`);
		return false;
	}
	const uid = u.id;

	await db.transaction(async (tx) => {
		// 1. Circles owned by this user. Cascades their slots, memberships,
		//    join-requests, teacher-invitations, and audit-logs (all FK'd to the
		//    circle with onDelete: cascade).
		await tx
			.delete(learningCircles)
			.where(eq(learningCircles.ownerTeacherId, uid));

		// 2. Reviews reference review_plans (no cascade), so reviews must go first.
		//    Delete reviews where the user is student/teacher, plus any review that
		//    points at one of the user's plans. Cascades review_submissions.
		const planRows = await tx
			.select({ id: reviewPlans.id })
			.from(reviewPlans)
			.where(or(eq(reviewPlans.studentId, uid), eq(reviewPlans.teacherId, uid)));
		const planIds = planRows.map((r) => r.id);

		await tx
			.delete(reviews)
			.where(
				or(
					eq(reviews.studentId, uid),
					eq(reviews.teacherId, uid),
					planIds.length
						? inArray(reviews.reviewPlanId, planIds)
						: sql`false`,
				),
			);

		// 3. Submissions not already removed via their review's cascade.
		await tx
			.delete(reviewSubmissions)
			.where(eq(reviewSubmissions.studentId, uid));

		// 4. Review plans (cascades plan_change_requests that reference them).
		await tx
			.delete(reviewPlans)
			.where(or(eq(reviewPlans.studentId, uid), eq(reviewPlans.teacherId, uid)));

		// 5. Plan-change requests left over (teacherId has no cascade to user).
		await tx
			.delete(planChangeRequests)
			.where(
				or(
					eq(planChangeRequests.studentId, uid),
					eq(planChangeRequests.teacherId, uid),
				),
			);

		// 6. Session records (no cascade on either party).
		await tx
			.delete(sessionRecords)
			.where(
				or(eq(sessionRecords.studentId, uid), eq(sessionRecords.teacherId, uid)),
			);

		// 7. Teacher invitations the user sent or received.
		await tx
			.delete(teacherInvitations)
			.where(
				or(
					eq(teacherInvitations.inviterId, uid),
					eq(teacherInvitations.inviteeId, uid),
				),
			);

		// 8. Audit logs referencing the user (teacher or student).
		await tx
			.delete(auditLogs)
			.where(or(eq(auditLogs.teacherId, uid), eq(auditLogs.studentId, uid)));

		// 9. The user. Cascades auth sessions/accounts, notification deliveries,
		//    push tokens, circle memberships (as member), and join requests.
		await tx.delete(user).where(eq(user.id, uid));
	});

	console.log(`✅ deleted ${email} (${u.name ?? "no name"}, id=${uid})`);
	return true;
}

async function main() {
	const emails = process.argv.slice(2).filter((a) => a.includes("@"));
	if (emails.length === 0) {
		console.error("usage: pnpm delete:user <email> [<email> ...]");
		process.exit(1);
	}

	let deleted = 0;
	for (const email of emails) {
		if (await deleteUser(email)) deleted++;
	}
	console.log(`\nDone. Deleted ${deleted}/${emails.length} user(s).`);
	process.exit(0);
}

main().catch((err) => {
	console.error("❌ delete-user failed:", err);
	process.exit(1);
});
