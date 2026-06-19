import { getSurahNameForPage } from "@quran/db/domain/surahs";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { createSession, getStudentModalData } from "@/server/queries";

export const Route = createFileRoute("/_protected/add-session")({
	validateSearch: (s: Record<string, unknown>) => ({
		studentId: String(s.studentId ?? ""),
	}),
	loaderDeps: ({ search }) => ({ studentId: search.studentId }),
	loader: async ({ deps }) =>
		getStudentModalData({ data: { studentId: deps.studentId } }),
	component: AddSession,
});

const EVALS = ["excellent", "veryGood", "good", "fair", "needsWork"] as const;

function AddSession() {
	const { t } = useI18n();
	const navigate = useNavigate();
	const { studentId } = Route.useSearch();
	const { student } = Route.useLoaderData();

	const [startPage, setStartPage] = useState("1");
	const [endPage, setEndPage] = useState("1");
	const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
	const [time, setTime] = useState("");
	const [notes, setNotes] = useState("");
	const [evaluation, setEvaluation] = useState("");
	const [saving, setSaving] = useState(false);

	const start = Math.min(604, Math.max(1, Number.parseInt(startPage, 10) || 1));
	const end = Math.min(604, Math.max(1, Number.parseInt(endPage, 10) || 1));
	const surahLabel = `${getSurahNameForPage(Math.min(start, end), "ar")}${
		getSurahNameForPage(Math.min(start, end), "ar") !==
		getSurahNameForPage(Math.max(start, end), "ar")
			? ` – ${getSurahNameForPage(Math.max(start, end), "ar")}`
			: ""
	}`;

	async function save() {
		setSaving(true);
		await createSession({
			data: {
				studentId,
				startPage: start,
				endPage: end,
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
				<button
					type="button"
					onClick={() => navigate({ to: "/teacher" })}
					className="text-text-secondary"
				>
					<ChevronRight size={24} />
				</button>
				<h1 className="text-[20px] font-bold text-text">
					{t("session.title")} · {student?.name ?? ""}
				</h1>
			</header>

			<div className="flex gap-2">
				<div className="flex flex-1 flex-col gap-1">
					<span className="text-[13px] font-semibold text-text">
						{t("assign.startPage")}
					</span>
					<input
						type="number"
						min={1}
						max={604}
						value={startPage}
						onChange={(e) => setStartPage(e.target.value)}
						className={inputClass}
					/>
				</div>
				<div className="flex flex-1 flex-col gap-1">
					<span className="text-[13px] font-semibold text-text">
						{t("session.endPage")}
					</span>
					<input
						type="number"
						min={1}
						max={604}
						value={endPage}
						onChange={(e) => setEndPage(e.target.value)}
						className={inputClass}
					/>
				</div>
			</div>
			<span className="px-1 text-[13px] font-semibold text-primary">
				{surahLabel}
			</span>

			<div className="flex gap-2">
				<div className="flex flex-1 flex-col gap-1">
					<span className="text-[13px] font-semibold text-text">
						{t("session.date")}
					</span>
					<input
						type="date"
						value={date}
						onChange={(e) => setDate(e.target.value)}
						className={inputClass}
					/>
				</div>
				<div className="flex flex-1 flex-col gap-1">
					<span className="text-[13px] font-semibold text-text">
						{t("session.time")}
					</span>
					<input
						type="time"
						value={time}
						onChange={(e) => setTime(e.target.value)}
						className={inputClass}
					/>
				</div>
			</div>

			<div className="flex flex-col gap-1">
				<span className="text-[13px] font-semibold text-text">
					{t("session.evaluation")}
				</span>
				<select
					value={evaluation}
					onChange={(e) => setEvaluation(e.target.value)}
					className={inputClass}
				>
					<option value="">—</option>
					{EVALS.map((e) => (
						<option key={e} value={e}>
							{t(`eval.${e}`)}
						</option>
					))}
				</select>
			</div>

			<div className="flex flex-col gap-1">
				<span className="text-[13px] font-semibold text-text">
					{t("session.notes")}
				</span>
				<textarea
					value={notes}
					onChange={(e) => setNotes(e.target.value)}
					rows={3}
					className={inputClass}
				/>
			</div>

			<Button onClick={save} loading={saving} className="mt-2">
				{t("session.save")}
			</Button>
		</div>
	);
}
