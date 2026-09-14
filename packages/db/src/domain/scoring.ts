/**
 * Scoring + streak rules — a faithful TypeScript port of the FastAPI
 * `services/scoring.py` and the streak update in `services/review_management.py`.
 * Pure functions, no DB access, so they're unit-testable in isolation.
 */

/** Days between two YYYY-MM-DD dates (a - b), UTC, calendar days. */
export function diffDays(a: string, b: string): number {
	const ms = Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`);
	return Math.round(ms / 86_400_000);
}

/**
 * Points earned for completing a review, decreasing with lateness:
 * 10 (on time), 5 (1 day late), 0 (2 days late), then -5 per extra day.
 * Mirrors scoring.py::calculate_points. Returns [points, diffDays].
 */
export function calculatePoints(
	assignedDate: string,
	today: string,
): [number, number] {
	const d = diffDays(today, assignedDate);
	let points: number;
	if (d <= 0) points = 10;
	else if (d === 1) points = 5;
	else if (d === 2) points = 0;
	else points = -5 * (d - 2);
	return [points, d];
}

/** Whether a completion keeps the streak alive (scoring.py::is_consecutive). */
export function isConsecutive(
	streakLastDate: string | null,
	d: number,
): boolean {
	return streakLastDate !== null && d <= 1;
}

/**
 * Next streak value on completion (review_management.py:161-173):
 *  - same day as last completion → unchanged
 *  - exactly the day after → +1
 *  - a longer gap whose every day was excused → +1 (the streak is frozen, not
 *    advanced, across excused days)
 *  - any other gap (or first ever) → reset to 1
 *
 * `excusedDates` defaults to empty, which is exactly the original behaviour.
 */
export function nextStreak(
	currentStreak: number,
	streakLastDate: string | null,
	completedDate: string,
	excusedDates: readonly string[] = [],
): number {
	if (streakLastDate === completedDate) return currentStreak;
	if (streakLastDate === null) return 1;
	const gap = diffDays(completedDate, streakLastDate);
	if (gap === 1) return currentStreak + 1;
	// A gap only survives if the student excused every single day inside it —
	// one unexcused day in the middle still breaks the chain.
	if (gap > 1) {
		const excused = new Set(excusedDates);
		const missing = daysBetween(streakLastDate, completedDate);
		if (missing.length > 0 && missing.every((d) => excused.has(d)))
			return currentStreak + 1;
	}
	return 1;
}

/** Every calendar day strictly between two YYYY-MM-DD dates, ascending. */
function daysBetween(from: string, to: string): string[] {
	const out: string[] = [];
	const d = new Date(`${from}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + 1);
	while (d.toISOString().slice(0, 10) < to) {
		out.push(d.toISOString().slice(0, 10));
		d.setUTCDate(d.getUTCDate() + 1);
	}
	return out;
}

/** Apply points to a student total, clamped at 0 (review_management.py:163). */
export function applyPoints(currentPoints: number, earned: number): number {
	return Math.max(0, currentPoints + earned);
}

/**
 * Standard competition ranking ("1224") over a list already sorted by points,
 * highest first: everyone on the same score shares the same place, and the next
 * distinct score skips the places they used up — so a three-way tie at the top
 * gives 1, 1, 1, then 4.
 */
export function withSharedRanks<T extends { points: number }>(
	rows: T[],
): (T & { rank: number })[] {
	let rank = 0;
	let prevPoints: number | null = null;
	return rows.map((row, i) => {
		if (prevPoints === null || row.points !== prevPoints) {
			rank = i + 1;
			prevPoints = row.points;
		}
		return { ...row, rank };
	});
}
