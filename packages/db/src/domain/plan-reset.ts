/**
 * Plan-reset maths — the three exits offered to a student who has fallen behind.
 * Pure functions, no DB access.
 *
 * There is no stored plan start date or khatmah target in the schema, so the
 * completion date is always *derived*: `today + ceil(remaining ÷ daily)`. Two
 * cursors matter:
 *
 *   - `cursorPage`  — where the student actually is (the stuck window's first page)
 *   - `idealCursor` — where they would be had they not missed those days
 *
 * `khatmahBefore` is always computed from `idealCursor`, i.e. the finish date the
 * student was promised. Each strategy then reports what it does to that promise:
 * `extend` slips it by exactly the days lost, `distribute` claws it back by
 * temporarily raising the daily amount, and `skip` restores it by jumping the
 * cursor forward and writing off the pages in between.
 */

/** Catch-up window lengths offered for the "distribute" strategy. */
export const CATCHUP_DAY_CHOICES = [7, 15, 30] as const;

/** Shift a YYYY-MM-DD date by `delta` days (UTC, DST-safe). */
export function addDaysStr(date: string, delta: number): string {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + delta);
	return d.toISOString().slice(0, 10);
}

export type ResetInput = {
	today: string;
	dailyAmount: number;
	planStartPage: number;
	planEndPage: number;
	/** First page of the window the student is currently stuck on. */
	cursorPage: number;
	/** Calendar days missed — the size of the backlog. */
	overdueDays: number;
};

export type DistributePreview = {
	baseDaily: number;
	extraPerDay: number;
	dailyDuringCatchup: number;
	catchupDays: number;
	catchupUntil: string;
	khatmahBefore: string;
	khatmahAfter: string;
};

export type ExtendPreview = {
	dailyAmount: number;
	khatmahBefore: string;
	khatmahAfter: string;
	delayDays: number;
};

export type SkipPreview = {
	newStartPage: number;
	skippedFrom: number;
	skippedTo: number;
	skippedPages: number;
	khatmahBefore: string;
	khatmahAfter: string;
};

const daily = (n: number) => Math.max(1, n);

/**
 * Where the cursor would sit today had no day been missed, clamped one past the
 * plan's end so a reset never wraps the student into a fresh khatmah.
 */
export function idealCursor(i: ResetInput): number {
	const debt = Math.max(0, i.overdueDays) * daily(i.dailyAmount);
	return Math.min(i.cursorPage + debt, i.planEndPage + 1);
}

/** Pages left from `cursor` to the plan's end, inclusive. */
export function remainingPages(cursor: number, planEndPage: number): number {
	return Math.max(0, planEndPage - cursor + 1);
}

/** Derived finish date: the last day on which the remaining pages get read. */
export function estimatedKhatmah(
	today: string,
	remaining: number,
	dailyAmount: number,
): string {
	if (remaining <= 0) return today;
	return addDaysStr(today, Math.ceil(remaining / daily(dailyAmount)) - 1);
}

/** The finish date the student was promised, before the missed days. */
function khatmahBefore(i: ResetInput): string {
	return estimatedKhatmah(
		i.today,
		remainingPages(idealCursor(i), i.planEndPage),
		i.dailyAmount,
	);
}

/**
 * Raise the daily amount for a fixed window so the lost days are made up.
 * The extra is spread over `catchupDays`, rounded up so the debt is fully covered.
 */
export function distributePreview(
	i: ResetInput,
	catchupDays: number,
): DistributePreview {
	const days = Math.max(1, catchupDays);
	const debt = Math.max(0, i.overdueDays) * daily(i.dailyAmount);
	const extraPerDay = Math.ceil(debt / days);
	const dailyDuringCatchup = daily(i.dailyAmount) + extraPerDay;

	const remaining = remainingPages(i.cursorPage, i.planEndPage);
	const inCatchup = days * dailyDuringCatchup;
	const totalDays =
		remaining <= inCatchup
			? Math.ceil(remaining / dailyDuringCatchup)
			: days + Math.ceil((remaining - inCatchup) / daily(i.dailyAmount));

	return {
		baseDaily: daily(i.dailyAmount),
		extraPerDay,
		dailyDuringCatchup,
		catchupDays: days,
		catchupUntil: addDaysStr(i.today, days - 1),
		khatmahBefore: khatmahBefore(i),
		khatmahAfter:
			remaining <= 0
				? i.today
				: addDaysStr(i.today, Math.max(0, totalDays - 1)),
	};
}

/** Keep the daily amount and accept a later finish — the backlog is simply forgiven. */
export function extendPreview(i: ResetInput): ExtendPreview {
	const before = khatmahBefore(i);
	const after = estimatedKhatmah(
		i.today,
		remainingPages(i.cursorPage, i.planEndPage),
		i.dailyAmount,
	);
	const delayMs =
		Date.parse(`${after}T00:00:00Z`) - Date.parse(`${before}T00:00:00Z`);
	return {
		dailyAmount: daily(i.dailyAmount),
		khatmahBefore: before,
		khatmahAfter: after,
		delayDays: Math.round(delayMs / 86_400_000),
	};
}

/** Jump the cursor to where the plan should be today; the pages in between are written off. */
export function skipPreview(i: ResetInput): SkipPreview {
	const target = idealCursor(i);
	const skippedPages = Math.max(0, target - i.cursorPage);
	return {
		newStartPage: Math.min(target, i.planEndPage),
		skippedFrom: i.cursorPage,
		skippedTo: Math.max(i.cursorPage, target - 1),
		skippedPages,
		khatmahBefore: khatmahBefore(i),
		khatmahAfter: estimatedKhatmah(
			i.today,
			remainingPages(target, i.planEndPage),
			i.dailyAmount,
		),
	};
}

export type CatchupPlan = {
	dailyAmount: number;
	catchupExtraPages: number | null;
	catchupUntil: string | null;
};

/** The daily amount in force on a given date, including any active catch-up extra. */
export function effectiveDailyAmount(
	plan: CatchupPlan,
	onDate: string,
): number {
	if (plan.catchupExtraPages == null || plan.catchupUntil == null)
		return plan.dailyAmount;
	// Inclusive: the last catch-up day still carries the extra.
	return onDate <= plan.catchupUntil
		? plan.dailyAmount + plan.catchupExtraPages
		: plan.dailyAmount;
}

/** Whether a catch-up window has run out and its columns should be cleared. */
export function catchupExpired(plan: CatchupPlan, today: string): boolean {
	return plan.catchupUntil != null && today > plan.catchupUntil;
}
