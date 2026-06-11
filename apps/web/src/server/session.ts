import { auth } from "@/lib/auth";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

/** Reads the current better-auth session on the server (null if signed out). */
export const getSession = createServerFn({ method: "GET" }).handler(async () => {
	const headers = getRequestHeaders();
	const session = await auth.api.getSession({ headers });
	return session;
});
