import { BottomTabBar } from "@/components/BottomTabBar";
import { useI18n } from "@/lib/i18n";
import { getNotifications } from "@/server/queries";
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { Bell, Mail, Settings, Trophy, Users } from "lucide-react";

export const Route = createFileRoute("/_protected/teacher")({
	beforeLoad: ({ context }) => {
		const role = (context as { session?: { user?: { role?: string } } }).session?.user?.role;
		if (role && role !== "teacher") throw redirect({ to: "/student" });
	},
	loader: async () => {
		const { unread } = await getNotifications();
		return { unread };
	},
	component: TeacherShell,
});

function TeacherShell() {
	const { t } = useI18n();
	const { unread } = Route.useLoaderData();
	const tabs = [
		{ to: "/teacher", icon: <Users size={22} />, label: t("nav.students") },
		{ to: "/teacher/requests", icon: <Mail size={22} />, label: t("nav.requests") },
		{ to: "/teacher/leaderboard", icon: <Trophy size={22} />, label: t("nav.leaderboard") },
		{
			to: "/teacher/notifications",
			icon: <Bell size={22} />,
			label: t("nav.notifications"),
			badge: unread,
		},
		{ to: "/teacher/settings", icon: <Settings size={22} />, label: t("nav.settings") },
	];
	return (
		<div className="mx-auto min-h-screen max-w-md bg-background pb-16">
			<Outlet />
			<BottomTabBar tabs={tabs} />
		</div>
	);
}
