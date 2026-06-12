import { GoogleAuth } from "google-auth-library";

/**
 * Firebase Cloud Messaging (HTTP v1) sender for Capacitor native push. Activates
 * only when FCM service-account env is present (FCM_PROJECT_ID / FCM_CLIENT_EMAIL
 * / FCM_PRIVATE_KEY); otherwise it no-ops so Web Push is unaffected.
 */
let auth: GoogleAuth | null = null;
let projectId: string | null = null;

function getAuth(): { auth: GoogleAuth; projectId: string } | null {
	const pid = process.env.FCM_PROJECT_ID;
	const clientEmail = process.env.FCM_CLIENT_EMAIL;
	// Vercel stores the key with literal \n — normalise to real newlines.
	const privateKey = process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, "\n");
	if (!pid || !clientEmail || !privateKey) return null;
	if (!auth) {
		auth = new GoogleAuth({
			credentials: { client_email: clientEmail, private_key: privateKey },
			scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
		});
		projectId = pid;
	}
	return { auth, projectId: projectId! };
}

export type FcmMessage = { title: string; body: string; data?: Record<string, unknown> };

/** Send one FCM message to a device token. Returns "ok" | "gone" | "skip" | "error". */
export async function sendFcm(token: string, msg: FcmMessage): Promise<"ok" | "gone" | "skip" | "error"> {
	const cfg = getAuth();
	if (!cfg) return "skip";
	try {
		const client = await cfg.auth.getClient();
		const accessToken = (await client.getAccessToken()).token;
		// FCM data values must be strings.
		const data: Record<string, string> = {};
		for (const [k, v] of Object.entries(msg.data ?? {})) data[k] = String(v);

		const res = await fetch(
			`https://fcm.googleapis.com/v1/projects/${cfg.projectId}/messages:send`,
			{
				method: "POST",
				headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
				body: JSON.stringify({
					message: { token, notification: { title: msg.title, body: msg.body }, data },
				}),
			},
		);
		if (res.ok) return "ok";
		// 404 UNREGISTERED / 400 invalid token → caller should deactivate it.
		if (res.status === 404 || res.status === 400) return "gone";
		return "error";
	} catch {
		return "error";
	}
}
