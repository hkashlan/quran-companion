import { and, eq, sql } from "drizzle-orm";

import { db } from "../db.ts";
import { circleMemberships } from "../tables/circle-membership.drizzle.ts";
import {
	learningCircleSlots,
	learningCircles,
} from "../tables/learning-circle.drizzle.ts";

export type CircleSummary = {
	id: string;
	title: string;
	description: string | null;
	location: string | null;
	code: string;
	memberRole: string;
	studentsCount: number;
};

/** Circles the user belongs to, with their role and a student count. */
export async function listCirclesForUser(
	userId: string,
): Promise<CircleSummary[]> {
	const memberships = await db
		.select({
			id: learningCircles.id,
			title: learningCircles.title,
			description: learningCircles.description,
			location: learningCircles.location,
			code: learningCircles.code,
			memberRole: circleMemberships.role,
		})
		.from(circleMemberships)
		.innerJoin(
			learningCircles,
			eq(circleMemberships.circleId, learningCircles.id),
		)
		.where(eq(circleMemberships.userId, userId))
		.orderBy(learningCircles.createdAt);

	const result: CircleSummary[] = [];
	for (const m of memberships) {
		const [{ count }] = await db
			.select({ count: sql<number>`count(*)` })
			.from(circleMemberships)
			.where(
				and(
					eq(circleMemberships.circleId, m.id),
					eq(circleMemberships.role, "student"),
				),
			);
		result.push({ ...m, studentsCount: Number(count) });
	}
	return result;
}

/** Look up a circle by its public join code. */
export async function findCircleByCode(code: string) {
	const rows = await db
		.select()
		.from(learningCircles)
		.where(eq(learningCircles.code, code.toUpperCase()))
		.limit(1);
	return rows[0] ?? null;
}

export async function getCircleSlots(circleId: string) {
	return db
		.select()
		.from(learningCircleSlots)
		.where(eq(learningCircleSlots.circleId, circleId))
		.orderBy(learningCircleSlots.dayOfWeek, learningCircleSlots.startTime);
}
