import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Requests are decided on the Students screen now. This route only survives so
 * already-sent push notifications and old links to /teacher/requests still
 * land somewhere useful.
 */
export const Route = createFileRoute("/_protected/teacher/requests")({
	beforeLoad: () => {
		throw redirect({ to: "/teacher" });
	},
});
