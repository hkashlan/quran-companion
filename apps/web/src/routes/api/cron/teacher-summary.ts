import { createFileRoute } from "@tanstack/react-router";
import {
	runPendingRequestsReminder,
	runTeacherSummary,
} from "@/server/scheduler";

/**
 * Teacher evening notifications — fires hourly from 16:00 to 18:00 UTC.
 * The Vercel Hobby plan only allows once-per-day crons, so this is scheduled
 * from Dokploy instead (a `dokploy-server` schedule that curls this endpoint;
 * see infra/dokploy-schedules.md). Protected by the `CRON_SECRET` bearer token,
 * same as /api/cron/daily. Each run pushes each teacher:
 *   - one notification per student who still hasn't finished today's review
 *     (re-sent each hour while the student is behind — the hour is part of the
 *     dedupe key)
 *   - a reminder of any pending join requests to their circles (deduped per day,
 *     so this only actually sends on the first run of the day)
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
				const now = new Date();
				const today = now.toISOString().slice(0, 10);
				const summary = await runTeacherSummary(today, now.getUTCHours());
				const pendingRequests = await runPendingRequestsReminder(today);
				console.log(
					`[cron/teacher-summary] ${today} ${JSON.stringify({ ...summary, pendingRequests })}`,
				);
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
