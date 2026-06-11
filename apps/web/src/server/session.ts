import { auth } from "@/lib/auth";
import { createServerFn } from "@tanstack/react-start";
import { getWebRequest } from "@tanstack/react-start/server";

/** Reads the current better-auth session on the server (null if signed out). */
export const getSession = createServerFn({ method: "GET" }).handler(async () => {
	const request = getWebRequest();
	const session = await auth.api.getSession({ headers: request.headers });
	return session;
});
