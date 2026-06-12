import { createFileRoute } from "@tanstack/react-router";
import { runDailyScheduler } from "@/server/scheduler";

/**
 * Daily scheduler — replaces the Python `procrastinate` worker +
 * `notification_scheduler`. Triggered by Vercel Cron (see apps/web/vercel.json)
 * once per day; protected by the `CRON_SECRET` bearer token. Rolls active review
 * plans into today's reviews, marks overdue ones missed, and notifies.
 */
export const Route = createFileRoute("/api/cron/daily")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const secret = process.env.CRON_SECRET;
				const authHeader = request.headers.get("authorization");
				if (!secret || authHeader !== `Bearer ${secret}`) {
					return new Response("unauthorized", { status: 401 });
				}
				const today = new Date().toISOString().slice(0, 10);
				const summary = await runDailyScheduler(today);
				return Response.json({
					ok: true,
					ranAt: new Date().toISOString(),
					...summary,
				});
			},
		},
	},
});
