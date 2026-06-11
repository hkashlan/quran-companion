import {
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth.drizzle";
import { learningCircles } from "./learning-circle.drizzle";

export const circleMemberRoleEnum = pgEnum("circle_member_role", [
	"owner",
	"teacher",
	"student",
]);

export const circleMemberships = pgTable(
	"circle_memberships",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		circleId: uuid("circle_id")
			.notNull()
			.references(() => learningCircles.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		role: circleMemberRoleEnum("role").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		unique("uq_circle_memberships_circle_user").on(table.circleId, table.userId),
	],
);
