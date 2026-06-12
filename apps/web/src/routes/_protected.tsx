import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useEffect } from "react";
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
	// On the Capacitor native shell this registers FCM push; on web it no-ops.
	useEffect(() => {
		void registerNativePush();
	}, []);
	return <Outlet />;
}
