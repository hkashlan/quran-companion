import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useEffect } from "react";
import { InstallPrompt } from "@/components/InstallPrompt";
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
	// Native shell → FCM via Capacitor; web → FCM via Firebase (on by default).
	useEffect(() => {
		void registerNativePush();
		void autoEnablePush();
	}, []);
	return (
		<>
			<Outlet />
			<InstallPrompt />
		</>
	);
}
