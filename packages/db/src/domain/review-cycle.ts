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

export type LastReviewEnd = { endSurahNumber: number | null; surahNumber: number; verseTo: number } | null;

/**
 * Where the next review starts, wrapping back to the plan start when the
 * previous review reached (or passed) the plan end (review_cycles.py::_next_start_position).
 */
export function nextStartPosition(plan: PlanLike, prev: LastReviewEnd): VersePosition {
	const planStart: VersePosition = { surah: plan.startSurahNumber, verse: plan.startVerse };
	const planEnd: VersePosition = { surah: plan.endSurahNumber, verse: plan.endVerse };
	if (prev === null) return planStart;

	const prevEnd: VersePosition = { surah: prev.endSurahNumber ?? prev.surahNumber, verse: prev.verseTo };
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
	const end = advanceWithinPlan(
		start,
		Math.max(1, plan.dailyAmount),
		{ surah: plan.endSurahNumber, verse: plan.endVerse },
	);
	return { start, end };
}
