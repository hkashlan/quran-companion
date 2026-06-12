import {
	index,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth.drizzle";
import { learningCircles } from "./learning-circle.drizzle";

export const circleJoinRoleEnum = pgEnum("circle_join_role", [
	"teacher",
	"student",
]);

export const requestStatusEnum = pgEnum("request_status", [
	"pending",
	"approved",
	"rejected",
]);

export const joinRequests = pgTable(
	"join_requests",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		circleId: uuid("circle_id")
			.notNull()
			.references(() => learningCircles.id, { onDelete: "cascade" }),
		requestedRole: circleJoinRoleEnum("requested_role").notNull(),
		status: requestStatusEnum("status").default("pending").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("join_requests_circleId_idx").on(table.circleId),
		index("join_requests_status_idx").on(table.status),
	],
);
