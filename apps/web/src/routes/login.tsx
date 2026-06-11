import { signIn } from "@/lib/auth-client";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/login")({ component: LoginPage });

/**
 * Minimal email/password login. Phase 3 replaces this with the full ported
 * screen (Cairo styling, AR/EN/DE, email-confirm + not-confirmed states,
 * register / forgot-password links).
 */
function LoginPage() {
	const navigate = useNavigate();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	async function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		setLoading(true);
		setError(null);
		const { error } = await signIn.email({ email, password });
		setLoading(false);
		if (error) {
			setError(error.message ?? "Login failed");
			return;
		}
		navigate({ to: "/" });
	}

	return (
		<main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
			<h1 className="text-2xl font-bold text-primary">رفيق القرآن</h1>
			<form onSubmit={onSubmit} className="flex flex-col gap-3">
				<input
					className="h-[54px] rounded-lg border border-border bg-surface px-4"
					type="email"
					placeholder="البريد الإلكتروني"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					required
				/>
				<input
					className="h-[54px] rounded-lg border border-border bg-surface px-4"
					type="password"
					placeholder="كلمة المرور"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					required
				/>
				{error && <p className="text-sm text-error">{error}</p>}
				<button
					type="submit"
					disabled={loading}
					className="h-[54px] rounded-lg bg-primary font-semibold text-white disabled:opacity-60"
				>
					{loading ? "..." : "تسجيل الدخول"}
				</button>
			</form>
		</main>
	);
}
