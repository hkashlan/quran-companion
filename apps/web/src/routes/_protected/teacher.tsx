import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { BarChart3, Bell, Home, Settings, Trophy, Users } from "lucide-react";
import { BottomTabBar } from "@/components/BottomTabBar";
import { useI18n } from "@/lib/i18n";
import { getNotifications, getPendingRequestsCount } from "@/server/queries";

export const Route = createFileRoute("/_protected/teacher")({
	beforeLoad: ({ context }) => {
		const role = (context as { session?: { user?: { role?: string } } }).session
			?.user?.role;
		if (role && role !== "teacher") throw redirect({ to: "/student" });
	},
	loader: async () => {
		const [{ unread }, { pending }] = await Promise.all([
			getNotifications(),
			getPendingRequestsCount(),
		]);
		return { unread, pending };
	},
	component: TeacherShell,
});

function TeacherShell() {
	const { t } = useI18n();
	const { unread, pending } = Route.useLoaderData();
	const tabs = [
		// Students + the requests waiting on the teacher (badge = pending count).
		{
			to: "/teacher",
			icon: <Users size={22} />,
			label: t("nav.myStudents"),
			badge: pending,
		},
		// The teacher's own learning (same screens as a student's Home/Progress).
		{
			to: "/teacher/home",
			icon: <Home size={22} />,
			label: t("nav.asStudent"),
		},
		{
			to: "/teacher/progress",
			icon: <BarChart3 size={22} />,
			label: t("nav.myProgress"),
		},
		{
			to: "/teacher/leaderboard",
			icon: <Trophy size={22} />,
			label: t("nav.leaderboard"),
		},
		{
			to: "/teacher/notifications",
			icon: <Bell size={22} />,
			label: t("nav.notifications"),
			badge: unread,
		},
		{
			to: "/teacher/settings",
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
