import { subscribeNativePush } from "@/server/subscribe-push";

/**
 * Native push registration for the Capacitor shell. No-ops on the web (where the
 * Web Push flow in push-client.ts is used instead). Call once after login.
 *
 * Dynamically imports the Capacitor plugins so the web bundle never pulls them
 * in; they only resolve inside the native runtime.
 *
 * `prompt` decides whether the OS permission dialog may be shown: app start
 * passes `false` so an undecided user is asked by our own banner first (see
 * components/NotificationPrompt.tsx), and only that banner prompts for real.
 */
export async function registerNativePush({
	prompt = true,
}: {
	prompt?: boolean;
} = {}): Promise<"registered" | "web" | "denied" | "error"> {
	try {
		const { Capacitor } = await import("@capacitor/core");
		if (!Capacitor.isNativePlatform()) return "web";

		const { PushNotifications } = await import("@capacitor/push-notifications");
		const current = await PushNotifications.checkPermissions();
		if (current.receive !== "granted") {
			if (!prompt) return "denied";
			const perm = await PushNotifications.requestPermissions();
			if (perm.receive !== "granted") return "denied";
		}

		await PushNotifications.register();
		PushNotifications.addListener("registration", async (token) => {
			const platform = Capacitor.getPlatform(); // "ios" | "android"
			await subscribeNativePush({
				data: { token: token.value, kind: "fcm", platform },
			});
		});
		return "registered";
	} catch {
		return "error";
	}
}
