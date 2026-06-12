import { SURAHS } from "@quran/db/domain/surahs";

/**
 * Web ports of the mobile verse/surah pickers. The RN app used a custom
 * expandable list; on the web a styled native <select> gives the same labelled
 * box + value badge with built-in scrolling/accessibility.
 */

function Field({
	label,
	value,
	children,
}: {
	label: string;
	value: string | number;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
			<div className="flex items-center justify-between">
				<span className="text-[14px] font-semibold text-text">{label}</span>
				<span className="min-w-11 rounded-full bg-primary-light px-2.5 py-0.5 text-center text-[14px] font-bold text-primary">
					{value}
				</span>
			</div>
			{children}
		</div>
	);
}

const selectClass =
	"rounded-md border border-border bg-background px-3 py-2.5 text-[15px] font-semibold text-text outline-none";

export function NumberPicker({
	label,
	value,
	min,
	max,
	onChange,
}: {
	label: string;
	value: number;
	min: number;
	max: number;
	onChange: (v: number) => void;
}) {
	const safeMax = Math.max(min, max);
	const options = Array.from({ length: safeMax - min + 1 }, (_, i) => min + i);
	return (
		<Field label={label} value={value}>
			<select
				className={selectClass}
				value={value}
				disabled={options.length <= 1}
				onChange={(e) => onChange(Number(e.target.value))}
			>
				{options.map((n) => (
					<option key={n} value={n}>
						{n}
					</option>
				))}
			</select>
		</Field>
	);
}

export function SurahPicker({
	label,
	value,
	onChange,
}: {
	label: string;
	value: number;
	onChange: (surah: number) => void;
}) {
	const current = SURAHS.find((s) => s.number === value);
	return (
		<Field label={label} value={current?.nameAr ?? value}>
			<select
				className={selectClass}
				value={value}
				onChange={(e) => onChange(Number(e.target.value))}
			>
				{SURAHS.map((s) => (
					<option key={s.number} value={s.number}>
						{s.number}. {s.nameAr}
					</option>
				))}
			</select>
		</Field>
	);
}

export function Segmented<T extends string>({
	options,
	value,
	onChange,
}: {
	options: { value: T; label: string }[];
	value: T;
	onChange: (v: T) => void;
}) {
	return (
		<div className="flex gap-2">
			{options.map((o) => (
				<button
					key={o.value}
					onClick={() => onChange(o.value)}
					className={`flex-1 rounded-md border py-2.5 text-[14px] font-semibold ${
						value === o.value
							? "border-primary bg-primary-light text-primary"
							: "border-border bg-surface text-text-secondary"
					}`}
				>
					{o.label}
				</button>
			))}
		</div>
	);
}

export function surahVerseCount(surah: number): number {
	return SURAHS.find((s) => s.number === surah)?.verses ?? 1;
}
