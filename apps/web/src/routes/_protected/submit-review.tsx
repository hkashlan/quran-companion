import { Button, Card } from "@/components/ui";
import { NumberPicker, SurahPicker, surahVerseCount } from "@/components/pickers";
import { useI18n } from "@/lib/i18n";
import { getSubmitReviewData, submitReview } from "@/server/queries";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/_protected/submit-review")({
	validateSearch: (s: Record<string, unknown>) => ({ reviewId: String(s.reviewId ?? "") }),
	loaderDeps: ({ search }) => ({ reviewId: search.reviewId }),
	loader: async ({ deps }) => getSubmitReviewData({ data: { reviewId: deps.reviewId } }),
	component: SubmitReview,
});

function SubmitReview() {
	const { t } = useI18n();
	const navigate = useNavigate();
	const { reviewId } = Route.useSearch();
	const { review } = Route.useLoaderData();

	const [startSurah, setStartSurah] = useState(review?.surahNumber ?? 1);
	const [startVerse, setStartVerse] = useState(review?.verseFrom ?? 1);
	const [endSurah, setEndSurah] = useState(review?.endSurahNumber ?? review?.surahNumber ?? 1);
	const [endVerse, setEndVerse] = useState(review?.verseTo ?? 7);
	const [saving, setSaving] = useState(false);
	const [done, setDone] = useState(false);

	if (!review) {
		return <div className="p-6 text-center text-text-secondary">—</div>;
	}

	const assigned = `${review.surahName}: ${review.verseFrom}–${review.verseTo}`;

	async function save() {
		setSaving(true);
		const res = await submitReview({
			data: {
				reviewId,
				rangeMode: "verses",
				startSurahNumber: startSurah,
				startVerse,
				endSurahNumber: endSurah,
				endVerse,
			},
		});
		setSaving(false);
		if (res.ok) {
			setDone(true);
			setTimeout(() => navigate({ to: "/student" }), 900);
		}
	}

	return (
		<div className="mx-auto flex min-h-screen max-w-md flex-col gap-3 bg-background p-4">
			<header className="flex items-center gap-2 pb-2">
				<button onClick={() => navigate({ to: "/student" })} className="text-text-secondary">
					<ChevronRight size={24} />
				</button>
				<h1 className="text-[20px] font-bold text-text">{t("submit.title")}</h1>
			</header>

			<Card className="flex flex-col gap-1">
				<span className="text-[12px] text-text-secondary">{t("submit.assigned")}</span>
				<span className="text-[15px] font-bold text-primary">{assigned}</span>
			</Card>

			<span className="px-1 pt-1 text-[13px] font-semibold text-text">{t("submit.yourRange")}</span>
			<SurahPicker label={t("assign.startSurah")} value={startSurah} onChange={(s) => {
				setStartSurah(s);
				setStartVerse((v) => Math.min(v, surahVerseCount(s)));
			}} />
			<NumberPicker label={t("assign.fromVerse")} value={startVerse} min={1} max={surahVerseCount(startSurah)} onChange={setStartVerse} />
			<SurahPicker label={t("assign.endSurah")} value={endSurah} onChange={(s) => {
				setEndSurah(s);
				setEndVerse((v) => Math.min(v, surahVerseCount(s)));
			}} />
			<NumberPicker label={t("assign.toVerse")} value={endVerse} min={1} max={surahVerseCount(endSurah)} onChange={setEndVerse} />

			{done ? (
				<p className="rounded-md bg-primary-light p-3 text-center text-[14px] font-semibold text-primary">
					{t("submit.done")}
				</p>
			) : (
				<Button onClick={save} loading={saving} className="mt-2">
					{t("submit.confirm")}
				</Button>
			)}
		</div>
	);
}
