/**
 * PWA install plumbing. Chrome/Android/desktop fire `beforeinstallprompt` once
 * the manifest + service-worker criteria are met — and it can fire before any
 * React component mounts, so we capture it at module load and let the UI trigger
 * it later. iOS/iPadOS Safari has no such event; callers fall back to manual
 * "Add to Home Screen" instructions (see isIosNeedingInstall in push-client).
 */

type BeforeInstallPromptEvent = Event & {
	prompt: () => Promise<void>;
	userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notify() {
	for (const l of listeners) l();
}

if (typeof window !== "undefined") {
	window.addEventListener("beforeinstallprompt", (e) => {
		// Stop Chrome's default mini-infobar so we can show our own UI instead.
		e.preventDefault();
		deferred = e as BeforeInstallPromptEvent;
		notify();
	});
	// Once installed, drop the saved event so the prompt hides everywhere.
	window.addEventListener("appinstalled", () => {
		deferred = null;
		notify();
	});
}

export function getDeferredPrompt(): BeforeInstallPromptEvent | null {
	return deferred;
}

/** Subscribe to availability changes; returns an unsubscribe fn. */
export function subscribeInstall(cb: () => void): () => void {
	listeners.add(cb);
	return () => {
		listeners.delete(cb);
	};
}

/** Show the native install dialog. Returns true if the user accepted. */
export async function promptInstall(): Promise<boolean> {
	if (!deferred) return false;
	await deferred.prompt();
	const { outcome } = await deferred.userChoice;
	// A prompt can only be used once — discard it either way.
	deferred = null;
	notify();
	return outcome === "accepted";
}

/** True when the app is already running as an installed PWA. */
export function isStandalone(): boolean {
	if (typeof window === "undefined") return false;
	return (
		window.matchMedia("(display-mode: standalone)").matches ||
		// biome-ignore lint/suspicious/noExplicitAny: non-standard iOS Safari flag
		(navigator as any).standalone === true
	);
}
