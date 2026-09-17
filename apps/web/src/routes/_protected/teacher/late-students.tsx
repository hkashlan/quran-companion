import { createFileRoute } from "@tanstack/react-router";
import { MessageStudents } from "@/components/MessageStudents";
import { useI18n } from "@/lib/i18n";
import { getLateStudents, getMessageTemplates } from "@/server/queries";

export const Route = createFileRoute("/_protected/teacher/late-students")({
	loader: async () => {
		const [late, saved] = await Promise.all([
			getLateStudents(),
			getMessageTemplates(),
		]);
		return { students: late.students, templates: saved.templates };
	},
	component: LateStudents,
});

function LateStudents() {
	const { t } = useI18n();
	const { students, templates } = Route.useLoaderData();
	return (
		<MessageStudents
			title={t("late.title")}
			subtitle={t("late.subtitle")}
			emptyText={t("late.none")}
			students={students}
			templates={templates}
		/>
	);
}
