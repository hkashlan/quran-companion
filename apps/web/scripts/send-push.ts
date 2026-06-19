/**
 * Dev helper: send a Web Push (and/or FCM) notification to a user's devices.
 *
 *   pnpm push student@x.com                         # default title/body
 *   pnpm push student@x.com "Title" "Body text"     # custom message
 *
 * Requires VAPID_* in the monorepo-root .env (loaded via --env-file) and at
 * least one active push subscription for the user — subscribe first by clicking
 * "Enable notifications" in the app's settings while running `pnpm dev`.
 */
import { db } from "@quran/db/db";
import { user } from "@quran/db/tables/auth.drizzle";
import { eq } from "drizzle-orm";

import { sendPush } from "../src/server/push.ts";

const [email, title, body] = process.argv.slice(2);

if (!email || !email.includes("@")) {
	console.error('Usage: pnpm push <email> ["title"] ["body"]');
	process.exit(1);
}

async function main() {
	const [u] = await db
		.select({ id: user.id })
		.from(user)
		.where(eq(user.email, email))
		.limit(1);
	if (!u) {
		console.error(`No user with email ${email}`);
		process.exit(1);
	}

	const result = await sendPush(u.id, {
		title: title ?? "Test notification",
		body: body ?? "Hello from send-push 👋",
		data: { url: "/" },
	});
	console.log(`Push to ${email}:`, result);
}

main().then(() => process.exit(0));
