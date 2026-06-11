import { auth } from "@/lib/auth";
import { createServerFileRoute } from "@tanstack/react-start/server";

/** Catch-all that hands every /api/auth/* request to the better-auth handler. */
export const ServerRoute = createServerFileRoute("/api/auth/$").methods({
	GET: ({ request }) => auth.handler(request),
	POST: ({ request }) => auth.handler(request),
});
