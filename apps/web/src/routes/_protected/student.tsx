import { createFileRoute, Outlet } from "@tanstack/react-router";
import { BarChart3, Bell, Home, Settings, Trophy } from "lucide-react";
import { BottomTabBar } from "@/components/BottomTabBar";
import { useI18n } from "@/lib/i18n";
import { getNotifications } from "@/server/queries";

/**
 * Student tab shell with the bottom tab navigation. No role guard: students
 * live here, and a teacher can open it to follow their own learning in a
 * circle they joined as a student (the teacher shell stays teacher-only).
 */
export const Route = createFileRoute("/_protected/student")({
	loader: async () => {
		const { unread } = await getNotifications();
		return { unread };
	},
	component: StudentShell,
});

function StudentShell() {
	const { t } = useI18n();
	const { unread } = Route.useLoaderData();
	const tabs = [
		{ to: "/student", icon: <Home size={22} />, label: t("nav.home") },
		{
			to: "/student/leaderboard",
			icon: <Trophy size={22} />,
			label: t("nav.leaderboard"),
		},
		{
			to: "/student/progress",
			icon: <BarChart3 size={22} />,
			label: t("nav.progress"),
		},
		{
			to: "/student/notifications",
			icon: <Bell size={22} />,
			label: t("nav.notifications"),
			badge: unread,
		},
		{
			to: "/student/settings",
			icon: <Settings size={22} />,
			label: t("nav.settings"),
		},
	];
	return (
		<div className="mx-auto min-h-screen max-w-md bg-background pb-16">
			<Outlet />
			<BottomTabBar tabs={tabs} />
		</div>
	);
}
