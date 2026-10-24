import { CalendarDays } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { getLeaderboardData } from "@/server/queries";

type LeaderboardData = Awaited<ReturnType<typeof getLeaderboardData>>;

/**
 * Which calendar window the ranking covers: the month name, or the Monday–
 * Sunday week. Dates are plain YYYY-MM-DD, so they're formatted in UTC to keep
 * the day from shifting with the viewer's zone; Latin digits match the page
 * numbers used across the app.
 */
export function LeaderboardPeriod({
	period,
	range,
}: Pick<LeaderboardData, "period" | "range">) {
	const { t, locale } = useI18n();
	if (!range) return null;

	const format = (date: string, options: Intl.DateTimeFormatOptions) =>
		new Intl.DateTimeFormat(`${locale}-u-nu-latn`, {
			timeZone: "UTC",
			...options,
		}).format(new Date(`${date}T00:00:00Z`));
	const day = { weekday: "short", day: "numeric", month: "short" } as const;

	return (
		<p className="flex items-center gap-1.5 text-[13px] text-text-secondary">
			<CalendarDays size={15} className="shrink-0 text-primary" />
			{period === "weekly" ? (
				t("leaderboard.weekRange", {
					from: format(range.from, day),
					to: format(range.to, day),
				})
			) : (
				<span className="font-bold text-text">
					{format(range.from, { month: "long" })}
				</span>
			)}
		</p>
	);
}
