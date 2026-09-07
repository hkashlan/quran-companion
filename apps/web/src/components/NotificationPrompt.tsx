import { useEffect, useState, useSyncExternalStore } from "react";

import { enableFirebasePush } from "@/lib/firebase-push";
import { useI18n } from "@/lib/i18n";
import {
	getDeferredPrompt,
	isStandalone,
	subscribeInstall,
} from "@/lib/install";
import { registerNativePush } from "@/lib/native-push";
import { isIosNeedingInstall } from "@/lib/push-client";
import { getPushPermission, isNativeShell } from "@/lib/push-permission";

const DISMISS_KEY = "notif-prompt-dismissed";

/**
 * Asks — rather than silently prompts — when a logged-in user hasn't granted
 * notification permission yet. Checked on app start; the OS/browser dialog only
 * opens after the user taps Enable, which is both friendlier and avoids the
 * permanent "denied" a cold, out-of-context prompt tends to earn.
 *
 * Hidden when permission is already granted, when notifications aren't
 * supported, and when it was dismissed earlier in this browser session.
 */
export function NotificationPrompt() {
	const { t } = useI18n();
	const [show, setShow] = useState(false);
	const [native, setNative] = useState(false);
	const [busy, setBusy] = useState(false);
	// "denied" once the user turns us down at the OS/browser level.
	const [result, setResult] = useState<"denied" | null>(null);

	// The install banner is also pinned to the bottom — stack above it.
	const deferred = useSyncExternalStore(
		subscribeInstall,
		getDeferredPrompt,
		() => null,
	);
	const [installVisible, setInstallVisible] = useState(false);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			if (sessionStorage.getItem(DISMISS_KEY)) return;
			const permission = await getPushPermission();
			if (cancelled) return;
			// "denied" can't be re-prompted from the page — nagging is pointless.
			if (permission !== "prompt") return;
			setNative(await isNativeShell());
			if (!cancelled) setShow(true);
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		setInstallVisible(!isStandalone() && (!!deferred || isIosNeedingInstall()));
	}, [deferred]);

	if (!show) return null;

	const dismiss = () => {
		sessionStorage.setItem(DISMISS_KEY, "1");
		setShow(false);
	};

	const enable = async () => {
		setBusy(true);
		try {
			const ok = native
				? (await registerNativePush()) === "registered"
				: (await enableFirebasePush()) === "subscribed";
			if (ok) {
				sessionStorage.setItem(DISMISS_KEY, "1");
				setShow(false);
			} else {
				setResult("denied");
			}
		} finally {
			setBusy(false);
		}
	};

	return (
		<div
			className="fixed inset-x-0 z-50 p-3"
			style={{
				bottom: installVisible ? "calc(env(safe-area-inset-bottom) + 92px)" : 0,
				paddingBottom: installVisible
					? "12px"
					: "calc(env(safe-area-inset-bottom) + 12px)",
			}}
		>
			<div className="mx-auto flex max-w-md items-center gap-3 rounded-xl border border-border bg-surface p-3 shadow-lg">
				<div className="min-w-0 flex-1">
					<p className="text-[14px] font-bold text-text">
						{t("notifPrompt.title")}
					</p>
					<p className="text-[12px] leading-relaxed text-text-secondary">
						{result === "denied" ? t("push.denied") : t("notifPrompt.body")}
					</p>
				</div>
				{result === "denied" ? null : (
					<button
						type="button"
						onClick={enable}
						disabled={busy}
						className="shrink-0 rounded-md bg-primary px-4 py-2 text-[13px] font-semibold text-white active:scale-[0.98] disabled:opacity-60"
					>
						{t("notifPrompt.cta")}
					</button>
				)}
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
