import { useI18n } from "@/lib/i18n";
import { getNotifications, markAllNotificationsRead } from "@/server/queries";
import { createFileRoute, useRouter } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/student/notifications")({
	loader: async () => getNotifications(),
	component: NotificationsScreen,
});

function NotificationsScreen() {
	const { t } = useI18n();
	const router = useRouter();
	const { items, unread } = Route.useLoaderData();

	async function markAll() {
		await markAllNotificationsRead();
		router.invalidate();
	}

	return (
		<div className="flex flex-col gap-4 p-4">
			<div className="flex items-center justify-between">
				<h1 className="text-[22px] font-bold text-text">{t("notifications.title")}</h1>
				{unread > 0 ? (
					<button onClick={markAll} className="text-[13px] font-semibold text-primary">
						{t("notifications.markAllRead")}
					</button>
				) : null}
			</div>

			{items.length === 0 ? (
				<p className="py-12 text-center text-[14px] text-text-secondary">
					{t("notifications.empty")}
				</p>
			) : (
				<div className="flex flex-col gap-2">
					{items.map((n) => (
						<div
							key={n.id}
							className={`flex flex-col gap-1 rounded-md border px-3 py-2.5 ${
								n.isRead ? "border-border bg-surface" : "border-primary bg-primary-light"
							}`}
						>
							<div className="flex items-center justify-between">
								<span className="text-[14px] font-bold text-text">{n.title}</span>
								{!n.isRead ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
							</div>
							<span className="text-[13px] text-text-secondary">{n.body}</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
