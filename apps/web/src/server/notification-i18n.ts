/**
 * Server-composed notification texts, translated per recipient from
 * `user.language`. Kept separate from src/lib/i18n.tsx (a React module) so the
 * server bundle stays free of client code; keys/tone mirror the app dictionary.
 */

export type PushLocale = "ar" | "en" | "de";

export function normalizePushLocale(
	language: string | null | undefined,
): PushLocale {
	return language === "en" || language === "de" ? language : "ar";
}

export type PushText = {
	title: string;
	body: string;
	locale: PushLocale;
	dir: "rtl" | "ltr";
};

/**
 * Anonymous motivation for circle students who haven't finished yet: how many
 * of their circle mates already did today's review (no names mentioned).
 */
const circleMateDone: Record<
	PushLocale,
	{ title: string; one: string; many: string }
> = {
	ar: {
		title: "🔥 حماس في الحلقة",
		one: "أحد زملائك في الحلقة أنجز مراجعة اليوم — أنت أيضًا تستطيع! 💪",
		many: "{count} من زملائك في الحلقة أنجزوا مراجعة اليوم — أنت أيضًا تستطيع! 💪",
	},
	en: {
		title: "🔥 Your circle is on a roll",
		one: "One of your circle mates finished today's review — you can do it too! 💪",
		many: "{count} of your circle mates finished today's review — you can do it too! 💪",
	},
	de: {
		title: "🔥 Dein Kreis ist in Fahrt",
		one: "Einer aus deinem Kreis hat die heutige Wiederholung geschafft — du schaffst das auch! 💪",
		many: "{count} aus deinem Kreis haben die heutige Wiederholung geschafft — du schaffst das auch! 💪",
	},
};

/** "{count} circle mates did the review today, you can do it" — per-recipient language. */
export function circleMateDoneMessage(
	language: string | null | undefined,
	finishedCount: number,
): PushText {
	const locale = normalizePushLocale(language);
	const pack = circleMateDone[locale];
	const body =
		finishedCount <= 1
			? pack.one
			: pack.many.replace("{count}", String(finishedCount));
	return {
		title: pack.title,
		body,
		locale,
		dir: locale === "ar" ? "rtl" : "ltr",
	};
}
