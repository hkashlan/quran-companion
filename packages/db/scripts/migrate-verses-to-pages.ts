// One-time data migration: convert legacy verse-mode review plans (and their
// still-active reviews) to the page-based model the app now uses exclusively.
//
// For each non-pages plan:
//   • range_mode      → 'pages'
//   • start_page      → the mushaf page where its start surah begins
//   • end_page        → 604 (continuous cursor to the end of the mushaf)
//   • daily_unit      → 'pages'
//   • daily_amount    → converted from verses/day (≈15 verses per page, min 1)
//   • cursor_reset    → true (next generated review re-anchors to start_page)
//
// Pending/missed reviews are re-anchored to a page window so the student's
// current screen shows pages immediately. Completed reviews are left untouched
// as historical records (they still render via the verse-label fallback).
//
//   pnpm --filter @quran/db exec tsx --env-file=../../.env scripts/migrate-verses-to-pages.ts
import { eq, ne, or, isNull } from "drizzle-orm";

import { db } from "../src/db.ts";
import {
	MUSHAF_PAGES,
	nextPageWindow,
	VERSES_PER_PAGE,
} from "../src/domain/review-cycle.ts";
import { getStartPageForSurah } from "../src/domain/surahs.ts";
import { reviews } from "../src/tables/review.drizzle.ts";
import { reviewPlans } from "../src/tables/review-plan.drizzle.ts";

const versesToPages = (verses: number) =>
	Math.max(1, Math.round(verses / VERSES_PER_PAGE));

const plans = await db
	.select()
	.from(reviewPlans)
	.where(or(ne(reviewPlans.rangeMode, "pages"), isNull(reviewPlans.startPage)));

console.log(`Found ${plans.length} plan(s) to convert.`);

for (const plan of plans) {
	const startPage = getStartPageForSurah(plan.startSurahNumber);
	const dailyAmount = versesToPages(plan.dailyAmount);

	await db
		.update(reviewPlans)
		.set({
			rangeMode: "pages",
			startPage,
			endPage: MUSHAF_PAGES,
			dailyUnit: "pages",
			dailyAmount,
			cursorReset: true,
		})
		.where(eq(reviewPlans.id, plan.id));

	// Re-anchor still-active reviews for this plan to a page window.
	const active = await db
		.select()
		.from(reviews)
		.where(eq(reviews.reviewPlanId, plan.id));
	for (const r of active) {
		if (r.status === "completed") continue;
		if (r.rangeMode === "pages" && r.startPage != null) continue;
		const window = nextPageWindow({ startPage, dailyAmount }, null);
		await db
			.update(reviews)
			.set({
				rangeMode: "pages",
				startPage: window.startPage,
				endPage: window.endPage,
				progressPage: null,
			})
			.where(eq(reviews.id, r.id));
	}

	console.log(
		`  ✓ plan ${plan.id}: surah ${plan.startSurahNumber} → page ${startPage}, ${dailyAmount} pages/day`,
	);
}

console.log("✓ Done.");
process.exit(0);
