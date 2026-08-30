import { createFileRoute, Link } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { StudentHomeBody } from "@/components/StudentHome";
import { useI18n } from "@/lib/i18n";
import { getStudentHome } from "@/server/queries";

export const Route = createFileRoute("/_protected/student/")({
	loader: async () => getStudentHome(),
	component: StudentHome,
});

function StudentHome() {
	const { t } = useI18n();
	const data = Route.useLoaderData();

	return (
		<div className="flex flex-col gap-4 p-4">
			<header className="flex items-center justify-between pt-2">
				<h1 className="text-[22px] font-bold text-text">
					{t("home.greeting", { name: data.user.name })}
				</h1>
				<div className="flex items-center gap-2">
					{data.user.role === "teacher" ? (
						// A teacher following their own learning here: way back to
						// the circles they teach.
						<Link
							to="/teacher"
							className="flex items-center gap-1 rounded-md bg-primary-light px-2 py-1.5 text-[12px] font-semibold text-primary"
						>
							<Users size={14} /> {t("home.teacherView")}
						</Link>
					) : null}
					<div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-white">
						{data.user.name.slice(0, 1)}
					</div>
				</div>
			</header>

			<StudentHomeBody data={data} />
		</div>
	);
}
