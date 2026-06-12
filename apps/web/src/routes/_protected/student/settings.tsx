import { Button, Card } from "@/components/ui";
import { LOCALE_LABEL, LOCALES, useI18n, type Locale } from "@/lib/i18n";
import { signOut } from "@/lib/auth-client";
import { enablePush } from "@/lib/push-client";
import { getStudentHome } from "@/server/queries";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/_protected/student/settings")({
	loader: async () => {
		const home = await getStudentHome();
		return { user: home.user };
	},
	component: SettingsScreen,
});

function SettingsScreen() {
	const { t, locale, setLocale } = useI18n();
	const navigate = useNavigate();
	const { user } = Route.useLoaderData();
	const [pushMsg, setPushMsg] = useState<string | null>(null);

	async function logout() {
		await signOut();
		navigate({ to: "/login" });
	}

	async function notifications() {
		const res = await enablePush();
		setPushMsg(res === "subscribed" ? "✓" : res);
	}

	return (
		<div className="flex flex-col gap-4 p-4">
			<h1 className="text-[22px] font-bold text-text">{t("settings.title")}</h1>

			<Card className="flex items-center gap-3">
				<div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white">
					{user.name.slice(0, 1)}
				</div>
				<span className="text-[16px] font-bold text-text">{user.name}</span>
			</Card>

			<div className="flex flex-col gap-2">
				<span className="text-[13px] font-semibold text-text">{t("settings.language")}</span>
				<div className="flex gap-2">
					{LOCALES.map((l: Locale) => (
						<button
							key={l}
							onClick={() => setLocale(l)}
							className={`flex-1 rounded-md border px-3 py-2 text-[13px] font-semibold ${
								locale === l
									? "border-primary bg-primary-light text-primary"
									: "border-border bg-surface text-text-secondary"
							}`}
						>
							{LOCALE_LABEL[l]}
						</button>
					))}
				</div>
			</div>

			<Button variant="outline" onClick={notifications}>
				{t("settings.enableNotifications")}
				{pushMsg ? ` — ${pushMsg}` : ""}
			</Button>
			<Button variant="outline">{t("settings.changePassword")}</Button>
			<Button variant="outline" onClick={logout}>
				{t("settings.logout")}
			</Button>
			<p className="text-center text-[12px] text-text-light">{t("settings.version")} 1.0.0</p>
		</div>
	);
}
