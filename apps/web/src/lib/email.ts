import { Resend } from "resend";

/**
 * Transactional email via Resend. When RESEND_API_KEY is unset (dev), the caller
 * falls back to logging the OTP, so the flow still works without a provider.
 */
let client: Resend | null = null;
function resend(): Resend | null {
	const key = process.env.RESEND_API_KEY;
	if (!key) return null;
	if (!client) client = new Resend(key);
	return client;
}

type OtpType = "email-verification" | "forget-password" | "sign-in";

const SUBJECTS: Record<OtpType, string> = {
	"email-verification": "تأكيد بريدك الإلكتروني · Confirm your email",
	"forget-password": "إعادة تعيين كلمة المرور · Reset your password",
	"sign-in": "رمز تسجيل الدخول · Your sign-in code",
};

function html(otp: string, type: OtpType): string {
	const heading =
		type === "forget-password"
			? "رمز إعادة تعيين كلمة المرور"
			: type === "sign-in"
				? "رمز تسجيل الدخول"
				: "رمز تأكيد البريد الإلكتروني";
	return `
  <div dir="rtl" style="font-family: 'Cairo', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #1A2E1A;">
    <h1 style="color: #0A7B4F; font-size: 22px;">رفيق القرآن</h1>
    <p style="font-size: 15px; color: #5A6E5A;">${heading}</p>
    <div style="font-size: 34px; font-weight: 700; letter-spacing: 8px; color: #0A7B4F; background: #E8F5EE; border-radius: 12px; padding: 16px; text-align: center; margin: 16px 0;">
      ${otp}
    </div>
    <p style="font-size: 13px; color: #8A9A8A;">صالح لمدة 10 دقائق · valid for 10 minutes</p>
  </div>`;
}

/** Returns true if an email was actually dispatched via Resend. */
export async function sendOtpEmail(
	email: string,
	otp: string,
	type: string,
): Promise<boolean> {
	const r = resend();
	if (!r) return false;
	const t =
		(type as OtpType) in SUBJECTS ? (type as OtpType) : "email-verification";
	const { error } = await r.emails.send({
		from: process.env.EMAIL_FROM ?? "Quran Companion <onboarding@resend.dev>",
		to: email,
		subject: SUBJECTS[t],
		html: html(otp, t),
	});
	if (error) throw new Error(`Resend error: ${error.message}`);
	return true;
}
