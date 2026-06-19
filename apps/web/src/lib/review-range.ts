import { getSurahNamesForPageRange } from "@quran/db/domain/surahs";

/** A review/plan range as stored — verse columns are null for pages-mode rows. */
export type ReviewRangeRow = {
	rangeMode: string;
	startPage?: number | null;
	endPage?: number | null;
	surahName?: string | null;
	verseFrom?: number | null;
	verseTo?: number | null;
	endSurahName?: string | null;
};

/**
 * Human label for a review's range. The app is page-based: "ص N–M · السورة",
 * annotating the page range with the surah(s) it spans. Legacy verse-mode rows
 * still render their "Surah – End: a–b" label for historical records.
 */
export function reviewRange(r: ReviewRangeRow): string {
	if (r.startPage && r.endPage)
		return `ص ${r.startPage}–${r.endPage} · ${getSurahNamesForPageRange(
			r.startPage,
			r.endPage,
			"ar",
		)}`;
	const end =
		r.endSurahName && r.endSurahName !== r.surahName
			? ` – ${r.endSurahName}`
			: "";
	return `${r.surahName ?? ""}${end}: ${r.verseFrom ?? ""}–${r.verseTo ?? ""}`;
}
