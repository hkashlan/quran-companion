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
 * Human label for a review's range: "ص N–M" for pages mode, "Surah – End: a–b"
 * for verses. Tolerates null verse fields (pages rows store only page numbers).
 */
export function reviewRange(r: ReviewRangeRow): string {
	if (r.rangeMode === "pages" && r.startPage && r.endPage)
		return `ص ${r.startPage}–${r.endPage}`;
	const end =
		r.endSurahName && r.endSurahName !== r.surahName
			? ` – ${r.endSurahName}`
			: "";
	return `${r.surahName ?? ""}${end}: ${r.verseFrom ?? ""}–${r.verseTo ?? ""}`;
}
