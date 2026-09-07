/**
 * Cross-platform read of the notification permission, without ever prompting.
 * Used on app start to decide whether to nudge the user to turn notifications
 * on (see components/NotificationPrompt.tsx).
 */
export type PushPermission = "granted" | "prompt" | "denied" | "unsupported";

/** Current permission on the Capacitor shell, or null when not native. */
async function nativePermission(): Promise<PushPermission | null> {
	try {
		const { Capacitor } = await import("@capacitor/core");
		if (!Capacitor.isNativePlatform()) return null;
		const { PushNotifications } = await import("@capacitor/push-notifications");
		const { receive } = await PushNotifications.checkPermissions();
		if (receive === "granted") return "granted";
		if (receive === "denied") return "denied";
		return "prompt";
	} catch {
		// @capacitor/core unavailable on a pure web build — treat as web.
		return null;
	}
}

/** Never prompts — only reports what the platform already decided. */
export async function getPushPermission(): Promise<PushPermission> {
	if (typeof window === "undefined") return "unsupported";
	const native = await nativePermission();
	if (native) return native;
	if (!("Notification" in window)) return "unsupported";
	const p = Notification.permission;
	return p === "granted" ? "granted" : p === "denied" ? "denied" : "prompt";
}

/** True on the Capacitor native shell (push goes through registerNativePush). */
export async function isNativeShell(): Promise<boolean> {
	try {
		const { Capacitor } = await import("@capacitor/core");
		return Capacitor.isNativePlatform();
	} catch {
		return false;
	}
}
