import { useRouter } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Segmented } from "@/components/pickers";
import { useI18n } from "@/lib/i18n";
import {
	deleteAllNotifications,
	deleteNotification,
	markAllNotificationsRead,
	markNotificationRead,
} from "@/server/queries";

type NotificationItem = {
	id: string;
	title: string;
	body: string;
	isRead: boolean;
	eventType: string;
};

/** Where each notification type takes the user when tapped (null = not actionable). */
function destFor(
	eventType: string,
): "/student" | "/student/plan" | "/teacher/requests" | "/teacher" | null {
	switch (eventType) {
		case "review_assigned":
			return "/student";
		case "plan_change_approved":
		case "plan_change_rejected":
			return "/student/plan";
		case "plan_change_requested":
			// Teacher: the screen where the pending plan change can be approved.
			return "/teacher/requests";
		case "plan_changed":
			return "/teacher";
		default:
			return null;
	}
}

/** Notification list: unread/all filter, bulk actions, tap-to-act, per-row delete. */
export function NotificationList({ items }: { items: NotificationItem[] }) {
	const { t } = useI18n();
	const router = useRouter();
	// Default to showing only unread notifications.
	const [filter, setFilter] = useState<"unread" | "all">("unread");

	async function open(n: NotificationItem) {
		if (!n.isRead) await markNotificationRead({ data: { id: n.id } });
		router.invalidate(); // refresh the list + unread badge
		const dest = destFor(n.eventType);
		if (dest) router.navigate({ to: dest });
	}

	async function removeOne(id: string) {
		await deleteNotification({ data: { id } });
		router.invalidate();
	}

	async function markAll() {
		await markAllNotificationsRead();
		router.invalidate();
	}

	async function removeAll() {
		if (!window.confirm(t("notifications.confirmDeleteAll"))) return;
		await deleteAllNotifications();
		router.invalidate();
	}

	if (items.length === 0)
		return (
			<p className="py-12 text-center text-[14px] text-text-secondary">
				{t("notifications.empty")}
			</p>
		);

	const hasUnread = items.some((n) => !n.isRead);
	const shown = filter === "unread" ? items.filter((n) => !n.isRead) : items;

	return (
		<div className="flex flex-col gap-3">
			<Segmented
				value={filter}
				onChange={setFilter}
				options={[
					{ value: "unread", label: t("notifications.unread") },
					{ value: "all", label: t("notifications.all") },
				]}
			/>

			<div className="flex items-center justify-end gap-4 text-[12px] font-semibold">
				{hasUnread ? (
					<button type="button" onClick={markAll} className="text-primary">
						{t("notifications.markAllRead")}
					</button>
				) : null}
				<button type="button" onClick={removeAll} className="text-error">
					{t("notifications.deleteAll")}
				</button>
			</div>

			{shown.length === 0 ? (
				<p className="py-10 text-center text-[14px] text-text-secondary">
					{t("notifications.noUnread")}
				</p>
			) : (
				<div className="flex flex-col gap-2">
					{shown.map((n) => (
						<div key={n.id} className="flex items-stretch gap-1">
							<button
								type="button"
								onClick={() => open(n)}
								className={`flex flex-1 flex-col gap-1 rounded-md border px-3 py-2.5 text-start active:opacity-80 ${
									n.isRead
										? "border-border bg-surface"
										: "border-primary bg-primary-light"
								}`}
							>
								<div className="flex items-center justify-between">
									<span className="text-[14px] font-bold text-text">
										{n.title}
									</span>
									{!n.isRead ? (
										<span className="h-2 w-2 rounded-full bg-primary" />
									) : null}
								</div>
								<span className="text-[13px] text-text-secondary">
									{n.body}
								</span>
							</button>
							<button
								type="button"
								onClick={() => removeOne(n.id)}
								aria-label={t("notifications.delete")}
								className="flex items-center justify-center rounded-md border border-border px-3 text-text-light active:bg-error/10 active:text-error"
							>
								<Trash2 size={16} />
							</button>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
