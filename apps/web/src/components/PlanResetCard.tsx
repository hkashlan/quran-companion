import { useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button, Card, ConfirmDialog, Section } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { applyPlanReset, getPlanResetPreview } from "@/server/queries";

type Preview = Awaited<ReturnType<typeof getPlanResetPreview>>;
type Loaded = Extract<Preview, { ok: true }>;
type Strategy = "distribute" | "extend" | "skip";

/**
 * The way out for a student who has fallen behind: one card, three exits, each
 * showing what it actually does before anything happens.
 *
 * Deliberately two-step — picking a strategy only expands its numeric preview;
 * a second, explicit confirm applies it. Nothing here executes on a single
 * undescribed tap, because the whole point is that the student understands the
 * trade they are making (more pages a day, a later khatmah, or skipped pages).
 *
 * The preview is fetched on mount rather than folded into the home payload, so
 * the students who have no backlog — most of them — pay nothing for it.
 */
export function PlanResetCard({ anchorId }: { anchorId?: string }) {
	const { t } = useI18n();
	const router = useRouter();
	const [data, setData] = useState<Loaded | null>(null);
	const [picked, setPicked] = useState<Strategy | null>(null);
	const [days, setDays] = useState<number | null>(null);
	const [confirming, setConfirming] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [done, setDone] = useState(false);

	useEffect(() => {
		let alive = true;
		getPlanResetPreview().then((res) => {
			if (!alive) return;
			if (res.ok) {
				setData(res);
				setDays(
					res.distribute[1]?.catchupDays ??
						res.distribute[0]?.catchupDays ??
						null,
				);
			}
		});
		return () => {
			alive = false;
		};
	}, []);

	if (done)
		return (
			<Card className="text-[13px] font-semibold text-primary">
				{t("reset.done")}
			</Card>
		);
	if (!data) return null;

	const dist =
		data.distribute.find((d) => d.catchupDays === days) ?? data.distribute[0];

	const previewText = (s: Strategy) => {
		if (s === "distribute")
			return t("reset.distributePreview", {
				daily: String(dist.dailyDuringCatchup),
				days: String(dist.catchupDays),
				base: String(dist.baseDaily),
			});
		if (s === "extend")
			return t("reset.extendPreview", {
				daily: String(data.extend.dailyAmount),
				before: data.extend.khatmahBefore,
				after: data.extend.khatmahAfter,
			});
		return t("reset.skipPreview", {
			page: String(data.skip.newStartPage),
			pages: String(data.skip.skippedPages),
		});
	};

	const apply = async () => {
		if (!picked) return;
		setBusy(true);
		setError(null);
		try {
			const res = await applyPlanReset({
				data: {
					strategy: picked,
					...(picked === "distribute" && days ? { catchupDays: days } : {}),
				},
			});
			if (res.ok) {
				setConfirming(false);
				setDone(true);
				router.invalidate();
			} else {
				setConfirming(false);
				setError(
					res.error === "pending_plan_change"
						? t("reset.error.pendingPlanChange")
						: t("reset.error.generic"),
				);
			}
		} finally {
			setBusy(false);
		}
	};

	const options: Strategy[] = ["distribute", "extend", "skip"];

	return (
		<div id={anchorId} className="scroll-mt-4">
			<Section title={t("reset.title")}>
				<Card className="flex flex-col gap-3">
					<div className="flex flex-col gap-1">
						<span className="text-[15px] font-bold text-text">
							{t("reset.backlog", {
								days: String(data.backlog.days),
								pages: String(data.backlog.pages),
							})}
						</span>
						<span className="text-[12px] text-text-secondary">
							{t("reset.intro")}
						</span>
					</div>

					{data.catchupActive ? (
						<p className="rounded-md bg-accent-light px-2 py-1 text-[12px] text-text-secondary">
							{t("reset.catchupReplaceWarning")}
						</p>
					) : null}

					<div className="flex flex-col gap-2">
						{options.map((s) => (
							<div key={s} className="flex flex-col gap-2">
								<Button
									variant={picked === s ? "primary" : "outline"}
									className="h-11 text-[14px]"
									onClick={() => setPicked(picked === s ? null : s)}
								>
									{t(`reset.${s}`)}
								</Button>

								{picked === s ? (
									<div className="flex flex-col gap-2 rounded-md bg-background px-3 py-2">
										{s === "distribute" ? (
											<div className="flex flex-col gap-1">
												<span className="text-[11px] text-text-light">
													{t("reset.catchupDays")}
												</span>
												<div className="flex gap-2">
													{data.distribute.map((d) => (
														<button
															type="button"
															key={d.catchupDays}
															onClick={() => setDays(d.catchupDays)}
															className={`rounded-full px-3 py-1 text-[12px] ${
																d.catchupDays === days
																	? "bg-primary text-white"
																	: "border border-border text-text-secondary"
															}`}
														>
															{t("reset.daysUnit", {
																days: String(d.catchupDays),
															})}
														</button>
													))}
												</div>
											</div>
										) : null}

										<p className="text-[13px] font-semibold text-text">
											{previewText(s)}
										</p>
										<Button
											className="h-10 text-[14px]"
											onClick={() => setConfirming(true)}
										>
											{t("reset.confirm")}
										</Button>
									</div>
								) : null}
							</div>
						))}
					</div>

					{error ? <p className="text-[12px] text-error">{error}</p> : null}
				</Card>

				<ConfirmDialog
					open={confirming}
					message={picked ? previewText(picked) : ""}
					confirmLabel={t("reset.confirm")}
					cancelLabel={t("common.cancel")}
					loading={busy}
					onConfirm={apply}
					onCancel={() => setConfirming(false)}
				/>
			</Section>
		</div>
	);
}
