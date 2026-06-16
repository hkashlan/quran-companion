import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import {
	NumberPicker,
	Segmented,
	SurahPicker,
	surahVerseCount,
} from "@/components/pickers";
import { Button } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { assignReviewPlan, getStudentModalData } from "@/server/queries";

export const Route = createFileRoute("/_protected/assign-review")({
	validateSearch: (s: Record<string, unknown>) => ({
		studentId: String(s.studentId ?? ""),
	}),
	loaderDeps: ({ search }) => ({ studentId: search.studentId }),
	loader: async ({ deps }) =>
		getStudentModalData({ data: { studentId: deps.studentId } }),
	component: AssignReview,
});

function AssignReview() {
	const { t } = useI18n();
	const navigate = useNavigate();
	const { studentId } = Route.useSearch();
	const { student, plan } = Route.useLoaderData();

	const [mode, setMode] = useState<"verses" | "pages">(
		(plan?.rangeMode as "verses" | "pages") ?? "verses",
	);
	const [startSurah, setStartSurah] = useState(plan?.startSurahNumber ?? 1);
	const [startVerse, setStartVerse] = useState(plan?.startVerse ?? 1);
	const [diffEnd, setDiffEnd] = useState(
		!!plan && plan.endSurahNumber !== plan.startSurahNumber,
	);
	const [endSurah, setEndSurah] = useState(
		plan?.endSurahNumber ?? plan?.startSurahNumber ?? 1,
	);
	const [endVerse, setEndVerse] = useState(plan?.endVerse ?? 7);
	const [startPage, setStartPage] = useState(String(plan?.startPage ?? 1));
	const [daily, setDaily] = useState(String(plan?.dailyAmount ?? 10));
	const [saving, setSaving] = useState(false);

	const effectiveEnd = diffEnd ? endSurah : startSurah;

	async function save() {
		setSaving(true);
		await assignReviewPlan({
			data:
				mode === "pages"
					? {
							studentId,
							rangeMode: "pages",
							startPage: Math.min(
								604,
								Math.max(1, Number.parseInt(startPage, 10) || 1),
							),
							dailyAmount: Math.max(1, Number.parseInt(daily, 10) || 1),
						}
					: {
							studentId,
							rangeMode: "verses",
							startSurahNumber: startSurah,
							startVerse,
							endSurahNumber: effectiveEnd,
							endVerse,
							dailyAmount: Math.max(1, Number.parseInt(daily, 10) || 1),
						},
		});
		setSaving(false);
		navigate({ to: "/teacher" });
	}

	return (
		<div className="mx-auto flex min-h-screen max-w-md flex-col gap-3 bg-background p-4">
			<header className="flex items-center gap-2 pb-2">
				<button
					type="button"
					onClick={() => navigate({ to: "/teacher" })}
					className="text-text-secondary"
				>
					<ChevronRight size={24} />
				</button>
				<h1 className="text-[20px] font-bold text-text">
					{plan ? t("assign.title") : t("assign.title")} · {student?.name ?? ""}
				</h1>
			</header>

			<Segmented
				value={mode}
				onChange={setMode}
				options={[
					{ value: "verses", label: t("assign.modeVerses") },
					{ value: "pages", label: t("assign.modePages") },
				]}
			/>

			{mode === "pages" ? (
				<div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
					<span className="text-[14px] font-semibold text-text">
						{t("assign.startPage")}
					</span>
					<input
						type="number"
						min={1}
						max={604}
						value={startPage}
						onChange={(e) => setStartPage(e.target.value)}
						className="w-24 rounded-md border border-border bg-background px-3 py-2.5 text-[15px] font-semibold text-text outline-none"
					/>
				</div>
			) : (
				<>
					<SurahPicker
						label={t("assign.startSurah")}
						value={startSurah}
						onChange={(s) => {
							setStartSurah(s);
							setStartVerse((v) => Math.min(v, surahVerseCount(s)));
						}}
					/>
					<NumberPicker
						label={t("assign.fromVerse")}
						value={startVerse}
						min={1}
						max={surahVerseCount(startSurah)}
						onChange={setStartVerse}
					/>

					<label className="flex items-center gap-2 px-1 text-[14px] text-text">
						<input
							type="checkbox"
							checked={diffEnd}
							onChange={(e) => setDiffEnd(e.target.checked)}
						/>
						{t("assign.differentEndSurah")}
					</label>

					{diffEnd ? (
						<SurahPicker
							label={t("assign.endSurah")}
							value={endSurah}
							onChange={(s) => {
								setEndSurah(s);
								setEndVerse((v) => Math.min(v, surahVerseCount(s)));
							}}
						/>
					) : null}
					<NumberPicker
						label={t("assign.toVerse")}
						value={endVerse}
						min={1}
						max={surahVerseCount(effectiveEnd)}
						onChange={setEndVerse}
					/>
				</>
			)}

			<div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
				<span className="text-[14px] font-semibold text-text">
					{t("assign.dailyAmount")}
				</span>
				<div className="flex items-center gap-2">
					<input
						type="number"
						min={1}
						value={daily}
						onChange={(e) => setDaily(e.target.value)}
						className="w-24 rounded-md border border-border bg-background px-3 py-2.5 text-[15px] font-semibold text-text outline-none"
					/>
					<span className="text-[13px] text-text-secondary">
						{mode === "pages"
							? t("assign.dailyPages")
							: t("assign.dailyVerses")}
					</span>
				</div>
			</div>

			<Button onClick={save} loading={saving} className="mt-2">
				{t("assign.save")}
			</Button>
		</div>
	);
}
