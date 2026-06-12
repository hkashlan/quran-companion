import { LOCALE_LABEL, LOCALES, useI18n, type Locale } from "@/lib/i18n";
import { BookOpen } from "lucide-react";
import type { ReactNode } from "react";

export function LanguageSwitcher() {
	const { locale, setLocale } = useI18n();
	return (
		<div className="flex justify-center gap-2">
			{LOCALES.map((l: Locale) => (
				<button
					key={l}
					onClick={() => setLocale(l)}
					className={`rounded-md border px-3 py-1 text-[12px] font-semibold ${
						locale === l
							? "border-primary bg-primary-light text-primary"
							: "border-border bg-surface text-text-secondary"
					}`}
				>
					{LOCALE_LABEL[l]}
				</button>
			))}
		</div>
	);
}

/** Centered auth layout with brand header + language switcher. */
export function AuthShell({
	icon = <BookOpen size={40} className="text-white" />,
	title,
	subtitle,
	children,
}: {
	icon?: ReactNode;
	title: string;
	subtitle?: string;
	children: ReactNode;
}) {
	return (
		<main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
			<div className="flex flex-col items-center gap-3">
				<div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary">{icon}</div>
				<h1 className="text-[28px] font-bold text-text">{title}</h1>
				{subtitle ? <p className="text-center text-[14px] text-text-secondary">{subtitle}</p> : null}
				<LanguageSwitcher />
			</div>
			{children}
		</main>
	);
}

export function OtpInput({
	value,
	onChange,
}: {
	value: string;
	onChange: (v: string) => void;
}) {
	return (
		<input
			inputMode="numeric"
			maxLength={6}
			value={value}
			onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
			placeholder="••••••"
			className="h-[54px] rounded-lg border border-border bg-surface text-center text-[22px] font-bold tracking-[0.4em] text-text outline-none"
		/>
	);
}
