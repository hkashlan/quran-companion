import { useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button, ConfirmDialog, TextInput } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import {
	excuseDayFn,
	getExcuseStatus,
	removeExcuseDay,
} from "@/server/queries";

type Status = Awaited<ReturnType<typeof getExcuseStatus>>;

const ERROR_KEY: Record<string, string> = {
	future: "excuse.error.future",
	too_old: "excuse.error.tooOld",
	no_balance: "excuse.error.noBalance",
	already_excused: "excuse.error.already",
	not_found: "excuse.error.already",
};

/**
 * "Excuse today" — the escape valve that keeps a long streak from dying to a
 * trip or an illness. An excused day neither breaks the streak nor advances it,
 * and earns nothing; the pages stay owed.
 *
 * Fetched on mount rather than folded into the home payload: most students never
 * open this, and the balance is only meaningful at the moment they do.
 */
export function ExcuseDayButton({ date }: { date: string }) {
	const { t } = useI18n();
	const router = useRouter();
	const [status, setStatus] = useState<Status | null>(null);
	const [asking, setAsking] = useState(false);
	const [reason, setReason] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const load = () => getExcuseStatus().then(setStatus);
	useEffect(() => {
		let alive = true;
		getExcuseStatus().then((s) => {
			if (alive) setStatus(s);
		});
		return () => {
			alive = false;
		};
	}, []);

	if (!status) return null;

	const excused = status.days.some((d) => d.date === date);

	const submit = async () => {
		setBusy(true);
		setError(null);
		try {
			const res = await excuseDayFn({
				data: { date, reason: reason.trim() || undefined },
			});
			setAsking(false);
			if (res.ok) {
				setReason("");
				await load();
				router.invalidate();
			} else {
				setError(t(ERROR_KEY[res.error] ?? "excuse.error.already"));
			}
		} finally {
			setBusy(false);
		}
	};

	const undo = async () => {
		setBusy(true);
		setError(null);
		try {
			const res = await removeExcuseDay({ data: { date } });
			if (res.ok) {
				await load();
				router.invalidate();
			} else {
				setError(t(ERROR_KEY[res.error] ?? "excuse.error.already"));
			}
		} finally {
			setBusy(false);
		}
	};

	if (excused)
		return (
			<div className="flex items-center justify-between gap-2 text-[12px]">
				<span className="font-semibold text-text-secondary">
					{t("excuse.todayExcused")}
				</span>
				<button
					type="button"
					onClick={undo}
					disabled={busy}
					className="font-semibold text-primary"
				>
					{t("excuse.remove")}
				</button>
			</div>
		);

	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-center justify-between gap-2">
				<span className="text-[11px] text-text-light">
					{t("excuse.balance", {
						remaining: String(status.remaining),
						allowed: String(status.allowed),
					})}
				</span>
				<Button
					variant="ghost"
					className="h-8 w-auto px-2 text-[12px]"
					disabled={status.remaining <= 0}
					onClick={() => setAsking(true)}
				>
					{t("excuse.button")}
				</Button>
			</div>
			{error ? <p className="text-[11px] text-error">{error}</p> : null}

			<ConfirmDialog
				open={asking}
				message={t("excuse.confirm", { date })}
				confirmLabel={t("excuse.button")}
				cancelLabel={t("common.cancel")}
				loading={busy}
				destructive={false}
				onConfirm={submit}
				onCancel={() => setAsking(false)}
			>
				<TextInput
					value={reason}
					onChange={(e) => setReason(e.target.value)}
					placeholder={t("excuse.reason")}
				/>
			</ConfirmDialog>
		</div>
	);
}
