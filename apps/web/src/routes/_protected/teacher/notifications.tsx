import { createFileRoute } from "@tanstack/react-router";
import { NotificationList } from "@/components/NotificationList";
import { useI18n } from "@/lib/i18n";
import { getNotifications } from "@/server/queries";

export const Route = createFileRoute("/_protected/teacher/notifications")({
	loader: async () => getNotifications(),
	component: TeacherNotifications,
});

function TeacherNotifications() {
	const { t } = useI18n();
	const { items } = Route.useLoaderData();

	return (
		<div className="flex flex-col gap-4 p-4">
			<h1 className="text-[22px] font-bold text-text">
				{t("notifications.title")}
			</h1>
			<NotificationList items={items} viewer="teacher" />
		</div>
	);
}
