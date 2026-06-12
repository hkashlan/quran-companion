import { ReviewProgress } from "@/components/ReviewProgress";
import { useI18n } from "@/lib/i18n";
import { getStudentProgress } from "@/server/queries";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/student/progress")({
	loader: async () => getStudentProgress(),
	component: ProgressScreen,
});

function ProgressScreen() {
	const { t } = useI18n();
	const data = Route.useLoaderData();
	return (
		<div className="flex flex-col gap-4 p-4">
			<h1 className="text-[22px] font-bold text-text">{t("nav.progress")}</h1>
			<ReviewProgress
				reviews={data.reviews}
				sessions={data.sessions}
				points={data.points}
				streak={data.streak}
			/>
		</div>
	);
}
