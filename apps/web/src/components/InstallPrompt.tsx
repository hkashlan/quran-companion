import { useEffect, useState, useSyncExternalStore } from "react";

import {
	getDeferredPrompt,
	isStandalone,
	promptInstall,
	subscribeInstall,
} from "@/lib/install";
import { useI18n } from "@/lib/i18n";
import { isIosNeedingInstall } from "@/lib/push-client";

/**
 * Dismissible "install this app" banner. Shows an Install button on
 * Chrome/Android/desktop (fires the native prompt) and manual "Add to Home
 * Screen" guidance on iOS Safari. Hidden when already installed.
 *
 * Dismissing only hides the banner for the current session — as long as the
 * app isn't installed, it reappears on the next load so users keep getting
 * nudged to install.
 */
export function InstallPrompt() {
	const { t } = useI18n();
	// Re-render when a deferred prompt becomes available (or is consumed).
	const deferred = useSyncExternalStore(
		subscribeInstall,
		getDeferredPrompt,
		() => null,
	);

	// Start hidden so server and first client render agree (no hydration
	// mismatch); the effect reveals it once we can read the client environment.
	const [dismissed, setDismissed] = useState(true);
	const [ios, setIos] = useState(false);

	useEffect(() => {
		setDismissed(false);
		setIos(isIosNeedingInstall());
	}, []);

	if (dismissed || isStandalone()) return null;
	// Show when we have a native prompt (Android/desktop) or on iOS Safari.
	if (!deferred && !ios) return null;

	const dismiss = () => {
		setDismissed(true);
	};

	const install = async () => {
		const accepted = await promptInstall();
		if (accepted) dismiss();
	};

	return (
		<div
			className="fixed inset-x-0 bottom-0 z-50 p-3"
			style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
		>
			<div className="mx-auto flex max-w-md items-center gap-3 rounded-xl border border-border bg-surface p-3 shadow-lg">
				<img
					src="/icons/icon-192.png"
					alt=""
					className="h-10 w-10 shrink-0 rounded-lg"
				/>
				<div className="min-w-0 flex-1">
					<p className="text-[14px] font-bold text-text">
						{t("install.title")}
					</p>
					<p className="text-[12px] leading-relaxed text-text-secondary">
						{deferred ? t("install.body") : t("install.iosHint")}
					</p>
				</div>
				{deferred ? (
					<button
						type="button"
						onClick={install}
						className="shrink-0 rounded-md bg-primary px-4 py-2 text-[13px] font-semibold text-white active:scale-[0.98]"
					>
						{t("install.cta")}
					</button>
				) : null}
				<button
					type="button"
					onClick={dismiss}
					aria-label={t("install.dismiss")}
					className="shrink-0 px-2 text-[18px] text-text-light"
				>
					✕
				</button>
			</div>
		</div>
	);
}
