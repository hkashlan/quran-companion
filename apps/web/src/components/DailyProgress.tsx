import { useI18n } from "@/lib/i18n";

type ActiveReview = {
	startPage: number | null;
	endPage: number | null;
	progressPage: number | null;
};

/** Circular progress ring with the percentage in the centre. */
export function Ring({
	pct,
	size = 76,
	stroke = 8,
}: {
	pct: number;
	size?: number;
	stroke?: number;
}) {
	const r = (size - stroke) / 2;
	const c = 2 * Math.PI * r;
	const offset = c * (1 - pct);
	const fontSize = Math.max(10, Math.round(size * 0.2));
	return (
		<div className="relative shrink-0" style={{ width: size, height: size }}>
			<svg width={size} height={size} className="-rotate-90">
				<title>progress</title>
				<circle
					className="text-border"
					stroke="currentColor"
					fill="none"
					strokeWidth={stroke}
					cx={size / 2}
					cy={size / 2}
					r={r}
				/>
				<circle
					className="text-primary transition-[stroke-dashoffset] duration-500"
					stroke="currentColor"
					fill="none"
					strokeLinecap="round"
					strokeWidth={stroke}
					cx={size / 2}
					cy={size / 2}
					r={r}
					strokeDasharray={c}
					strokeDashoffset={offset}
				/>
			</svg>
			<span
				className="absolute inset-0 flex items-center justify-center font-bold text-text"
				style={{ fontSize }}
			>
				{Math.round(pct * 100)}%
			</span>
		</div>
	);
}

/** Pick a reactive emoji + motivational message from today's progress + streak. */
function mood(pct: number, targetMet: boolean, streak: number) {
	if (targetMet) return { emoji: "🎉", key: "home.motivDone" };
	if (pct >= 0.5) return { emoji: "💪", key: "home.motivAlmost" };
	if (streak >= 3) return { emoji: "🔥", key: "home.motivStreak" };
	return { emoji: "🙂", key: "home.motivStart" };
}

/**
 * Motivational summary on the active-review card: today's pages-done ring plus a
 * reactive emoji and the running streak. Falls back to just the emoji/streak when
 * the review has no page window (e.g. a verses-mode review).
 */
export function DailyProgress({
	review,
	streak,
}: {
	review: ActiveReview;
	streak: number;
}) {
	const { t } = useI18n();
	const hasPages = review.startPage != null && review.endPage != null;
	const start = review.startPage ?? 1;
	const end = review.endPage ?? start;
	const total = Math.max(1, end - start + 1);
	const done =
		hasPages && review.progressPage != null
			? Math.min(Math.max(review.progressPage - start + 1, 0), total)
			: 0;
	const pct = hasPages ? done / total : 0;
	const targetMet = hasPages && done >= total;
	const { emoji, key } = mood(pct, targetMet, streak);

	return (
		<div className="flex items-center gap-4">
			{hasPages ? <Ring pct={pct} /> : null}
			<div className="flex flex-1 flex-col gap-1">
				<div className="flex items-center gap-2">
					<span className="text-[26px] leading-none">{emoji}</span>
					<span className="text-[14px] font-bold text-text">{t(key)}</span>
				</div>
				{hasPages ? (
					<span className="text-[12px] text-text-secondary">
						{t("home.pagesOfTarget", { done, total })}
					</span>
				) : null}
				{streak > 0 ? (
					<span className="text-[12px] text-text-light">
						🔥 {t("home.streakDays", { streak })}
					</span>
				) : null}
			</div>
		</div>
	);
}
