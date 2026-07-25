import {
	createStartHandler,
	defaultStreamHandler,
} from "@tanstack/react-start/server";
import { createServerEntry } from "@tanstack/react-start/server-entry";

const handler = createStartHandler(defaultStreamHandler);

/**
 * Canonical origin, taken from `BETTER_AUTH_URL` — the single base URL
 * better-auth builds absolute links from, so it is by definition the one host
 * the app should be reachable on. Unset (local dev) → no redirect.
 */
const canonicalOrigin = (() => {
	const raw = process.env.BETTER_AUTH_URL;
	if (!raw) return undefined;
	try {
		return new URL(raw).origin;
	} catch {
		console.warn(`[server] BETTER_AUTH_URL is not a valid URL: ${raw}`);
		return undefined;
	}
})();

const wwwHost = canonicalOrigin
	? `www.${new URL(canonicalOrigin).host}`
	: undefined;

/**
 * Redirects the `www.` alias to the canonical apex, preserving path and query.
 *
 * Dokploy serves both `quran-companion.de` and `www.quran-companion.de` from
 * this container (both needed so Let's Encrypt issues a cert for each), but
 * treating them as two live origins would split sessions: a better-auth cookie
 * set on the apex carries no `Domain`, so the browser never sends it to `www`.
 * One canonical host avoids that — and duplicate content — without having to
 * widen the cookie to `.quran-companion.de`.
 *
 * Only the exact `www.` alias is redirected, so localhost, LAN IPs and the
 * Capacitor server URL are left alone.
 */
function canonicalRedirect(request: Request): Response | undefined {
	if (!canonicalOrigin || !wwwHost) return undefined;
	const url = new URL(request.url);
	const forwarded = request.headers.get("x-forwarded-host")?.split(",")[0];
	const host = forwarded?.trim() || url.host;
	if (host !== wwwHost) return undefined;
	const target = new URL(url.pathname + url.search, canonicalOrigin);
	// 308 for non-idempotent methods so the client replays method + body;
	// 301 for GET/HEAD, which is the signal search engines expect.
	const status =
		request.method === "GET" || request.method === "HEAD" ? 301 : 308;
	return new Response(null, {
		status,
		headers: { location: target.toString() },
	});
}

export default createServerEntry({
	fetch: (...args) => canonicalRedirect(args[0]) ?? handler(...args),
});
