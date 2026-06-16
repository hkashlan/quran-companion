import { useMemo, useState } from "react";
import { BarChart, type Point } from "@/components/Chart";
import { Card, StatCard } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { reviewRange } from "@/lib/review-range";

type ReviewRow = {
	id: string;
	surahName: string | null;
	verseFrom: number | null;
	verseTo: number | null;
	rangeMode: string;
	startPage: number | null;
	endPage: number | null;
	assignedDate: string;
	status: string;
	pointsEarned: number;
};
type SessionRow = {
	id: string;
	memorizedSurah: string;
	memorizedVerseFrom: number;
	memorizedVerseTo: number;
	sessionDate: string;
	evaluation: string | null;
};

type Tab = "reviews" | "sessions";
type Metric = "points" | "completed" | "onTime";

function seriesFor(reviews: ReviewRow[], metric: Metric): Point[] {
	const byDay = new Map<string, number>();
	for (const r of reviews) {
		const prev = byDay.get(r.assignedDate) ?? 0;
		let add = 0;
		if (metric === "points") add = r.pointsEarned;
		else if (metric === "completed") add = r.status === "completed" ? 1 : 0;
		else add = r.status === "completed" && r.pointsEarned === 10 ? 1 : 0;
		byDay.set(r.assignedDate, prev + add);
	}
	return [...byDay.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.slice(-14)
		.map(([label, value]) => ({ label: label.slice(5), value }));
}

/** Reviews/Sessions progress: metric chips → chart series + history list. */
export function ReviewProgress({
	reviews,
	sessions,
	points,
	streak,
}: {
	reviews: ReviewRow[];
	sessions: SessionRow[];
	points: number;
	streak: number;
}) {
	const { t } = useI18n();
	const [tab, setTab] = useState<Tab>("reviews");
	const [metric, setMetric] = useState<Metric>("points");

	const completed = reviews.filter((r) => r.status === "completed").length;
	const onTime = reviews.filter(
		(r) => r.status === "completed" && r.pointsEarned === 10,
	).length;
	const onTimeRate = completed > 0 ? Math.round((onTime / completed) * 100) : 0;
	const series = useMemo(() => seriesFor(reviews, metric), [reviews, metric]);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex gap-2">
				{(["reviews", "sessions"] as Tab[]).map((tb) => (
					<button
						type="button"
						key={tb}
						onClick={() => setTab(tb)}
						className={`flex-1 rounded-md border py-2.5 text-[13px] font-semibold ${
							tab === tb
								? "border-primary bg-primary-light text-primary"
								: "border-border bg-surface text-text-secondary"
						}`}
					>
						{t(`progress.${tb}`)}
					</button>
				))}
			</div>

			{tab === "reviews" ? (
				<>
					<div className="flex gap-2">
						<StatCard
							value={points}
							label={t("progress.points")}
							tone="primary"
							onClick={() => setMetric("points")}
						/>
						<StatCard
							value={completed}
							label={t("progress.completed")}
							tone="success"
							onClick={() => setMetric("completed")}
						/>
						<StatCard
							value={`${onTimeRate}%`}
							label={t("progress.onTime")}
							tone="warning"
							onClick={() => setMetric("onTime")}
						/>
						<StatCard
							value={streak}
							label={t("progress.streak")}
							tone="secondary"
						/>
					</div>
					<Card>
						<span className="mb-1 block text-[12px] font-semibold text-text-secondary">
							{t(`progress.${metric}`)}
						</span>
						{series.length > 0 ? (
							<BarChart points={series} />
						) : (
							<p className="py-8 text-center text-[13px] text-text-secondary">
								{t("progress.noData")}
							</p>
						)}
					</Card>
					<div className="flex flex-col gap-2">
						{reviews.length === 0 ? (
							<p className="py-8 text-center text-[13px] text-text-secondary">
								{t("progress.noData")}
							</p>
						) : (
							[...reviews].reverse().map((r) => (
								<div
									key={r.id}
									className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-[12px]"
								>
									<span
										className={`h-2 w-2 rounded-full ${r.status === "completed" ? "bg-success" : r.status === "missed" ? "bg-error" : "bg-text-light"}`}
									/>
									<span className="flex-1 font-semibold text-text">
										{reviewRange(r)}
									</span>
									<span className="text-text-light">{r.assignedDate}</span>
									{r.pointsEarned !== 0 ? (
										<span
											className={`font-bold ${r.pointsEarned > 0 ? "text-success" : "text-error"}`}
										>
											{r.pointsEarned > 0 ? "+" : ""}
											{r.pointsEarned}
										</span>
									) : null}
								</div>
							))
						)}
					</div>
				</>
			) : (
				<div className="flex flex-col gap-2">
					<div className="flex gap-2">
						<StatCard
							value={sessions.length}
							label={t("progress.sessionCount")}
							tone="secondary"
						/>
					</div>
					{sessions.length === 0 ? (
						<p className="py-8 text-center text-[13px] text-text-secondary">
							{t("progress.noData")}
						</p>
					) : (
						[...sessions].reverse().map((s) => (
							<div
								key={s.id}
								className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-[12px]"
							>
								<span className="h-2 w-2 rounded-full bg-accent" />
								<span className="flex-1 font-semibold text-text">
									{s.memorizedSurah}: {s.memorizedVerseFrom}–
									{s.memorizedVerseTo}
								</span>
								<span className="text-text-light">{s.sessionDate}</span>
								{s.evaluation ? (
									<span className="rounded bg-accent-light px-1.5 py-0.5 text-[10px] font-bold text-[#9A7A2E]">
										{t(`eval.${s.evaluation}`)}
									</span>
								) : null}
							</div>
						))
					)}
				</div>
			)}
		</div>
	);
}
