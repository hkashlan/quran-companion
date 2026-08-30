import { createFileRoute } from "@tanstack/react-router";
import { StudentHomeBody } from "@/components/StudentHome";
import { useI18n } from "@/lib/i18n";
import { getStudentHome } from "@/server/queries";

/**
 * "Home" tab for a teacher: their own learning — the student home for the
 * circles they joined as a student (join box when there are none).
 */
export const Route = createFileRoute("/_protected/teacher/home")({
	loader: async () => getStudentHome(),
	component: TeacherStudentHome,
});

function TeacherStudentHome() {
	const { t } = useI18n();
	const data = Route.useLoaderData();
	return (
		<div className="flex flex-col gap-4 p-4">
			<header className="flex items-center justify-between pt-2">
				<h1 className="text-[22px] font-bold text-text">
					{t("home.greeting", { name: data.user.name })}
				</h1>
				<div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-white">
					{data.user.name.slice(0, 1)}
				</div>
			</header>
			<StudentHomeBody data={data} planTo="/teacher/plan" />
		</div>
	);
}
