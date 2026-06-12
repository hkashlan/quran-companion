import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Lock, Mail } from "lucide-react";
import { useState } from "react";
import { AuthShell, OtpInput } from "@/components/auth-ui";
import { Button, TextInput } from "@/components/ui";
import { emailOtp, signIn } from "@/lib/auth-client";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
	const { t } = useI18n();
	const navigate = useNavigate();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [otp, setOtp] = useState("");
	const [needsConfirm, setNeedsConfirm] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	async function onLogin(e: React.FormEvent) {
		e.preventDefault();
		setLoading(true);
		setError(null);
		const { data, error } = await signIn.email({ email, password });
		setLoading(false);
		if (error) return setError(error.message ?? "Login failed");
		if (data?.user && !data.user.emailVerified) {
			await emailOtp.sendVerificationOtp({ email, type: "email-verification" });
			setNeedsConfirm(true);
			return;
		}
		navigate({ to: "/" });
	}

	async function onConfirm(e: React.FormEvent) {
		e.preventDefault();
		setLoading(true);
		setError(null);
		const { error } = await emailOtp.verifyEmail({ email, otp });
		setLoading(false);
		if (error) return setError(error.message ?? "Invalid code");
		navigate({ to: "/" });
	}

	if (needsConfirm) {
		return (
			<AuthShell
				title={t("auth.confirmTitle")}
				subtitle={t("auth.confirmHint")}
			>
				<form onSubmit={onConfirm} className="flex flex-col gap-3">
					<OtpInput value={otp} onChange={setOtp} />
					{error ? <p className="text-[13px] text-error">{error}</p> : null}
					<Button type="submit" loading={loading}>
						{t("auth.confirm")}
					</Button>
					<button
						type="button"
						onClick={() =>
							emailOtp.sendVerificationOtp({
								email,
								type: "email-verification",
							})
						}
						className="text-[13px] font-semibold text-primary"
					>
						{t("auth.resend")}
					</button>
				</form>
			</AuthShell>
		);
	}

	return (
		<AuthShell title={t("appName")} subtitle={t("auth.subtitle")}>
			<form onSubmit={onLogin} className="flex flex-col gap-3">
				<TextInput
					icon={<Mail size={20} />}
					type="email"
					placeholder={t("auth.email")}
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					required
				/>
				<TextInput
					icon={<Lock size={20} />}
					type="password"
					placeholder={t("auth.password")}
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					required
				/>
				<Link
					to="/forgot-password"
					className="text-end text-[13px] font-semibold text-primary"
				>
					{t("auth.forgot")}
				</Link>
				{error ? <p className="text-[13px] text-error">{error}</p> : null}
				<Button type="submit" loading={loading}>
					{t("auth.loginCta")}
				</Button>
			</form>
			<p className="text-center text-[13px] text-text-secondary">
				{t("auth.noAccount")}{" "}
				<Link to="/register" className="font-semibold text-primary">
					{t("auth.signupCta")}
				</Link>
			</p>
		</AuthShell>
	);
}
