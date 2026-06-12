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
export function calculatePoints(assignedDate: string, today: string): [number, number] {
	const d = diffDays(today, assignedDate);
	let points: number;
	if (d <= 0) points = 10;
	else if (d === 1) points = 5;
	else if (d === 2) points = 0;
	else points = -5 * (d - 2);
	return [points, d];
}

/** Whether a completion keeps the streak alive (scoring.py::is_consecutive). */
export function isConsecutive(streakLastDate: string | null, d: number): boolean {
	return streakLastDate !== null && d <= 1;
}

/**
 * Next streak value on completion (review_management.py:161-173):
 *  - same day as last completion → unchanged
 *  - exactly the day after → +1
 *  - any other gap (or first ever) → reset to 1
 */
export function nextStreak(
	currentStreak: number,
	streakLastDate: string | null,
	completedDate: string,
): number {
	if (streakLastDate === completedDate) return currentStreak;
	if (streakLastDate !== null && diffDays(completedDate, streakLastDate) === 1) {
		return currentStreak + 1;
	}
	return 1;
}

/** Apply points to a student total, clamped at 0 (review_management.py:163). */
export function applyPoints(currentPoints: number, earned: number): number {
	return Math.max(0, currentPoints + earned);
}
