import { useI18n } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/student/progress")({
	component: ProgressScreen,
});

function ProgressScreen() {
	const { t } = useI18n();
	return (
		<div className="flex flex-col gap-4 p-4">
			<h1 className="text-[22px] font-bold text-text">{t("nav.progress")}</h1>
			<p className="rounded-md bg-accent-light p-4 text-[13px] text-text-secondary">
				StudentProgressTabs (charts + filters) — port in progress.
			</p>
		</div>
	);
}
