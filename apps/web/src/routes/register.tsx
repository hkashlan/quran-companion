import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { GraduationCap, Lock, Mail, User, Users } from "lucide-react";
import { useState } from "react";
import { AuthShell, OtpInput } from "@/components/auth-ui";
import { Button, TextInput } from "@/components/ui";
import { emailOtp, signUp } from "@/lib/auth-client";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/register")({ component: RegisterPage });

type Role = "teacher" | "student";

function RegisterPage() {
	const { t } = useI18n();
	const navigate = useNavigate();
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [role, setRole] = useState<Role>("student");
	const [otp, setOtp] = useState("");
	const [confirming, setConfirming] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	async function onRegister(e: React.FormEvent) {
		e.preventDefault();
		setLoading(true);
		setError(null);
		const { error } = await signUp.email({ email, password, name, role });
		if (error) {
			setLoading(false);
			return setError(error.message ?? "Registration failed");
		}
		await emailOtp.sendVerificationOtp({ email, type: "email-verification" });
		setLoading(false);
		setConfirming(true);
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

	if (confirming) {
		return (
			<AuthShell
				title={t("auth.confirmTitle")}
				subtitle={t("auth.confirmHint")}
			>
				<form onSubmit={onConfirm} className="flex flex-col gap-3">
					<p className="text-center text-[14px] font-semibold text-primary">
						{email}
					</p>
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

	const roles: { value: Role; label: string; icon: React.ReactNode }[] = [
		{
			value: "student",
			label: t("auth.student"),
			icon: <GraduationCap size={28} />,
		},
		{ value: "teacher", label: t("auth.teacher"), icon: <Users size={28} /> },
	];

	return (
		<AuthShell title={t("auth.register")} subtitle={t("auth.subtitle")}>
			<form onSubmit={onRegister} className="flex flex-col gap-3">
				<TextInput
					icon={<User size={20} />}
					placeholder={t("auth.name")}
					value={name}
					onChange={(e) => setName(e.target.value)}
					required
				/>
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
				<span className="text-[14px] font-semibold text-text">
					{t("auth.role")}
				</span>
				<div className="flex gap-3">
					{roles.map((r) => (
						<button
							type="button"
							key={r.value}
							onClick={() => setRole(r.value)}
							className={`flex flex-1 flex-col items-center gap-2 rounded-lg border-2 py-5 ${
								role === r.value
									? "border-primary bg-primary-light text-primary"
									: "border-border bg-surface text-text-secondary"
							}`}
						>
							{r.icon}
							<span className="text-[15px] font-semibold">{r.label}</span>
						</button>
					))}
				</div>
				{error ? <p className="text-[13px] text-error">{error}</p> : null}
				<Button type="submit" loading={loading}>
					{t("auth.signupCta")}
				</Button>
			</form>
			<p className="text-center text-[13px] text-text-secondary">
				{t("auth.haveAccount")}{" "}
				<Link to="/login" className="font-semibold text-primary">
					{t("auth.loginCta")}
				</Link>
			</p>
		</AuthShell>
	);
}
