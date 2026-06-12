import { subscribeNativePush } from "@/server/subscribe-push";

/**
 * Native push registration for the Capacitor shell. No-ops on the web (where the
 * Web Push flow in push-client.ts is used instead). Call once after login.
 *
 * Dynamically imports the Capacitor plugins so the web bundle never pulls them
 * in; they only resolve inside the native runtime.
 */
export async function registerNativePush(): Promise<"registered" | "web" | "denied" | "error"> {
	try {
		const { Capacitor } = await import("@capacitor/core");
		if (!Capacitor.isNativePlatform()) return "web";

		const { PushNotifications } = await import("@capacitor/push-notifications");
		const perm = await PushNotifications.requestPermissions();
		if (perm.receive !== "granted") return "denied";

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
