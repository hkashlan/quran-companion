import { createServerFileRoute } from "@tanstack/react-start/server";

/**
 * Daily scheduler — replaces the Python `procrastinate` worker +
 * `notification_scheduler`. Triggered by Vercel Cron (see apps/web/vercel.json)
 * once per day; protected by the `CRON_SECRET` bearer token.
 *
 * Phase 4 fills in the body:
 *   1. roll active review_plans → create today's `reviews`
 *   2. mark overdue reviews `missed`, recompute streaks
 *   3. queue + send circle reminders (reminder_hours_before_start) via sendPush
 *   4. write notification_deliveries (dedupe via dedupe_key)
 */
export const ServerRoute = createServerFileRoute("/api/cron/daily").methods({
	GET: async ({ request }) => {
		const secret = process.env.CRON_SECRET;
		const auth = request.headers.get("authorization");
		if (!secret || auth !== `Bearer ${secret}`) {
			return new Response("unauthorized", { status: 401 });
		}

		// TODO(Phase 4): run the scheduler pipeline.
		return Response.json({ ok: true, ranAt: new Date().toISOString(), todo: "phase-4" });
	},
});
