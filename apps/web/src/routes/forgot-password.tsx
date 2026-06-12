import { AuthShell, OtpInput } from "@/components/auth-ui";
import { Button, TextInput } from "@/components/ui";
import { emailOtp, forgetPassword } from "@/lib/auth-client";
import { useI18n } from "@/lib/i18n";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { KeyRound, Lock, Mail } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/forgot-password")({ component: ForgotPassword });

function ForgotPassword() {
	const { t } = useI18n();
	const navigate = useNavigate();
	const [email, setEmail] = useState("");
	const [otp, setOtp] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [stage, setStage] = useState<"email" | "reset" | "done">("email");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	async function sendCode(e: React.FormEvent) {
		e.preventDefault();
		setLoading(true);
		setError(null);
		const { error } = await forgetPassword.emailOtp({ email });
		setLoading(false);
		if (error) return setError(error.message ?? "Failed");
		setStage("reset");
	}

	async function reset(e: React.FormEvent) {
		e.preventDefault();
		setLoading(true);
		setError(null);
		const { error } = await emailOtp.resetPassword({ email, otp, password: newPassword });
		setLoading(false);
		if (error) return setError(error.message ?? "Invalid code");
		setStage("done");
		setTimeout(() => navigate({ to: "/login" }), 1200);
	}

	return (
		<AuthShell
			icon={<KeyRound size={36} className="text-white" />}
			title={t("auth.resetTitle")}
			subtitle={stage === "email" ? t("auth.resetHint") : t("auth.confirmHint")}
		>
			{stage === "done" ? (
				<p className="rounded-md bg-primary-light p-4 text-center text-[14px] font-semibold text-primary">
					{t("auth.resetDone")}
				</p>
			) : stage === "email" ? (
				<form onSubmit={sendCode} className="flex flex-col gap-3">
					<TextInput icon={<Mail size={20} />} type="email" placeholder={t("auth.email")} value={email} onChange={(e) => setEmail(e.target.value)} required />
					{error ? <p className="text-[13px] text-error">{error}</p> : null}
					<Button type="submit" loading={loading}>
						{t("auth.sendReset")}
					</Button>
				</form>
			) : (
				<form onSubmit={reset} className="flex flex-col gap-3">
					<OtpInput value={otp} onChange={setOtp} />
					<TextInput icon={<Lock size={20} />} type="password" placeholder={t("auth.newPassword")} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
					{error ? <p className="text-[13px] text-error">{error}</p> : null}
					<Button type="submit" loading={loading}>
						{t("auth.resetPassword")}
					</Button>
				</form>
			)}
			<Link to="/login" className="text-center text-[13px] font-semibold text-text-secondary underline">
				{t("auth.backToLogin")}
			</Link>
		</AuthShell>
	);
}
