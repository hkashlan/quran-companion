import { Button } from "@/components/ui";
import { NumberPicker, SurahPicker, surahVerseCount } from "@/components/pickers";
import { useI18n } from "@/lib/i18n";
import { createSession, getStudentModalData } from "@/server/queries";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/_protected/add-session")({
	validateSearch: (s: Record<string, unknown>) => ({ studentId: String(s.studentId ?? "") }),
	loaderDeps: ({ search }) => ({ studentId: search.studentId }),
	loader: async ({ deps }) => getStudentModalData({ data: { studentId: deps.studentId } }),
	component: AddSession,
});

const EVALS = ["excellent", "veryGood", "good", "fair", "needsWork"] as const;

function AddSession() {
	const { t } = useI18n();
	const navigate = useNavigate();
	const { studentId } = Route.useSearch();
	const { student } = Route.useLoaderData();

	const [startSurah, setStartSurah] = useState(1);
	const [startVerse, setStartVerse] = useState(1);
	const [diffEnd, setDiffEnd] = useState(false);
	const [endSurah, setEndSurah] = useState(1);
	const [endVerse, setEndVerse] = useState(7);
	const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
	const [time, setTime] = useState("");
	const [notes, setNotes] = useState("");
	const [evaluation, setEvaluation] = useState("");
	const [saving, setSaving] = useState(false);

	const effectiveEnd = diffEnd ? endSurah : startSurah;

	async function save() {
		setSaving(true);
		await createSession({
			data: {
				studentId,
				rangeMode: "verses",
				startSurahNumber: startSurah,
				startVerse,
				endSurahNumber: effectiveEnd,
				endVerse,
				sessionDate: date,
				sessionTime: time || undefined,
				notes: notes || undefined,
				evaluation: evaluation || undefined,
			},
		});
		setSaving(false);
		navigate({ to: "/teacher" });
	}

	const inputClass =
		"rounded-md border border-border bg-background px-3 py-2.5 text-[15px] text-text outline-none";

	return (
		<div className="mx-auto flex min-h-screen max-w-md flex-col gap-3 bg-background p-4">
			<header className="flex items-center gap-2 pb-2">
				<button onClick={() => navigate({ to: "/teacher" })} className="text-text-secondary">
					<ChevronRight size={24} />
				</button>
				<h1 className="text-[20px] font-bold text-text">
					{t("session.title")} · {student?.name ?? ""}
				</h1>
			</header>

			<SurahPicker label={t("assign.startSurah")} value={startSurah} onChange={(s) => {
				setStartSurah(s);
				setStartVerse((v) => Math.min(v, surahVerseCount(s)));
			}} />
			<NumberPicker label={t("assign.fromVerse")} value={startVerse} min={1} max={surahVerseCount(startSurah)} onChange={setStartVerse} />
			<label className="flex items-center gap-2 px-1 text-[14px] text-text">
				<input type="checkbox" checked={diffEnd} onChange={(e) => setDiffEnd(e.target.checked)} />
				{t("assign.differentEndSurah")}
			</label>
			{diffEnd ? (
				<SurahPicker label={t("assign.endSurah")} value={endSurah} onChange={(s) => {
					setEndSurah(s);
					setEndVerse((v) => Math.min(v, surahVerseCount(s)));
				}} />
			) : null}
			<NumberPicker label={t("assign.toVerse")} value={endVerse} min={1} max={surahVerseCount(effectiveEnd)} onChange={setEndVerse} />

			<div className="flex gap-2">
				<div className="flex flex-1 flex-col gap-1">
					<span className="text-[13px] font-semibold text-text">{t("session.date")}</span>
					<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
				</div>
				<div className="flex flex-1 flex-col gap-1">
					<span className="text-[13px] font-semibold text-text">{t("session.time")}</span>
					<input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} />
				</div>
			</div>

			<div className="flex flex-col gap-1">
				<span className="text-[13px] font-semibold text-text">{t("session.evaluation")}</span>
				<select value={evaluation} onChange={(e) => setEvaluation(e.target.value)} className={inputClass}>
					<option value="">—</option>
					{EVALS.map((e) => (
						<option key={e} value={e}>
							{t(`eval.${e}`)}
						</option>
					))}
				</select>
			</div>

			<div className="flex flex-col gap-1">
				<span className="text-[13px] font-semibold text-text">{t("session.notes")}</span>
				<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={inputClass} />
			</div>

			<Button onClick={save} loading={saving} className="mt-2">
				{t("session.save")}
			</Button>
		</div>
	);
}
