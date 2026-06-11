import { getSession } from "@/server/session";
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

/** Layout guard — every route nested under `_protected` requires a session. */
export const Route = createFileRoute("/_protected")({
	beforeLoad: async () => {
		const session = await getSession();
		if (!session) throw redirect({ to: "/login" });
		return { session };
	},
	component: () => <Outlet />,
});
