import { MUSHAF_PAGES } from "@quran/db/domain/review-cycle";
import { getSurahNameForPage } from "@quran/db/domain/surahs";
import {
	createFileRoute,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { NumberPicker } from "@/components/pickers";
import { Button, Card } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { reviewRange } from "@/lib/review-range";
import { getSubmitReviewData, submitReview } from "@/server/queries";

export const Route = createFileRoute("/_protected/submit-review")({
	validateSearch: (s: Record<string, unknown>) => ({
		reviewId: String(s.reviewId ?? ""),
	}),
	loaderDeps: ({ search }) => ({ reviewId: search.reviewId }),
	loader: async ({ deps }) =>
		getSubmitReviewData({ data: { reviewId: deps.reviewId } }),
	component: SubmitReview,
});

function SubmitReview() {
	const { t } = useI18n();
	const navigate = useNavigate();
	const router = useRouter();
	const { reviewId } = Route.useSearch();
	const { review } = Route.useLoaderData();

	const dayStart = review?.startPage ?? 1;
	const dayEnd = review?.endPage ?? dayStart;

	const [currentPage, setCurrentPage] = useState(
		Math.max(review?.progressPage ?? dayEnd, dayEnd),
	);
	const [saving, setSaving] = useState(false);
	const [done, setDone] = useState(false);
	const [savedMsg, setSavedMsg] = useState(false);

	if (!review) {
		return <div className="p-6 text-center text-text-secondary">—</div>;
	}

	const assigned = reviewRange(review);

	async function save() {
		setSaving(true);
		setSavedMsg(false);
		const res = await submitReview({
			data: { reviewId, currentPage },
		});
		setSaving(false);
		if (!res.ok) return;
		if (res.targetMet) {
			setDone(true);
			setTimeout(() => navigate({ to: "/student" }), 900);
		} else {
			// Partial save: stay so the student can keep going; refresh progress.
			setSavedMsg(true);
			router.invalidate();
		}
	}

	return (
		<div className="mx-auto flex min-h-screen max-w-md flex-col gap-3 bg-background p-4">
			<header className="flex items-center gap-2 pb-2">
				<button
					type="button"
					onClick={() => navigate({ to: "/student" })}
					className="text-text-secondary"
				>
					<ChevronRight size={24} />
				</button>
				<h1 className="text-[20px] font-bold text-text">{t("submit.title")}</h1>
			</header>

			<Card className="flex flex-col gap-1">
				<span className="text-[12px] text-text-secondary">
					{t("submit.assigned")}
				</span>
				<span className="text-[15px] font-bold text-primary">{assigned}</span>
			</Card>

			<NumberPicker
				label={t("submit.currentPage")}
				value={currentPage}
				min={dayStart}
				max={MUSHAF_PAGES}
				onChange={setCurrentPage}
			/>
			<p className="px-1 text-[13px] font-semibold text-primary">
				{getSurahNameForPage(currentPage, "ar")}
			</p>
			<p className="px-1 text-[12px] text-text-secondary">
				{t("submit.pagesHint", {
					from: dayStart,
					to: dayEnd,
					reached: review.progressPage ?? "—",
				})}
			</p>
			{savedMsg ? (
				<p className="rounded-md bg-primary-light p-2 text-center text-[13px] font-semibold text-primary">
					{t("submit.savedKeepGoing")}
				</p>
			) : null}

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
