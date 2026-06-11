import { getSession } from "@/server/session";
import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Auth gate: send signed-out users to /login, and route signed-in users to the
 * role-appropriate home (Phase 3 builds the student/teacher tab shells).
 */
export const Route = createFileRoute("/")({
	beforeLoad: async () => {
		const session = await getSession();
		if (!session) throw redirect({ to: "/login" });
		throw redirect({ to: "/app" });
	},
});
