/**
 * Plan-reset maths — the two exits offered to a student who has fallen behind.
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
 * `distribute` claws it back by temporarily raising the daily amount, and
 * `startToday` lets it slip by exactly the days lost.
 *
 * `startToday` deliberately does *not* move the cursor. Skipping ahead to
 * `idealCursor` would restore the promised date, but only by writing off pages
 * the student never read — buying a date with memorisation they still owe. The
 * honest trade is the other one: forgive the calendar, keep the pages.
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

export type StartTodayPreview = {
	dailyAmount: number;
	/** Where today's window begins — unchanged: no page is written off. */
	startPage: number;
	khatmahBefore: string;
	khatmahAfter: string;
	delayDays: number;
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
/**
 * Wipe the backlog and carry on from where the student actually is, as if the
 * plan began today. The daily amount is untouched and no page is skipped, so the
 * entire cost lands on the finish date: it slips by exactly the days that were
 * lost, which is the honest price of those days.
 */
export function startTodayPreview(i: ResetInput): StartTodayPreview {
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
		startPage: i.cursorPage,
		khatmahBefore: before,
		khatmahAfter: after,
		delayDays: Math.round(delayMs / 86_400_000),
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
