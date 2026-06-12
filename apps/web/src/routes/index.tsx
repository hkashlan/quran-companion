import { getSession } from "@/server/session";
import { createFileRoute, redirect } from "@tanstack/react-router";

/** Auth gate: signed-out → /login; signed-in → role-appropriate home. */
export const Route = createFileRoute("/")({
	beforeLoad: async () => {
		const session = await getSession();
		if (!session) throw redirect({ to: "/login" });
		const role = (session.user as { role?: string }).role;
		throw redirect({ to: role === "teacher" ? "/teacher" : "/student" });
	},
});
