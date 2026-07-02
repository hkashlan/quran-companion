import {
	createFileRoute,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import { ChevronRight, User } from "lucide-react";
import { useState } from "react";
import { Button, TextInput } from "@/components/ui";
import { updateUser } from "@/lib/auth-client";
import { useI18n } from "@/lib/i18n";
import { getMe } from "@/server/queries";

export const Route = createFileRoute("/_protected/change-name")({
	loader: async () => getMe(),
	component: ChangeName,
});

function ChangeName() {
	const { t } = useI18n();
	const navigate = useNavigate();
	const router = useRouter();
	const me = Route.useLoaderData();
	const [name, setName] = useState(me.name);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [done, setDone] = useState(false);

	async function save(e: React.FormEvent) {
		e.preventDefault();
		const trimmed = name.trim();
		if (!trimmed) return setError(t("name.empty"));
		setLoading(true);
		setError(null);
		const { error } = await updateUser({ name: trimmed });
		setLoading(false);
		if (error) return setError(error.message ?? "Failed");
		setDone(true);
		// Refresh cached loaders so the new name shows everywhere it's rendered.
		await router.invalidate();
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
				<h1 className="text-[20px] font-bold text-text">{t("name.title")}</h1>
			</header>
			<form onSubmit={save} className="flex flex-col gap-3">
				<TextInput
					icon={<User size={20} />}
					type="text"
					placeholder={t("auth.name")}
					value={name}
					onChange={(e) => setName(e.target.value)}
					required
				/>
				{error ? <p className="text-[13px] text-error">{error}</p> : null}
				{done ? (
					<p className="rounded-md bg-primary-light p-3 text-center text-[14px] font-semibold text-primary">
						{t("name.done")}
					</p>
				) : (
					<Button type="submit" loading={loading}>
						{t("name.save")}
					</Button>
				)}
			</form>
		</div>
	);
}
