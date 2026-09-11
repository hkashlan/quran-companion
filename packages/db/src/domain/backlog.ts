/**
 * Backlog presentation rules — how a student's outstanding (overdue) reviews are
 * collapsed, coloured, and escalated. Pure functions, no DB access.
 *
 * Key modelling fact this module exists to encode: the page cursor never
 * accumulates. `lastReachedPage` returns `startPage - 1` for a fully-missed day,
 * so `nextPageWindow` re-issues the *same* window the next day. Every overdue row
 * therefore carries (roughly) the same page range — a backlog is lost calendar
 * days, not piled-up pages. Never sum pages across rows; use `outstandingPageUnion`.
 */
import { diffDays } from "./scoring.ts";

/** How many overdue items are listed before the rest go behind an expander. */
export const BACKLOG_VISIBLE = 3;
/** Past this many overdue items the detailed list is replaced by a reset CTA. */
export const BACKLOG_COLLAPSE_ALL = 7;
/** Past this many overdue items the "reset your plan" card is offered. */
export const RESET_THRESHOLD_DAYS = 2;

/** Age bands: 1–2 days, 3–6 days, 7+ days. */
export type BacklogTone = "warn" | "alert" | "stale";

export type OverdueRow = {
	id: string;
	assignedDate: string;
	rangeMode: string;
	startPage: number | null;
	endPage: number | null;
	progressPage: number | null;
	status: string;
};

export type BacklogItem = OverdueRow & {
	daysLate: number;
	tone: BacklogTone;
};

export type BacklogView = {
	/** Total outstanding rows, including the ones not listed. */
	total: number;
	/**
	 * All outstanding rows, newest-first and decorated with age + tone. Empty when
	 * `suppressList`. The client shows the first `visible` and reveals the rest
	 * behind the expander — the backlog is small by definition, so sending the
	 * whole (short) list costs nothing and keeps "show N more" honest.
	 */
	items: BacklogItem[];
	/** How many of `items` to show before the expander. */
	visible: number;
	/** Rows behind the expander — the "show N more" count. */
	hiddenCount: number;
	/** Age of the oldest outstanding row, 0 when there is no backlog. */
	oldestDaysLate: number;
	/** Too many to list usefully: show the reset invitation instead. */
	suppressList: boolean;
	/** Enough backlog to offer the plan-reset card (consumed by the reset card). */
	showResetCard: boolean;
};

export function backlogTone(daysLate: number): BacklogTone {
	if (daysLate >= 7) return "stale";
	if (daysLate >= 3) return "alert";
	return "warn";
}

/**
 * Pages still owed across the backlog, as a *union* of the rows' windows rather
 * than a sum. Because a missed day re-issues its window, five missed rows of
 * 40 pages are 40 outstanding pages, not 200.
 */
export function outstandingPageUnion(rows: OverdueRow[]): number {
	const spans = rows
		.map((r) => {
			if (r.startPage == null || r.endPage == null) return null;
			// Progress already made on a row shrinks what it still owes.
			const from = Math.max(
				r.startPage,
				(r.progressPage ?? r.startPage - 1) + 1,
			);
			return from > r.endPage ? null : { from, to: r.endPage };
		})
		.filter((s): s is { from: number; to: number } => s !== null)
		.sort((a, b) => a.from - b.from);

	let total = 0;
	let cursor = -1;
	for (const s of spans) {
		const from = Math.max(s.from, cursor + 1);
		if (from > s.to) continue;
		total += s.to - from + 1;
		cursor = s.to;
	}
	return total;
}

/** Schedule debt: what the missed calendar days cost in pages of plan progress. */
export function backlogDebtPages(
	overdueDays: number,
	dailyAmount: number,
): number {
	return Math.max(0, overdueDays) * Math.max(1, dailyAmount);
}

/**
 * Collapse the outstanding rows into what the home screen should actually show:
 * the newest few with an age tone each, a hidden count, and the escalation flags.
 */
export function collapseBacklog(
	rows: OverdueRow[],
	today: string,
	opts?: { visible?: number; collapseAll?: number; resetThreshold?: number },
): BacklogView {
	const visible = opts?.visible ?? BACKLOG_VISIBLE;
	const collapseAll = opts?.collapseAll ?? BACKLOG_COLLAPSE_ALL;
	const resetThreshold = opts?.resetThreshold ?? RESET_THRESHOLD_DAYS;

	const sorted = [...rows].sort((a, b) =>
		a.assignedDate < b.assignedDate
			? 1
			: a.assignedDate > b.assignedDate
				? -1
				: 0,
	);
	const total = sorted.length;
	const oldestDaysLate =
		total === 0
			? 0
			: Math.max(0, diffDays(today, sorted[total - 1].assignedDate));
	const suppressList = total > collapseAll;

	const items: BacklogItem[] = suppressList
		? []
		: sorted.map((r) => {
				const daysLate = Math.max(0, diffDays(today, r.assignedDate));
				return { ...r, daysLate, tone: backlogTone(daysLate) };
			});

	return {
		total,
		items,
		visible,
		hiddenCount: suppressList ? total : Math.max(0, total - visible),
		oldestDaysLate,
		suppressList,
		showResetCard: total > resetThreshold,
	};
}
