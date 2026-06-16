import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Clock } from "lucide-react";
import { useState } from "react";
import { Button, Card, Section } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { reviewRange } from "@/lib/review-range";
import { getStudentPlan, requestPlanChange } from "@/server/queries";

export const Route = createFileRoute("/_protected/student/plan")({
	loader: async () => getStudentPlan(),
	component: PlanEditor,
});

function PlanEditor() {
	const { t } = useI18n();
	const router = useRouter();
	const { plan, pendingChange } = Route.useLoaderData();

	const isPages = plan?.rangeMode === "pages";
	const [startPage, setStartPage] = useState(String(plan?.startPage ?? 1));
	const [daily, setDaily] = useState(String(plan?.dailyAmount ?? 1));
	const [saving, setSaving] = useState(false);
	const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

	if (!plan) {
		return (
			<div className="flex flex-col gap-4 p-4">
				<h1 className="text-[22px] font-bold text-text">{t("plan.title")}</h1>
				<Card className="text-center text-[13px] text-text-secondary">
					{t("plan.noPlan")}
				</Card>
			</div>
		);
	}

	const locked = !!pendingChange || saving;

	async function submit(field: "daily_amount" | "start_page", value: number) {
		setSaving(true);
		setMsg(null);
		const res = await requestPlanChange({
			data:
				field === "daily_amount"
					? { field, dailyAmount: value }
					: { field, startPage: value },
		});
		setSaving(false);
		if (!res.ok) {
			setMsg({
				text:
					res.error === "already_requested"
						? t("plan.pendingExists")
						: t("plan.noPlan"),
				ok: false,
			});
			return;
		}
		setMsg({
			text: res.applied
				? t("plan.appliedImmediately")
				: t("plan.awaitingApproval"),
			ok: true,
		});
		router.invalidate();
	}

	return (
		<div className="flex flex-col gap-4 p-4">
			<h1 className="text-[22px] font-bold text-text">{t("plan.title")}</h1>

			<Card className="flex flex-col gap-1">
				<span className="text-[12px] text-text-secondary">
					{t("home.activeReview")}
				</span>
				<span className="text-[15px] font-bold text-primary">
					{isPages
						? reviewRange(plan)
						: `${plan.startSurahNumber}:${plan.startVerse} – ${plan.endSurahNumber}:${plan.endVerse}`}
				</span>
				<span className="text-[12px] text-text-light">
					{plan.dailyAmount}{" "}
					{isPages ? t("assign.dailyPages") : t("assign.dailyVerses")}
				</span>
			</Card>

			{pendingChange ? (
				<Card className="flex items-center gap-2 text-[13px] text-text-light">
					<Clock size={15} /> {t("plan.awaitingApproval")}
				</Card>
			) : null}

			{msg ? (
				<p
					className={`text-[13px] font-semibold ${msg.ok ? "text-primary" : "text-error"}`}
				>
					{msg.text}
				</p>
			) : null}

			{isPages ? (
				<Section title={t("plan.editStart")}>
					<Card className="flex items-end gap-2">
						<div className="flex flex-1 flex-col gap-1">
							<span className="text-[13px] font-semibold text-text">
								{t("plan.startPage")}
							</span>
							<input
								type="number"
								min={1}
								max={604}
								value={startPage}
								disabled={locked}
								onChange={(e) => setStartPage(e.target.value)}
								className="rounded-md border border-border bg-background px-3 py-2.5 text-[15px] font-semibold text-text outline-none disabled:opacity-60"
							/>
						</div>
						<Button
							onClick={() =>
								submit(
									"start_page",
									Math.min(
										604,
										Math.max(1, Number.parseInt(startPage, 10) || 1),
									),
								)
							}
							disabled={locked}
						>
							{t("plan.save")}
						</Button>
					</Card>
				</Section>
			) : null}

			<Section title={t("plan.editDaily")}>
				<Card className="flex items-end gap-2">
					<div className="flex flex-1 flex-col gap-1">
						<span className="text-[13px] font-semibold text-text">
							{isPages ? t("assign.dailyPages") : t("assign.dailyVerses")}
						</span>
						<input
							type="number"
							min={1}
							value={daily}
							disabled={locked}
							onChange={(e) => setDaily(e.target.value)}
							className="rounded-md border border-border bg-background px-3 py-2.5 text-[15px] font-semibold text-text outline-none disabled:opacity-60"
						/>
					</div>
					<Button
						onClick={() =>
							submit(
								"daily_amount",
								Math.max(1, Number.parseInt(daily, 10) || 1),
							)
						}
						disabled={locked}
					>
						{t("plan.save")}
					</Button>
				</Card>
			</Section>
		</div>
	);
}
