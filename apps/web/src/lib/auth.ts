import { db } from "@quran/db/db";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";

/**
 * better-auth server instance. The extra Quran-domain user fields (role, points,
 * streak, language, timezone) are declared as `additionalFields` so they are
 * persisted on the `user` table and returned in the session.
 *
 * Phase 1 TODO: add email-verification + reset-password (transactional email via
 * Resend) and wire `sendVerificationEmail` / `sendResetPassword`.
 */
export const auth = betterAuth({
	database: drizzleAdapter(db, { provider: "pg" }),
	emailAndPassword: {
		enabled: true,
		requireEmailVerification: false,
	},
	user: {
		additionalFields: {
			role: { type: "string", required: true, input: true },
			points: { type: "number", required: false, defaultValue: 0, input: false },
			streak: { type: "number", required: false, defaultValue: 0, input: false },
			streakLastDate: { type: "string", required: false, input: false },
			language: { type: "string", required: false, defaultValue: "ar", input: true },
			timezone: { type: "string", required: false, input: true },
		},
	},
});

export type Session = typeof auth.$Infer.Session;
