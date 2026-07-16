import { createFileRoute } from "@tanstack/react-router";
import { runTeacherSummary } from "@/server/scheduler";

/**
 * Teacher end-of-day summary — pushes each teacher a roll-up of how their
 * students did today (finished / mid-review / not started). Triggered by Vercel
 * Cron (see apps/web/vercel.json) once per day at 18:00 UTC; protected by the
 * `CRON_SECRET` bearer token, same as /api/cron/daily.
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
				return Response.json({
					ok: true,
					ranAt: new Date().toISOString(),
					...summary,
				});
			},
		},
	},
});
