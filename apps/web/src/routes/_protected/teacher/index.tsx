import { Card, Section } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { getTeacherHome } from "@/server/queries";
import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";

export const Route = createFileRoute("/_protected/teacher/")({
	loader: async () => getTeacherHome(),
	component: TeacherHome,
});

function TeacherHome() {
	const { t } = useI18n();
	const data = Route.useLoaderData();
	return (
		<div className="flex flex-col gap-4 p-4">
			<header className="flex items-center justify-between pt-2">
				<h1 className="text-[22px] font-bold text-text">
					{t("teacher.greeting", { name: data.user.name })}
				</h1>
				<div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-white">
					{data.user.name.slice(0, 1)}
				</div>
			</header>

			<Section title={t("teacher.myCircles")}>
				{data.circles.map((c) => (
					<Card key={c.id} className="flex flex-col gap-2">
						<div className="flex items-center justify-between">
							<span className="text-[15px] font-bold text-text">{c.title}</span>
							<span className="text-[12px] text-text-secondary">
								{t("teacher.code")}: {c.code}
							</span>
						</div>
						{c.description ? (
							<span className="text-[13px] text-text-secondary">{c.description}</span>
						) : null}
						<span className="flex items-center gap-1 text-[12px] text-text-light">
							<Users size={14} /> {c.studentsCount} {t("teacher.members")}
						</span>
					</Card>
				))}
			</Section>
		</div>
	);
}
