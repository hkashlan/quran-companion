import { auth } from "@/lib/auth";
import { createFileRoute } from "@tanstack/react-router";

/** Catch-all that hands every /api/auth/* request to the better-auth handler. */
export const Route = createFileRoute("/api/auth/$")({
	server: {
		handlers: {
			GET: ({ request }) => auth.handler(request),
			POST: ({ request }) => auth.handler(request),
		},
	},
});
