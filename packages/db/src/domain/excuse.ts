/**
 * Excuse days ("أيام العذر") — a small monthly allowance that lets a student mark
 * a day as excused so travel or illness doesn't destroy a long streak.
 * Pure functions, no DB access.
 *
 * An excused day forgives the *calendar day*, not the pages: it neither breaks
 * nor advances the streak, is kept out of the backlog and the on-time rate, and
 * earns nothing. The pages stay owed, which is why `lastReachedPage` needs no
 * change — the window is simply re-issued.
 */

/** Monthly allowance when no circle sets one. */
export const DEFAULT_EXCUSE_DAYS_PER_MONTH = 2;

/** "2026-09-11" → "2026-09". The allowance resets on the 1st, with no carryover. */
export function monthKey(date: string): string {
	return date.slice(0, 7);
}

/**
 * A student's allowance, given the per-month setting of every circle they are a
 * student in. `null` means that circle inherits the default; the most generous
 * circle wins, and a student in no circle at all still gets the default.
 */
export function excuseAllowance(
	circleValues: readonly (number | null)[],
): number {
	const set = circleValues.filter((v): v is number => v != null);
	if (set.length === 0) return DEFAULT_EXCUSE_DAYS_PER_MONTH;
	return Math.max(...set);
}

export function excuseBalance(
	allowed: number,
	usedThisMonth: number,
): { allowed: number; used: number; remaining: number } {
	return {
		allowed,
		used: usedThisMonth,
		remaining: Math.max(0, allowed - usedThisMonth),
	};
}

export type ExcuseRefusal = "future" | "too_old" | "no_balance";

/**
 * Whether a day may be excused now. The window is today or yesterday — the
 * calendar approximation of "within 24 hours" — so a student can excuse a day
 * they have just lost, but cannot rewrite history a week later.
 */
export function canExcuse(
	date: string,
	today: string,
	remaining: number,
): { ok: true } | { ok: false; reason: ExcuseRefusal } {
	if (date > today) return { ok: false, reason: "future" };
	const yesterday = shift(today, -1);
	if (date < yesterday) return { ok: false, reason: "too_old" };
	if (remaining <= 0) return { ok: false, reason: "no_balance" };
	return { ok: true };
}

function shift(date: string, delta: number): string {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + delta);
	return d.toISOString().slice(0, 10);
}
