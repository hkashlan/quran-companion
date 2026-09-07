import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useEffect } from "react";
import { InstallPrompt } from "@/components/InstallPrompt";
import { NotificationPrompt } from "@/components/NotificationPrompt";
import { autoEnablePush } from "@/lib/firebase-push";
import { registerNativePush } from "@/lib/native-push";
import { getSession } from "@/server/session";

/** Layout guard — every route nested under `_protected` requires a session. */
export const Route = createFileRoute("/_protected")({
	beforeLoad: async () => {
		const session = await getSession();
		if (!session) throw redirect({ to: "/login" });
		return { session };
	},
	component: ProtectedLayout,
});

function ProtectedLayout() {
	// Refresh the push token when permission was already granted. Neither call
	// prompts — an undecided user is asked by NotificationPrompt instead.
	useEffect(() => {
		void registerNativePush({ prompt: false });
		void autoEnablePush();
	}, []);
	return (
		<>
			<Outlet />
			<NotificationPrompt />
			<InstallPrompt />
		</>
	);
}
