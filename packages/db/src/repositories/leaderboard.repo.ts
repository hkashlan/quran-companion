import { and, desc, eq, gte, inArray, isNotNull, or, sql } from "drizzle-orm";

import { db } from "../db.ts";
import { withSharedRanks } from "../domain/scoring.ts";
import { user } from "../tables/auth.drizzle.ts";
import { circleMemberships } from "../tables/circle-membership.drizzle.ts";
import { reviews } from "../tables/review.drizzle.ts";

export type LeaderboardPeriod = "overall" | "weekly" | "monthly";
export type LeaderboardEntry = {
	rank: number;
	id: string;
	name: string;
	points: number;
	streak: number;
};

export type LeaderboardRange = { from: string; to: string };

/** YYYY-MM-DD `days` days after `date` (negative goes back). */
function addDays(date: string, days: number): string {
	const ms = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
	return new Date(ms).toISOString().slice(0, 10);
}

/**
 * The calendar window a period ranks over, both ends inclusive: the Monday–
 * Sunday week, or the month, that contains `today`. Null for overall.
 */
export function leaderboardRange(
	period: LeaderboardPeriod,
	today: string,
): LeaderboardRange | null {
	if (period === "overall") return null;
	if (period === "weekly") {
		// getUTCDay: Sunday = 0, so Monday-based offset is (day + 6) % 7.
		const offset = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
		const from = addDays(today, -offset);
		return { from, to: addDays(from, 6) };
	}
	const from = `${today.slice(0, 7)}-01`;
	const [y, m] = today.split("-").map(Number);
	// Day 0 of the next month is the last day of this one.
	const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
	return { from, to: `${today.slice(0, 7)}-${String(last).padStart(2, "0")}` };
}

/**
 * Who gets ranked: every student account, plus any teacher who joined a circle
 * as a student — they follow a plan and earn points like everyone else.
 */
function isLearner() {
	return or(
		eq(user.role, "student"),
		inArray(
			user.id,
			db
				.select({ id: circleMemberships.userId })
				.from(circleMemberships)
				.where(eq(circleMemberships.role, "student")),
		),
	);
}

/**
 * Leaderboard ranking (port of services/leaderboard.py):
 *  - overall: learners by total user.points
 *  - weekly/monthly: learners by points_earned on reviews assigned in the
 *    current calendar week (Mon–Sun) / month. A review counts from the moment
 *    it's scored (completedAt), not when the midnight cron flips its status,
 *    so today's points show here as soon as they show in overall.
 * Streak is always the user's current streak.
 */
export async function getLeaderboard(
	period: LeaderboardPeriod,
	today: string,
): Promise<LeaderboardEntry[]> {
	const range = leaderboardRange(period, today);
	if (!range) {
		const rows = await db
			.select({
				id: user.id,
				name: user.name,
				points: user.points,
				streak: user.streak,
			})
			.from(user)
			.where(isLearner())
			.orderBy(desc(user.points), user.name);
		return withSharedRanks(rows);
	}

	const periodPoints = sql<number>`coalesce(sum(${reviews.pointsEarned}), 0)`;
	const rows = await db
		.select({
			id: user.id,
			name: user.name,
			streak: user.streak,
			points: periodPoints,
		})
		.from(user)
		.leftJoin(
			reviews,
			and(
				eq(reviews.studentId, user.id),
				isNotNull(reviews.completedAt),
				gte(reviews.assignedDate, range.from),
			),
		)
		.where(isLearner())
		.groupBy(user.id, user.name, user.streak)
		.orderBy(desc(periodPoints), user.name);

	return withSharedRanks(
		rows.map((r) => ({
			id: r.id,
			name: r.name,
			points: Number(r.points),
			streak: r.streak,
		})),
	);
}
