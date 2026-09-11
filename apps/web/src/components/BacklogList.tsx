import { Link, useRouter } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useState } from "react";
import { Button, Card, ConfirmDialog, Section } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { reviewRange } from "@/lib/review-range";
import { submitReview, waiveReview } from "@/server/queries";
import type { StudentHomeData } from "./StudentHome";

type Backlog = StudentHomeData["backlog"];
type Item = Backlog["items"][number];

/** Left-border colour per age band: fresh enough to catch up → too old to matter. */
const TONE_BORDER: Record<Item["tone"], string> = {
	warn: "border-warning",
	alert: "border-warning-strong",
	stale: "border-text-light",
};

type PendingAction = { item: Item; kind: "done" | "waive" };

/**
 * The overdue-reviews list, collapsed and colour-graded by age.
 *
 * Two direct actions rather than one, because the points curve makes a single
 * action wrong at one end: `calculatePoints` awards 10/5 for 0–1 days late but
 * goes *negative* from three days on. So a fresh row offers "I did it" (a real,
 * scored catch-up) while an older one offers "let it go" (an amnesty that leaves
 * points and the completed count alone). Past `BACKLOG_COLLAPSE_ALL` rows the
 * list stops being useful at all and is replaced by the plan-reset invitation.
 */
export function BacklogSection({
	backlog,
	onReset,
}: {
	backlog: Backlog;
	onReset?: () => void;
}) {
	const { t } = useI18n();
	const router = useRouter();
	const [expanded, setExpanded] = useState(false);
	const [pending, setPending] = useState<PendingAction | null>(null);
	const [busy, setBusy] = useState(false);

	if (backlog.total === 0) return null;

	if (backlog.suppressList) {
		const cta = (
			<Card className="flex flex-col gap-3">
				<div className="flex flex-col gap-1">
					<span className="text-[15px] font-bold text-text">
						{t("backlog.tooMany", { count: String(backlog.total) })}
					</span>
					<span className="text-[12px] text-text-secondary">
						{t("backlog.resetCtaHint")}
					</span>
				</div>
				{onReset ? (
					<Button variant="outline" onClick={onReset}>
						{t("backlog.resetCta")}
					</Button>
				) : (
					<Link to="/student/plan" className="block">
						<Button variant="outline">{t("backlog.resetCta")}</Button>
					</Link>
				)}
			</Card>
		);
		return <Section title={t("backlog.title")}>{cta}</Section>;
	}

	const confirm = async () => {
		if (!pending) return;
		setBusy(true);
		try {
			if (pending.kind === "done") {
				await submitReview({
					data: {
						reviewId: pending.item.id,
						currentPage: pending.item.endPage ?? undefined,
					},
				});
			} else {
				await waiveReview({ data: { reviewId: pending.item.id } });
			}
			setPending(null);
			router.invalidate();
		} finally {
			setBusy(false);
		}
	};

	const rows = expanded
		? backlog.items
		: backlog.items.slice(0, backlog.visible);
	const message = pending
		? t(
				pending.kind === "done"
					? "backlog.markDoneConfirm"
					: "backlog.waiveConfirm",
				{
					range: reviewRange(pending.item),
					date: pending.item.assignedDate,
				},
			)
		: "";

	return (
		<Section title={t("backlog.title")}>
			<Card className="flex flex-col gap-2 p-3">
				{rows.map((r) => (
					<div
						key={r.id}
						className={`flex flex-col gap-2 rounded-md border-r-4 bg-background/40 px-2 py-2 ${TONE_BORDER[r.tone]}`}
					>
						<button
							type="button"
							onClick={() =>
								router.navigate({
									to: "/submit-review",
									search: { reviewId: r.id },
								})
							}
							className="flex items-center justify-between gap-2 text-[12px] active:opacity-70"
						>
							<span className="text-text">{reviewRange(r)}</span>
							<span className="flex items-center gap-1 text-text-light">
								{t("backlog.daysLate", { days: String(r.daysLate) })}
								<ChevronLeft size={13} />
							</span>
						</button>
						<Button
							variant="outline"
							className="h-9 text-[13px]"
							onClick={() =>
								setPending({
									item: r,
									kind: r.tone === "warn" ? "done" : "waive",
								})
							}
						>
							{t(r.tone === "warn" ? "backlog.markDone" : "backlog.waive")}
						</Button>
					</div>
				))}

				{backlog.hiddenCount > 0 ? (
					<button
						type="button"
						onClick={() => setExpanded((v) => !v)}
						className="py-1 text-[12px] font-semibold text-primary"
					>
						{expanded
							? t("backlog.showLess")
							: t("backlog.showMore", { count: String(backlog.hiddenCount) })}
					</button>
				) : null}
			</Card>

			<ConfirmDialog
				open={pending !== null}
				message={message}
				confirmLabel={t(
					pending?.kind === "waive" ? "backlog.waive" : "backlog.markDone",
				)}
				cancelLabel={t("common.cancel")}
				loading={busy}
				onConfirm={confirm}
				onCancel={() => setPending(null)}
			/>
		</Section>
	);
}
