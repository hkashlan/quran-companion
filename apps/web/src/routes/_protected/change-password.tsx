import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronRight, Lock } from "lucide-react";
import { useState } from "react";
import { Button, TextInput } from "@/components/ui";
import { changePassword } from "@/lib/auth-client";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_protected/change-password")({
	component: ChangePassword,
});

function ChangePassword() {
	const { t } = useI18n();
	const navigate = useNavigate();
	const [current, setCurrent] = useState("");
	const [next, setNext] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [done, setDone] = useState(false);

	async function save(e: React.FormEvent) {
		e.preventDefault();
		setLoading(true);
		setError(null);
		const { error } = await changePassword({
			currentPassword: current,
			newPassword: next,
		});
		setLoading(false);
		if (error) return setError(error.message ?? "Failed");
		setDone(true);
		setTimeout(() => navigate({ to: "/" }), 900);
	}

	return (
		<div className="mx-auto flex min-h-screen max-w-sm flex-col gap-4 bg-background p-6">
			<header className="flex items-center gap-2">
				<button
					type="button"
					onClick={() => navigate({ to: "/" })}
					className="text-text-secondary"
				>
					<ChevronRight size={24} />
				</button>
				<h1 className="text-[20px] font-bold text-text">{t("change.title")}</h1>
			</header>
			<form onSubmit={save} className="flex flex-col gap-3">
				<TextInput
					icon={<Lock size={20} />}
					type="password"
					placeholder={t("change.current")}
					value={current}
					onChange={(e) => setCurrent(e.target.value)}
					required
				/>
				<TextInput
					icon={<Lock size={20} />}
					type="password"
					placeholder={t("change.new")}
					value={next}
					onChange={(e) => setNext(e.target.value)}
					required
				/>
				{error ? <p className="text-[13px] text-error">{error}</p> : null}
				{done ? (
					<p className="rounded-md bg-primary-light p-3 text-center text-[14px] font-semibold text-primary">
						{t("change.done")}
					</p>
				) : (
					<Button type="submit" loading={loading}>
						{t("change.save")}
					</Button>
				)}
			</form>
		</div>
	);
}
