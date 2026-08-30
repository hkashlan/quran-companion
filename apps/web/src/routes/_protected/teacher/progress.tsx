import { createFileRoute } from "@tanstack/react-router";
import { ReviewProgress } from "@/components/ReviewProgress";
import { useI18n } from "@/lib/i18n";
import { getStudentProgress } from "@/server/queries";

/** "Progress" tab for a teacher: their own reviews/sessions as a student. */
export const Route = createFileRoute("/_protected/teacher/progress")({
	loader: async () => getStudentProgress(),
	component: TeacherStudentProgress,
});

function TeacherStudentProgress() {
	const { t } = useI18n();
	const data = Route.useLoaderData();
	return (
		<div className="flex flex-col gap-4 p-4">
			<h1 className="text-[22px] font-bold text-text">{t("nav.myProgress")}</h1>
			<ReviewProgress
				reviews={data.reviews}
				sessions={data.sessions}
				points={data.points}
				streak={data.streak}
			/>
		</div>
	);
}
