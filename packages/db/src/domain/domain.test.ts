import { describe, expect, it } from "vitest";

import {
	backlogDebtPages,
	backlogTone,
	collapseBacklog,
	outstandingPageUnion,
} from "./backlog.ts";
import {
	canExcuse,
	DEFAULT_EXCUSE_DAYS_PER_MONTH,
	excuseAllowance,
	excuseBalance,
	monthKey,
} from "./excuse.ts";
import {
	addDaysStr,
	catchupExpired,
	distributePreview,
	effectiveDailyAmount,
	estimatedKhatmah,
	extendPreview,
	idealCursor,
	remainingPages,
	skipPreview,
} from "./plan-reset.ts";
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

	it("clamps the day's window at a custom plan end page", () => {
		expect(
			nextPageWindow({ startPage: 100, endPage: 110, dailyAmount: 10 }, 105),
		).toEqual({ startPage: 106, endPage: 110 });
	});

	it("wraps back to the start page after reaching a custom end page", () => {
		expect(
			nextPageWindow({ startPage: 100, endPage: 110, dailyAmount: 10 }, 110),
		).toEqual({ startPage: 100, endPage: 109 });
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

// ── backlog ──────────────────────────────────────────────────────────────────

/** Build an overdue row `daysLate` before `today`, on a fixed 100–139 window. */
function overdue(
	id: string,
	daysLate: number,
	extra: Partial<{
		startPage: number;
		endPage: number;
		progressPage: number;
	}> = {},
) {
	const d = new Date("2026-09-11T00:00:00Z");
	d.setUTCDate(d.getUTCDate() - daysLate);
	return {
		id,
		assignedDate: d.toISOString().slice(0, 10),
		rangeMode: "pages",
		startPage: 100,
		endPage: 139,
		progressPage: null as number | null,
		status: "missed",
		...extra,
	};
}

const TODAY = "2026-09-11";

describe("backlog backlogTone", () => {
	it("bands at 1-2 / 3-6 / 7+ days", () => {
		expect(backlogTone(1)).toBe("warn");
		expect(backlogTone(2)).toBe("warn");
		expect(backlogTone(3)).toBe("alert");
		expect(backlogTone(6)).toBe("alert");
		expect(backlogTone(7)).toBe("stale");
		expect(backlogTone(30)).toBe("stale");
	});
});

describe("backlog outstandingPageUnion", () => {
	it("returns one window for repeated identical missed rows (not the sum)", () => {
		const rows = [1, 2, 3, 4, 5].map((n) => overdue(`r${n}`, n));
		expect(outstandingPageUnion(rows)).toBe(40);
	});

	it("subtracts progress already made on a row", () => {
		expect(outstandingPageUnion([overdue("a", 1, { progressPage: 119 })])).toBe(
			20,
		);
	});

	it("drops rows already finished and merges distinct windows", () => {
		expect(outstandingPageUnion([overdue("a", 1, { progressPage: 139 })])).toBe(
			0,
		);
		expect(
			outstandingPageUnion([
				overdue("a", 2, { startPage: 100, endPage: 109 }),
				overdue("b", 1, { startPage: 110, endPage: 119 }),
			]),
		).toBe(20);
	});

	it("ignores verse/legacy rows with no page window", () => {
		expect(
			outstandingPageUnion([
				overdue("a", 1, { startPage: null, endPage: null } as never),
			]),
		).toBe(0);
	});
});

describe("backlog backlogDebtPages", () => {
	it("multiplies lost days by the daily amount", () => {
		expect(backlogDebtPages(3, 40)).toBe(120);
		expect(backlogDebtPages(0, 40)).toBe(0);
	});
});

describe("backlog collapseBacklog", () => {
	it("decorates newest-first and counts what sits behind the expander", () => {
		const v = collapseBacklog(
			[1, 2, 3, 4].map((n) => overdue(`r${n}`, n)),
			TODAY,
		);
		expect(v.total).toBe(4);
		expect(v.items.map((i) => i.id)).toEqual(["r1", "r2", "r3", "r4"]);
		expect(v.items.map((i) => i.daysLate)).toEqual([1, 2, 3, 4]);
		expect(v.items.map((i) => i.tone)).toEqual([
			"warn",
			"warn",
			"alert",
			"alert",
		]);
		expect(v.visible).toBe(3);
		expect(v.hiddenCount).toBe(1);
		expect(v.oldestDaysLate).toBe(4);
		expect(v.suppressList).toBe(false);
	});

	it("suppresses the list past 7 items", () => {
		const seven = collapseBacklog(
			Array.from({ length: 7 }, (_, i) => overdue(`r${i}`, i + 1)),
			TODAY,
		);
		expect(seven.suppressList).toBe(false);
		expect(seven.items).toHaveLength(7);
		expect(seven.hiddenCount).toBe(4);

		const eight = collapseBacklog(
			Array.from({ length: 8 }, (_, i) => overdue(`r${i}`, i + 1)),
			TODAY,
		);
		expect(eight.suppressList).toBe(true);
		expect(eight.items).toEqual([]);
		expect(eight.hiddenCount).toBe(8);
	});

	it("offers the reset card only past the threshold", () => {
		expect(
			collapseBacklog([overdue("a", 1), overdue("b", 2)], TODAY).showResetCard,
		).toBe(false);
		expect(
			collapseBacklog(
				[overdue("a", 1), overdue("b", 2), overdue("c", 3)],
				TODAY,
			).showResetCard,
		).toBe(true);
	});

	it("is empty and inert with no backlog", () => {
		const v = collapseBacklog([], TODAY);
		expect(v).toMatchObject({
			total: 0,
			items: [],
			hiddenCount: 0,
			oldestDaysLate: 0,
			suppressList: false,
			showResetCard: false,
		});
	});

	it("has no group summary with no backlog", () => {
		expect(collapseBacklog([], TODAY).summary).toBeNull();
	});
});

describe("backlog group summary", () => {
	it("folds identical re-issued windows into one range, not a sum", () => {
		const s = collapseBacklog(
			[1, 2, 3, 4].map((n) => overdue(`r${n}`, n)),
			TODAY,
		).summary;
		if (!s) throw new Error("expected a summary");
		expect(s.days).toBe(4);
		expect(s.pages).toBe(40);
		expect(s.fromPage).toBe(100);
		expect(s.toPage).toBe(139);
		// The newest row is the one a real catch-up completes; the rest get waived.
		expect(s.newestId).toBe("r1");
		expect(s.ids).toEqual(["r1", "r2", "r3", "r4"]);
	});

	it("takes its tone from the oldest day but its scoring from the newest", () => {
		const s = collapseBacklog(
			[overdue("new", 1), overdue("old", 6)],
			TODAY,
		).summary;
		if (!s) throw new Error("expected a summary");
		expect(s.daysLate).toBe(6);
		expect(s.tone).toBe("alert");
		expect(s.newestDaysLate).toBe(1);
		// Completing the newest row still pays, so the offer stands even though the
		// backlog as a whole is old.
		expect(s.canComplete).toBe(true);
		expect(s.oldestDate).toBe("2026-09-05");
		expect(s.newestDate).toBe("2026-09-10");
	});

	it("withdraws the complete offer once even the newest row scores negative", () => {
		const s = collapseBacklog(
			[overdue("a", 3), overdue("b", 5)],
			TODAY,
		).summary;
		if (!s) throw new Error("expected a summary");
		expect(s.newestDaysLate).toBe(3);
		expect(s.canComplete).toBe(false);
	});

	it("narrows the range to what partial progress still leaves owed", () => {
		const s = collapseBacklog(
			[overdue("a", 1, { progressPage: 119 })],
			TODAY,
		).summary;
		if (!s) throw new Error("expected a summary");
		expect(s.fromPage).toBe(120);
		expect(s.toPage).toBe(139);
		expect(s.pages).toBe(20);
	});

	it("survives verse-mode rows with no page window", () => {
		const s = collapseBacklog(
			[overdue("a", 1, { startPage: null, endPage: null } as never)],
			TODAY,
		).summary;
		if (!s) throw new Error("expected a summary");
		expect(s.fromPage).toBeNull();
		expect(s.toPage).toBeNull();
		expect(s.pages).toBe(0);
	});

	it("still summarises when the list itself is suppressed", () => {
		const v = collapseBacklog(
			Array.from({ length: 8 }, (_, i) => overdue(`r${i}`, i + 1)),
			TODAY,
		);
		expect(v.items).toEqual([]);
		expect(v.summary?.ids).toHaveLength(8);
	});
});

// ── plan-reset ───────────────────────────────────────────────────────────────

/** Student on 40 pages/day, stuck at page 461, three days missed. */
const RESET = {
	today: "2026-09-11",
	dailyAmount: 40,
	planStartPage: 1,
	planEndPage: 604,
	cursorPage: 461,
	overdueDays: 3,
};

describe("plan-reset addDaysStr / estimatedKhatmah", () => {
	it("shifts dates across a month boundary", () => {
		expect(addDaysStr("2026-09-11", 20)).toBe("2026-10-01");
		expect(addDaysStr("2026-09-11", -11)).toBe("2026-08-31");
		expect(addDaysStr("2026-09-11", 0)).toBe("2026-09-11");
	});

	it("counts today as the first reading day", () => {
		// 40 pages at 40/day finishes today, not tomorrow.
		expect(estimatedKhatmah("2026-09-11", 40, 40)).toBe("2026-09-11");
		expect(estimatedKhatmah("2026-09-11", 41, 40)).toBe("2026-09-12");
		expect(estimatedKhatmah("2026-09-11", 0, 40)).toBe("2026-09-11");
	});
});

describe("plan-reset idealCursor", () => {
	it("advances by the debt the missed days represent", () => {
		expect(idealCursor(RESET)).toBe(461 + 120);
	});

	it("clamps one past the plan end rather than wrapping", () => {
		expect(idealCursor({ ...RESET, cursorPage: 600, overdueDays: 10 })).toBe(
			605,
		);
		expect(remainingPages(605, 604)).toBe(0);
	});
});

describe("plan-reset distributePreview", () => {
	it("spreads a 120-page debt over 15 days as +8/day", () => {
		const p = distributePreview(RESET, 15);
		expect(p.extraPerDay).toBe(8);
		expect(p.dailyDuringCatchup).toBe(48);
		expect(p.baseDaily).toBe(40);
		expect(p.catchupUntil).toBe("2026-09-25");
	});

	it("rounds the extra up so the debt is fully covered", () => {
		// 120 over 7 days → 17.14 → 18/day (7×18 = 126 ≥ 120)
		const p = distributePreview(RESET, 7);
		expect(p.extraPerDay).toBe(18);
		expect(p.catchupDays * p.extraPerDay).toBeGreaterThanOrEqual(120);
	});

	it("recovers the promised khatmah date", () => {
		const p = distributePreview(RESET, 15);
		// 144 pages left from 461; ideal position would leave 24 → both finish soon,
		// and catching up never finishes later than simply extending.
		expect(p.khatmahAfter <= extendPreview(RESET).khatmahAfter).toBe(true);
	});

	it("handles a catch-up window longer than the pages remaining", () => {
		const p = distributePreview({ ...RESET, cursorPage: 600 }, 30);
		// only 5 pages left → finishes today, not in 30 days
		expect(p.khatmahAfter).toBe("2026-09-11");
	});
});

describe("plan-reset extendPreview", () => {
	it("slips the khatmah by exactly the days lost", () => {
		const p = extendPreview(RESET);
		expect(p.dailyAmount).toBe(40);
		expect(p.delayDays).toBe(3);
		expect(p.khatmahBefore < p.khatmahAfter).toBe(true);
	});
});

describe("plan-reset skipPreview", () => {
	it("jumps the cursor forward and writes off the pages in between", () => {
		const p = skipPreview(RESET);
		expect(p.newStartPage).toBe(581);
		expect(p.skippedFrom).toBe(461);
		expect(p.skippedTo).toBe(580);
		expect(p.skippedPages).toBe(120);
		// the whole point: the promised finish date is restored
		expect(p.khatmahAfter).toBe(p.khatmahBefore);
	});

	it("clamps at the plan end instead of wrapping into a new khatmah", () => {
		const p = skipPreview({ ...RESET, cursorPage: 600, overdueDays: 10 });
		expect(p.newStartPage).toBe(604);
		expect(p.skippedPages).toBe(5);
	});
});

describe("plan-reset effectiveDailyAmount / catchupExpired", () => {
	const plan = {
		dailyAmount: 40,
		catchupExtraPages: 8,
		catchupUntil: "2026-09-25",
	};

	it("adds the extra only while the window is open, inclusive of its last day", () => {
		expect(effectiveDailyAmount(plan, "2026-09-11")).toBe(48);
		expect(effectiveDailyAmount(plan, "2026-09-25")).toBe(48);
		expect(effectiveDailyAmount(plan, "2026-09-26")).toBe(40);
	});

	it("falls back to the base amount when no catch-up is set", () => {
		expect(
			effectiveDailyAmount(
				{ dailyAmount: 40, catchupExtraPages: null, catchupUntil: null },
				"2026-09-11",
			),
		).toBe(40);
	});

	it("expires only after the last catch-up day", () => {
		expect(catchupExpired(plan, "2026-09-25")).toBe(false);
		expect(catchupExpired(plan, "2026-09-26")).toBe(true);
		expect(
			catchupExpired(
				{ dailyAmount: 40, catchupExtraPages: null, catchupUntil: null },
				"2026-09-26",
			),
		).toBe(false);
	});
});

// ── excuse days ──────────────────────────────────────────────────────────────

describe("excuse monthKey / allowance / balance", () => {
	it("buckets by calendar month", () => {
		expect(monthKey("2026-09-11")).toBe("2026-09");
		expect(monthKey("2026-01-01")).toBe("2026-01");
	});

	it("takes the most generous circle, treating null as the default", () => {
		expect(excuseAllowance([null, 4, 2])).toBe(4);
		expect(excuseAllowance([null, null])).toBe(DEFAULT_EXCUSE_DAYS_PER_MONTH);
		// a student in no circle still gets the default
		expect(excuseAllowance([])).toBe(DEFAULT_EXCUSE_DAYS_PER_MONTH);
		// an explicit 0 is a real setting, not "inherit"
		expect(excuseAllowance([0])).toBe(0);
	});

	it("never reports a negative remainder", () => {
		expect(excuseBalance(2, 1)).toEqual({ allowed: 2, used: 1, remaining: 1 });
		expect(excuseBalance(2, 5)).toEqual({ allowed: 2, used: 5, remaining: 0 });
	});
});

describe("excuse canExcuse", () => {
	const TODAY = "2026-09-11";

	it("allows today and yesterday only", () => {
		expect(canExcuse("2026-09-11", TODAY, 2)).toEqual({ ok: true });
		expect(canExcuse("2026-09-10", TODAY, 2)).toEqual({ ok: true });
		expect(canExcuse("2026-09-09", TODAY, 2)).toEqual({
			ok: false,
			reason: "too_old",
		});
		expect(canExcuse("2026-09-12", TODAY, 2)).toEqual({
			ok: false,
			reason: "future",
		});
	});

	it("refuses once the month's balance is spent", () => {
		expect(canExcuse(TODAY, TODAY, 0)).toEqual({
			ok: false,
			reason: "no_balance",
		});
	});

	it("crosses a month boundary correctly", () => {
		expect(canExcuse("2026-08-31", "2026-09-01", 2)).toEqual({ ok: true });
	});
});

describe("scoring nextStreak with excused days", () => {
	it("keeps the original behaviour when nothing is excused", () => {
		expect(nextStreak(37, "2026-09-10", "2026-09-11")).toBe(38);
		expect(nextStreak(37, "2026-09-08", "2026-09-11")).toBe(1);
		expect(nextStreak(37, "2026-09-11", "2026-09-11")).toBe(37);
	});

	it("survives a gap in which every day was excused", () => {
		// missed Thursday, excused it, resumed Friday
		expect(nextStreak(37, "2026-09-09", "2026-09-11", ["2026-09-10"])).toBe(38);
		// two excused days in a row
		expect(
			nextStreak(37, "2026-09-08", "2026-09-11", ["2026-09-09", "2026-09-10"]),
		).toBe(38);
	});

	it("still breaks when one day in the gap was not excused", () => {
		expect(nextStreak(37, "2026-09-08", "2026-09-11", ["2026-09-09"])).toBe(1);
	});

	it("ignores excused dates outside the gap", () => {
		expect(nextStreak(37, "2026-09-08", "2026-09-11", ["2026-09-01"])).toBe(1);
	});

	it("advances by one across a gap, never by the number of excused days", () => {
		expect(
			nextStreak(37, "2026-09-06", "2026-09-11", [
				"2026-09-07",
				"2026-09-08",
				"2026-09-09",
				"2026-09-10",
			]),
		).toBe(38);
	});
});
