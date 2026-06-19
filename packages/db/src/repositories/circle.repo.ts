import { and, eq, ne, sql } from "drizzle-orm";

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

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I

/** 8-char uppercase join code (ambiguous chars excluded). */
function generateCircleCode(): string {
	let code = "";
	for (let i = 0; i < 8; i++) {
		code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
	}
	return code;
}

export type NewCircleSlot = {
	dayOfWeek: number;
	startTime: string;
	endTime: string;
};

export type NewCircleInput = {
	ownerTeacherId: string;
	title: string;
	description: string | null;
	location: string | null;
	reminderHoursBeforeStart: number;
	slots: NewCircleSlot[];
};

/**
 * Create a circle owned by a teacher: generates a unique join code, inserts the
 * circle, the owner membership, and any weekly time slots. Returns the new circle.
 */
export async function createCircle(input: NewCircleInput) {
	// Find a code not already in use (retry on the rare collision).
	let code = generateCircleCode();
	for (let attempt = 0; attempt < 5; attempt++) {
		const existing = await db
			.select({ id: learningCircles.id })
			.from(learningCircles)
			.where(eq(learningCircles.code, code))
			.limit(1);
		if (existing.length === 0) break;
		code = generateCircleCode();
	}

	return db.transaction(async (tx) => {
		const [circle] = await tx
			.insert(learningCircles)
			.values({
				ownerTeacherId: input.ownerTeacherId,
				title: input.title,
				description: input.description,
				location: input.location,
				reminderHoursBeforeStart: input.reminderHoursBeforeStart,
				code,
			})
			.returning();

		await tx.insert(circleMemberships).values({
			circleId: circle.id,
			userId: input.ownerTeacherId,
			role: "owner",
		});

		if (input.slots.length > 0) {
			await tx.insert(learningCircleSlots).values(
				input.slots.map((s) => ({
					circleId: circle.id,
					dayOfWeek: s.dayOfWeek,
					startTime: s.startTime,
					endTime: s.endTime,
				})),
			);
		}

		return circle;
	});
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

/**
 * Remove a user's membership from a circle. Owners can't leave their own circle
 * (they'd delete it instead), so owner memberships are left untouched. Returns
 * true if a membership was actually removed.
 */
export async function leaveCircle(
	userId: string,
	circleId: string,
): Promise<boolean> {
	const deleted = await db
		.delete(circleMemberships)
		.where(
			and(
				eq(circleMemberships.userId, userId),
				eq(circleMemberships.circleId, circleId),
				ne(circleMemberships.role, "owner"),
			),
		)
		.returning({ id: circleMemberships.id });
	return deleted.length > 0;
}

export async function getCircleSlots(circleId: string) {
	return db
		.select()
		.from(learningCircleSlots)
		.where(eq(learningCircleSlots.circleId, circleId))
		.orderBy(learningCircleSlots.dayOfWeek, learningCircleSlots.startTime);
}
