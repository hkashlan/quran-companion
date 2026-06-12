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

export const invitationStatusEnum = pgEnum("invitation_status", [
	"pending",
	"accepted",
	"rejected",
]);

export const teacherInvitations = pgTable(
	"teacher_invitations",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		circleId: uuid("circle_id")
			.notNull()
			.references(() => learningCircles.id, { onDelete: "cascade" }),
		inviterId: text("inviter_id")
			.notNull()
			.references(() => user.id),
		inviteeId: text("invitee_id")
			.notNull()
			.references(() => user.id),
		status: invitationStatusEnum("status").default("pending").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		respondedAt: timestamp("responded_at"),
	},
	(table) => [
		index("teacher_invitations_circleId_idx").on(table.circleId),
		index("teacher_invitations_inviteeId_idx").on(table.inviteeId),
	],
);
