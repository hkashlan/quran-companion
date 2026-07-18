import { createFileRoute } from "@tanstack/react-router";
import {
	runPendingRequestsReminder,
	runTeacherSummary,
} from "@/server/scheduler";

/**
 * Teacher end-of-day notifications — fires once per day at 18:00 UTC via Vercel
 * Cron (see apps/web/vercel.json); protected by the `CRON_SECRET` bearer token,
 * same as /api/cron/daily. Pushes each teacher:
 *   - a roll-up of how their students did today (finished / mid-review / not started)
 *   - a reminder of any pending join requests to their circles
 */
export const Route = createFileRoute("/api/cron/teacher-summary")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const secret = process.env.CRON_SECRET;
				const authHeader = request.headers.get("authorization");
				if (!secret || authHeader !== `Bearer ${secret}`) {
					return new Response("unauthorized", { status: 401 });
				}
				const today = new Date().toISOString().slice(0, 10);
				const summary = await runTeacherSummary(today);
				const pendingRequests = await runPendingRequestsReminder(today);
				return Response.json({
					ok: true,
					ranAt: new Date().toISOString(),
					...summary,
					pendingRequests,
				});
			},
		},
	},
});
