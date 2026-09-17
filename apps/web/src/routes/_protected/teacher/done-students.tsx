import { createFileRoute } from "@tanstack/react-router";
import { MessageStudents } from "@/components/MessageStudents";
import { useI18n } from "@/lib/i18n";
import { getDoneStudents, getMessageTemplates } from "@/server/queries";

export const Route = createFileRoute("/_protected/teacher/done-students")({
	loader: async () => {
		const [done, saved] = await Promise.all([
			getDoneStudents(),
			getMessageTemplates(),
		]);
		return { students: done.students, templates: saved.templates };
	},
	component: DoneStudents,
});

function DoneStudents() {
	const { t } = useI18n();
	const { students, templates } = Route.useLoaderData();
	return (
		<MessageStudents
			title={t("done.title")}
			subtitle={t("done.subtitle")}
			emptyText={t("done.none")}
			students={students}
			templates={templates}
		/>
	);
}
