import { describe, expect, it } from "vitest";

import {
	advanceWithinPlan,
	comparePositions,
	isStartAdvance,
	lastReachedPage,
	MUSHAF_PAGES,
	nextPageWindow,
	nextPosition,
	nextReviewWindow,
	nextStartPosition,
} from "./review-cycle.ts";
import {
	applyPoints,
	calculatePoints,
	isConsecutive,
	nextStreak,
} from "./scoring.ts";

describe("scoring.calculatePoints", () => {
	it("awards 10 on time, 5 one day late, 0 two days late", () => {
		expect(calculatePoints("2026-06-12", "2026-06-12")).toEqual([10, 0]);
		expect(calculatePoints("2026-06-11", "2026-06-12")).toEqual([5, 1]);
		expect(calculatePoints("2026-06-10", "2026-06-12")).toEqual([0, 2]);
	});
	it("penalises -5 per extra day beyond 2", () => {
		expect(calculatePoints("2026-06-09", "2026-06-12")).toEqual([-5, 3]);
		expect(calculatePoints("2026-06-08", "2026-06-12")).toEqual([-10, 4]);
	});
	it("treats early completion as on time", () => {
		expect(calculatePoints("2026-06-13", "2026-06-12")).toEqual([10, -1]);
	});
});

describe("scoring.nextStreak / applyPoints / isConsecutive", () => {
	it("increments on consecutive day, resets on gap, no-op same day", () => {
		expect(nextStreak(3, "2026-06-11", "2026-06-12")).toBe(4); // next day
		expect(nextStreak(3, "2026-06-12", "2026-06-12")).toBe(3); // same day
		expect(nextStreak(3, "2026-06-09", "2026-06-12")).toBe(1); // gap
		expect(nextStreak(0, null, "2026-06-12")).toBe(1); // first ever
	});
	it("clamps points at zero", () => {
		expect(applyPoints(3, -10)).toBe(0);
		expect(applyPoints(3, 10)).toBe(13);
	});
	it("isConsecutive needs a prior date and diff<=1", () => {
		expect(isConsecutive(null, 0)).toBe(false);
		expect(isConsecutive("2026-06-11", 1)).toBe(true);
		expect(isConsecutive("2026-06-11", 2)).toBe(false);
	});
});

describe("review-cycle verse math", () => {
	it("compares and advances positions, rolling surahs", () => {
		expect(
			comparePositions({ surah: 1, verse: 7 }, { surah: 2, verse: 1 }),
		).toBe(-1);
		// Al-Fatiha has 7 verses → next after 1:7 is 2:1
		expect(nextPosition({ surah: 1, verse: 7 })).toEqual({
			surah: 2,
			verse: 1,
		});
		expect(nextPosition({ surah: 1, verse: 3 })).toEqual({
			surah: 1,
			verse: 4,
		});
	});

	it("advanceWithinPlan walks N verses, clamped to plan end", () => {
		// start 1:1, 5 verses → 1:5
		expect(
			advanceWithinPlan({ surah: 1, verse: 1 }, 5, { surah: 2, verse: 100 }),
		).toEqual({
			surah: 1,
			verse: 5,
		});
		// crossing surah boundary: 1:1 + 10 verses → 1:7 then 2:1,2,3 → 2:3
		expect(
			advanceWithinPlan({ surah: 1, verse: 1 }, 10, { surah: 2, verse: 286 }),
		).toEqual({
			surah: 2,
			verse: 3,
		});
		// clamp at plan end
		expect(
			advanceWithinPlan({ surah: 1, verse: 5 }, 100, { surah: 1, verse: 7 }),
		).toEqual({
			surah: 1,
			verse: 7,
		});
	});

	const plan = {
		startSurahNumber: 1,
		startVerse: 1,
		endSurahNumber: 2,
		endVerse: 20,
		dailyAmount: 10,
	};

	it("starts at plan start with no previous review", () => {
		expect(nextStartPosition(plan, null)).toEqual({ surah: 1, verse: 1 });
		expect(nextReviewWindow(plan, null)).toEqual({
			start: { surah: 1, verse: 1 },
			end: { surah: 2, verse: 3 },
		});
	});

	it("advances from previous review end", () => {
		const prev = { endSurahNumber: 2, surahNumber: 1, verseTo: 3 };
		expect(nextStartPosition(plan, prev)).toEqual({ surah: 2, verse: 4 });
	});

	it("wraps to plan start once the plan end is reached", () => {
		const prev = { endSurahNumber: 2, surahNumber: 2, verseTo: 20 };
		expect(nextStartPosition(plan, prev)).toEqual({ surah: 1, verse: 1 });
	});
});

describe("review-cycle page cursor", () => {
	const plan = { startPage: 100, dailyAmount: 10 };

	it("starts at the plan start page with no previous review", () => {
		expect(nextPageWindow(plan, null)).toEqual({
			startPage: 100,
			endPage: 109,
		});
	});

	it("advances from the previous review's end page", () => {
		expect(nextPageWindow(plan, 109)).toEqual({ startPage: 110, endPage: 119 });
	});

	it("clamps the day's window at page 604", () => {
		expect(nextPageWindow(plan, 599)).toEqual({
			startPage: 600,
			endPage: MUSHAF_PAGES,
		});
	});

	it("wraps back to the start page after reaching 604", () => {
		expect(nextPageWindow(plan, MUSHAF_PAGES)).toEqual({
			startPage: 100,
			endPage: 109,
		});
	});

	it("clamps when daily amount exceeds the remaining pages", () => {
		expect(nextPageWindow({ startPage: 600, dailyAmount: 50 }, null)).toEqual({
			startPage: 600,
			endPage: MUSHAF_PAGES,
		});
	});

	it("flags a later start page as needing approval", () => {
		expect(isStartAdvance(100, 200)).toBe(true);
		expect(isStartAdvance(100, 50)).toBe(false);
		expect(isStartAdvance(100, 100)).toBe(false);
	});

	it("advances from actual progress beyond the target (overachieve)", () => {
		// target was 100–104, student reached 108 → next day 109–118
		expect(nextPageWindow({ startPage: 100, dailyAmount: 10 }, 108)).toEqual({
			startPage: 109,
			endPage: 118,
		});
	});

	it("carries a shortfall forward without skipping pages", () => {
		// window 100–109, student reached only 102 → next day 103–112
		expect(nextPageWindow({ startPage: 100, dailyAmount: 10 }, 102)).toEqual({
			startPage: 103,
			endPage: 112,
		});
	});
});

describe("review-cycle lastReachedPage", () => {
	it("prefers actual progress", () => {
		expect(lastReachedPage(108, 100, 104)).toBe(108);
		expect(lastReachedPage(102, 100, 104)).toBe(102);
	});

	it("re-issues the same window on a fully-missed day (startPage-1)", () => {
		// no progress on window 100–109 → reached 99 → nextPageWindow restarts 100–109
		expect(lastReachedPage(null, 100, 109)).toBe(99);
		expect(nextPageWindow({ startPage: 100, dailyAmount: 10 }, 99)).toEqual({
			startPage: 100,
			endPage: 109,
		});
	});

	it("falls back to endPage for verses/legacy rows", () => {
		expect(lastReachedPage(null, null, 50)).toBe(50);
	});
});
