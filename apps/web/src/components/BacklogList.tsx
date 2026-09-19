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

type PendingAction = "done" | "waive";

/**
 * The backlog, presented as one thing to answer rather than a row per missed day.
 *
 * A missed day re-issues its own page window, so a day-by-day list repeats the
 * identical sentence N times and asks the student to answer it N times — and
 * answering one leaves the others behind still advertising pages that were just
 * read, because `recalcFutureReviews` only re-anchors rows *after* the one it was
 * given. The group is the honest unit: one range, one age, one decision.
 *
 * Two exits rather than one, because the points curve makes a single action thin
 * at one end: `calculatePoints` awards 10/5 for 0–1 days late and nothing (never
 * less than nothing) from two days on. So "I did it" scores the newest row and
 * waives the rest (one reading earns points once), and is offered only while that
 * row still pays; "let it all go" is the amnesty that leaves points and the
 * completed count alone.
 * Past `BACKLOG_COLLAPSE_ALL` days the list stops being useful at all and is
 * replaced by the plan-reset invitation.
 */
export function BacklogSection({
	backlog,
	resetCardShown,
}: {
	backlog: Backlog;
	/** Whether the plan-reset card is on screen; it changes what we defer to. */
	resetCardShown?: boolean;
}) {
	const { t } = useI18n();
	const router = useRouter();
	const [expanded, setExpanded] = useState(false);
	const [pending, setPending] = useState<PendingAction | null>(null);
	const [busy, setBusy] = useState(false);

	const summary = backlog.summary;
	if (backlog.total === 0 || !summary) return null;

	if (backlog.suppressList) {
		// Past this many days the list stops being useful and the plan reset is the
		// only sane answer — which the reset card, sitting directly below, already
		// states with its own numbers. Repeating it here would be two cards in a row
		// asking for the same tap, so defer to it entirely and only put up an
		// invitation of our own when no reset card is being shown.
		if (resetCardShown) return null;
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
				<Link to="/student/plan" className="block">
					<Button variant="outline">{t("backlog.resetCta")}</Button>
				</Link>
			</Card>
		);
		return <Section title={t("backlog.title")}>{cta}</Section>;
	}

	const newest = backlog.items.find((i) => i.id === summary.newestId);
	const olderIds = summary.ids.filter((id) => id !== summary.newestId);
	// The union span, which excludes pages already covered by partial progress,
	// describes what is actually still owed better than any single row's window.
	const range = newest
		? reviewRange({
				...newest,
				startPage: summary.fromPage ?? newest.startPage,
				endPage: summary.toPage ?? newest.endPage,
			})
		: "";

	const confirm = async () => {
		setBusy(true);
		try {
			// Waive the older days first, then score the newest: the completion runs
			// last so the cursor everything re-derives from is the one it just set.
			if (pending === "waive" || olderIds.length > 0)
				await waiveReview({
					data: {
						reviewIds: pending === "waive" ? summary.ids : olderIds,
					},
				});
			if (pending === "done" && newest)
				await submitReview({
					data: {
						reviewId: newest.id,
						currentPage: summary.toPage ?? newest.endPage ?? undefined,
					},
				});
			setPending(null);
			router.invalidate();
		} finally {
			setBusy(false);
		}
	};

	const message =
		pending === "waive"
			? t("backlog.groupWaiveConfirm", {
					days: String(summary.days),
					range,
				})
			: olderIds.length > 0
				? t("backlog.groupDoneConfirm", {
						range,
						date: summary.newestDate,
						rest: String(olderIds.length),
					})
				: t("backlog.markDoneConfirm", { range, date: summary.newestDate });

	return (
		<Section title={t("backlog.title")}>
			<Card className="flex flex-col gap-3">
				<div
					className={`flex flex-col gap-1 rounded-md border-r-4 bg-background/40 px-3 py-2 ${TONE_BORDER[summary.tone]}`}
				>
					<span className="flex items-center justify-between gap-2 text-[13px]">
						<span className="font-semibold text-text">{range}</span>
						<span className="shrink-0 text-text-light">
							{t("backlog.daysLate", { days: String(summary.daysLate) })}
						</span>
					</span>
					<span className="text-[11px] text-text-secondary">
						{t("backlog.groupHint", { days: String(summary.days) })}
					</span>
				</div>

				{summary.canComplete ? (
					<Button
						variant="outline"
						className="h-10 text-[13px]"
						onClick={() => setPending("done")}
					>
						{t("backlog.markDone")}
					</Button>
				) : null}
				<Button
					variant="outline"
					className="h-10 text-[13px]"
					onClick={() => setPending("waive")}
				>
					{t(summary.days > 1 ? "backlog.waiveAll" : "backlog.waive")}
				</Button>

				{summary.days > 1 ? (
					<button
						type="button"
						onClick={() => setExpanded((v) => !v)}
						className="py-1 text-[12px] font-semibold text-primary"
					>
						{expanded
							? t("backlog.showLess")
							: t("backlog.showDays", { count: String(summary.days) })}
					</button>
				) : null}

				{expanded
					? backlog.items.map((r) => (
							<button
								key={r.id}
								type="button"
								onClick={() =>
									router.navigate({
										to: "/submit-review",
										search: { reviewId: r.id },
									})
								}
								className="flex items-center justify-between gap-2 border-border border-t pt-2 text-[12px] active:opacity-70"
							>
								<span className="text-text-secondary">{r.assignedDate}</span>
								<span className="flex items-center gap-1 text-text-light">
									{t("backlog.daysLate", { days: String(r.daysLate) })}
									<ChevronLeft size={13} />
								</span>
							</button>
						))
					: null}
			</Card>

			<ConfirmDialog
				open={pending !== null}
				message={message}
				confirmLabel={t(
					pending === "waive"
						? summary.days > 1
							? "backlog.waiveAll"
							: "backlog.waive"
						: "backlog.markDone",
				)}
				cancelLabel={t("common.cancel")}
				loading={busy}
				onConfirm={confirm}
				onCancel={() => setPending(null)}
			/>
		</Section>
	);
}
