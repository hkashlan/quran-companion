import {
	boolean,
	index,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";

import { user } from "./auth.drizzle";

/**
 * One row per device subscription. `kind` discriminates the delivery channel:
 *  - "webpush": browser/PWA subscription — uses endpoint + p256dh + auth
 *  - "fcm" / "apns": Capacitor native — uses `token`
 */
export const pushTokenKindEnum = pgEnum("push_token_kind", [
	"webpush",
	"fcm",
	"apns",
]);

export const pushTokens = pgTable(
	"push_tokens",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		kind: pushTokenKindEnum("kind").default("webpush").notNull(),

		// Native (fcm/apns)
		token: varchar("token", { length: 512 }),

		// Web Push (VAPID) subscription
		endpoint: text("endpoint"),
		p256dh: text("p256dh"),
		auth: text("auth"),

		platform: varchar("platform", { length: 16 }).default("unknown").notNull(),
		deviceId: varchar("device_id", { length: 128 }),
		isActive: boolean("is_active").default(true).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("push_tokens_userId_idx").on(table.userId),
		index("push_tokens_token_idx").on(table.token),
		index("push_tokens_endpoint_idx").on(table.endpoint),
	],
);
