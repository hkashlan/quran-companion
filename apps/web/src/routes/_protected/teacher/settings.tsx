import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Card } from "@/components/ui";
import { signOut } from "@/lib/auth-client";
import { enableFirebasePush } from "@/lib/firebase-push";
import { LOCALE_LABEL, LOCALES, type Locale, useI18n } from "@/lib/i18n";
import { isIosNeedingInstall, type PushResult } from "@/lib/push-client";
import { getMe } from "@/server/queries";

export const Route = createFileRoute("/_protected/teacher/settings")({
	loader: async () => getMe(),
	component: TeacherSettings,
});

function TeacherSettings() {
	const { t, locale, setLocale } = useI18n();
	const navigate = useNavigate();
	const me = Route.useLoaderData();
	const [pushMsg, setPushMsg] = useState<PushResult | null>(null);
	const [iosHint, setIosHint] = useState(false);
	useEffect(() => setIosHint(isIosNeedingInstall()), []);

	async function logout() {
		await signOut();
		navigate({ to: "/login" });
	}

	async function notifications() {
		setPushMsg(await enableFirebasePush());
	}

	return (
		<div className="flex flex-col gap-4 p-4">
			<h1 className="text-[22px] font-bold text-text">{t("settings.title")}</h1>
			<Card className="p-0">
				<button
					type="button"
					onClick={() => navigate({ to: "/change-name" })}
					className="flex w-full items-center gap-3 p-4 text-start active:opacity-80"
				>
					<div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white">
						{me.name.slice(0, 1)}
					</div>
					<span className="flex-1 text-[16px] font-bold text-text">
						{me.name}
					</span>
					<Pencil size={18} className="text-text-light" />
				</button>
			</Card>
			<div className="flex flex-col gap-2">
				<span className="text-[13px] font-semibold text-text">
					{t("settings.language")}
				</span>
				<div className="flex gap-2">
					{LOCALES.map((l: Locale) => (
						<button
							type="button"
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
			<div className="flex flex-col gap-2">
				<Button variant="outline" onClick={notifications}>
					{t("settings.enableNotifications")}
				</Button>
				{(pushMsg || iosHint) && (
					<p
						className={`text-[12px] leading-relaxed ${
							pushMsg === "subscribed"
								? "text-primary"
								: "text-text-secondary"
						}`}
					>
						{pushMsg ? t(`push.${pushMsg}`) : t("push.ios-install")}
					</p>
				)}
			</div>
			<Button
				variant="outline"
				onClick={() => navigate({ to: "/change-password" })}
			>
				{t("settings.changePassword")}
			</Button>
			<Button variant="outline" onClick={logout}>
				{t("settings.logout")}
			</Button>
			<p className="text-center text-[12px] text-text-light">
				{t("settings.version")} 1.0.0
			</p>
		</div>
	);
}
