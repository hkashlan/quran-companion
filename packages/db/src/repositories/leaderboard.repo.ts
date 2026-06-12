import { and, desc, eq, gte, sql } from "drizzle-orm";

import { db } from "../db.ts";
import { user } from "../tables/auth.drizzle.ts";
import { reviews } from "../tables/review.drizzle.ts";

export type LeaderboardPeriod = "overall" | "weekly" | "monthly";
export type LeaderboardEntry = {
	rank: number;
	id: string;
	name: string;
	points: number;
	streak: number;
};

/** YYYY-MM-DD `daysAgo` days before `today`. */
function windowStart(today: string, days: number): string {
	const ms = Date.parse(`${today}T00:00:00Z`) - days * 86_400_000;
	return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Leaderboard ranking (port of services/leaderboard.py):
 *  - overall: students by total user.points
 *  - weekly/monthly: students by points_earned on reviews completed in the
 *    last 7 / 30 days. Streak is always the user's current streak.
 */
export async function getLeaderboard(
	period: LeaderboardPeriod,
	today: string,
): Promise<LeaderboardEntry[]> {
	if (period === "overall") {
		const rows = await db
			.select({ id: user.id, name: user.name, points: user.points, streak: user.streak })
			.from(user)
			.where(eq(user.role, "student"))
			.orderBy(desc(user.points), user.name);
		return rows.map((r, i) => ({ ...r, rank: i + 1 }));
	}

	const from = windowStart(today, period === "weekly" ? 7 : 30);
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
				eq(reviews.status, "completed"),
				gte(reviews.assignedDate, from),
			),
		)
		.where(eq(user.role, "student"))
		.groupBy(user.id, user.name, user.streak)
		.orderBy(desc(periodPoints), user.name);

	return rows.map((r, i) => ({
		rank: i + 1,
		id: r.id,
		name: r.name,
		points: Number(r.points),
		streak: r.streak,
	}));
}
