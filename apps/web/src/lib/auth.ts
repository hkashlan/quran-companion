import { db } from "@quran/db/db";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins";

/**
 * Delivers an OTP. In dev it logs to stdout (so the flow is testable without an
 * email provider); in production wire Resend here (RESEND_API_KEY in .env).
 */
async function deliverOtp(email: string, otp: string, type: string) {
	if (process.env.RESEND_API_KEY) {
		// TODO(prod): send via Resend
		// await resend.emails.send({ to: email, from: EMAIL_FROM, subject, html })
	}
	console.log(`[OTP] ${type} ${email} ${otp}`);
}

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
	plugins: [
		emailOTP({
			otpLength: 6,
			expiresIn: 600,
			async sendVerificationOTP({ email, otp, type }) {
				await deliverOtp(email, otp, type);
			},
		}),
	],
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
