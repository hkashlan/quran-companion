/**
 * Review-cycle verse math — a faithful port of FastAPI `services/review_cycles.py`.
 * Pure functions over (surah, verse) positions; no DB access.
 *
 * Page-mode plans (range_mode === "pages") additionally need a mushaf page→ayah
 * map (the Python `quran_pages.page_range_to_positions`). That map is a large
 * data file not yet ported; `buildNextReview` handles the integer page window
 * here and leaves precise surah/verse backfill for when the map lands (Phase 4).
 */
import { SURAHS } from "./surahs.ts";

export const VERSES_PER_PAGE = 15;
export const LAST_SURAH_NUMBER = 114;

const VERSE_COUNTS: Record<number, number> = Object.fromEntries(
	SURAHS.map((s) => [s.number, s.verses]),
);

export type VersePosition = { surah: number; verse: number };

/** -1 if a<b, 0 if equal, 1 if a>b (review_cycles.py::compare_positions). */
export function comparePositions(a: VersePosition, b: VersePosition): number {
	if (a.surah !== b.surah) return a.surah < b.surah ? -1 : 1;
	if (a.verse !== b.verse) return a.verse < b.verse ? -1 : 1;
	return 0;
}

/** Next verse, rolling into the next surah at a surah's end. */
export function nextPosition(p: VersePosition): VersePosition {
	const limit = VERSE_COUNTS[p.surah];
	if (p.verse < limit) return { surah: p.surah, verse: p.verse + 1 };
	if (p.surah < LAST_SURAH_NUMBER) return { surah: p.surah + 1, verse: 1 };
	return p;
}

/** Advance `start` by `totalVerses`, clamped to `planEnd`. */
export function advanceWithinPlan(
	start: VersePosition,
	totalVerses: number,
	planEnd: VersePosition,
): VersePosition {
	let current = start;
	let remaining = Math.max(1, totalVerses) - 1;
	while (remaining > 0 && comparePositions(current, planEnd) < 0) {
		const next = nextPosition(current);
		if (comparePositions(next, planEnd) > 0) break;
		current = next;
		remaining -= 1;
	}
	return current;
}

export type PlanLike = {
	startSurahNumber: number;
	startVerse: number;
	endSurahNumber: number;
	endVerse: number;
	dailyAmount: number;
};

export type LastReviewEnd = {
	endSurahNumber: number | null;
	surahNumber: number | null;
	verseTo: number | null;
} | null;

/**
 * Where the next review starts, wrapping back to the plan start when the
 * previous review reached (or passed) the plan end (review_cycles.py::_next_start_position).
 */
export function nextStartPosition(
	plan: PlanLike,
	prev: LastReviewEnd,
): VersePosition {
	const planStart: VersePosition = {
		surah: plan.startSurahNumber,
		verse: plan.startVerse,
	};
	const planEnd: VersePosition = {
		surah: plan.endSurahNumber,
		verse: plan.endVerse,
	};
	// No usable previous verse position (null, or a pages-mode review) → start fresh.
	if (prev === null || prev.surahNumber === null || prev.verseTo === null)
		return planStart;

	const prevEnd: VersePosition = {
		surah: prev.endSurahNumber ?? prev.surahNumber,
		verse: prev.verseTo,
	};
	if (comparePositions(prevEnd, planEnd) >= 0) return planStart;

	const candidate = nextPosition(prevEnd);
	if (comparePositions(candidate, planEnd) > 0) return planStart;
	return candidate;
}

/**
 * Compute the start/end verse window for the next daily review from a plan and
 * the student's last review (verses mode). Mirrors create_review_from_plan.
 */
export function nextReviewWindow(
	plan: PlanLike,
	prev: LastReviewEnd,
): { start: VersePosition; end: VersePosition } {
	const start = nextStartPosition(plan, prev);
	const end = advanceWithinPlan(start, Math.max(1, plan.dailyAmount), {
		surah: plan.endSurahNumber,
		verse: plan.endVerse,
	});
	return { start, end };
}

/** Total pages in the standard Madani mushaf. */
export const MUSHAF_PAGES = 604;

export type PagePlanLike = {
	startPage: number;
	/**
	 * Last page of the plan's range. The day's window wraps back to `startPage`
	 * once this page is reached. Defaults to the full mushaf (604) when
	 * omitted/null (legacy plans that predate a configurable end page).
	 */
	endPage?: number | null;
	dailyAmount: number;
};

/**
 * Page-mode cursor: a continuous run from the plan's start page to its end page,
 * wrapping back to the start page once the end is reached. The day's window is
 * clamped at the plan's end page (it never spans the end→start boundary); the
 * next day restarts at the start page. `lastEndPage` is the end of the most
 * recent generated review for this plan, or null for the first review.
 */
export function nextPageWindow(
	plan: PagePlanLike,
	lastEndPage: number | null,
): { startPage: number; endPage: number } {
	const planEnd = plan.endPage ?? MUSHAF_PAGES;
	const start =
		lastEndPage == null || lastEndPage >= planEnd
			? plan.startPage
			: lastEndPage + 1;
	const endPage = Math.min(start + Math.max(1, plan.dailyAmount) - 1, planEnd);
	return { startPage: start, endPage };
}

/** A start-page change to a later page (skipping ahead) needs teacher approval. */
export function isStartAdvance(
	currentStartPage: number,
	proposedStartPage: number,
): boolean {
	return proposedStartPage > currentStartPage;
}

/**
 * The page the student effectively reached on a review, used to seed the next
 * day's window. Prefers actual `progressPage`; for a fully-missed day (no
 * progress) returns `startPage - 1` so the same window is re-issued rather than
 * skipped; falls back to `endPage` for verses/legacy rows.
 */
export function lastReachedPage(
	progressPage: number | null,
	startPage: number | null,
	endPage: number | null,
): number | null {
	if (progressPage != null) return progressPage;
	if (startPage != null) return startPage - 1;
	return endPage;
}
