import { getSurahNameForPage } from "@quran/db/domain/surahs";
import {
	createFileRoute,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { assignReviewPlan, getStudentModalData } from "@/server/queries";

export const Route = createFileRoute("/_protected/assign-review")({
	validateSearch: (s: Record<string, unknown>) => ({
		studentId: String(s.studentId ?? ""),
	}),
	loaderDeps: ({ search }) => ({ studentId: search.studentId }),
	loader: async ({ deps }) =>
		getStudentModalData({ data: { studentId: deps.studentId } }),
	component: AssignReview,
});

function AssignReview() {
	const { t } = useI18n();
	const navigate = useNavigate();
	const router = useRouter();
	const { studentId } = Route.useSearch();
	const { student, plan } = Route.useLoaderData();

	const [startPage, setStartPage] = useState(String(plan?.startPage ?? 1));
	const [endPage, setEndPage] = useState(String(plan?.endPage ?? 604));
	const [daily, setDaily] = useState(String(plan?.dailyAmount ?? 10));
	const [saving, setSaving] = useState(false);

	const pageNum = Math.min(
		604,
		Math.max(1, Number.parseInt(startPage, 10) || 1),
	);
	const endNum = Math.min(
		604,
		Math.max(pageNum, Number.parseInt(endPage, 10) || 604),
	);
	const surahName = getSurahNameForPage(pageNum, "ar");
	const endSurahName = getSurahNameForPage(endNum, "ar");

	async function save() {
		setSaving(true);
		await assignReviewPlan({
			data: {
				studentId,
				startPage: pageNum,
				endPage: endNum,
				dailyAmount: Math.max(1, Number.parseInt(daily, 10) || 1),
			},
		});
		setSaving(false);
		// Refetch loaders so the new plan values show without a manual refresh.
		await router.invalidate();
		navigate({ to: "/teacher" });
	}

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
					{t("assign.title")} · {student?.name ?? ""}
				</h1>
			</header>

			<div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
				<span className="text-[14px] font-semibold text-text">
					{t("assign.startPage")}
				</span>
				<input
					type="number"
					min={1}
					max={604}
					value={startPage}
					onChange={(e) => setStartPage(e.target.value)}
					className="w-24 rounded-md border border-border bg-background px-3 py-2.5 text-[15px] font-semibold text-text outline-none"
				/>
				<span className="text-[13px] font-semibold text-primary">
					{surahName}
				</span>
			</div>

			<div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
				<span className="text-[14px] font-semibold text-text">
					{t("assign.endPage")}
				</span>
				<input
					type="number"
					min={pageNum}
					max={604}
					value={endPage}
					onChange={(e) => setEndPage(e.target.value)}
					className="w-24 rounded-md border border-border bg-background px-3 py-2.5 text-[15px] font-semibold text-text outline-none"
				/>
				<span className="text-[13px] font-semibold text-primary">
					{endSurahName}
				</span>
			</div>

			<div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
				<span className="text-[14px] font-semibold text-text">
					{t("assign.dailyAmount")}
				</span>
				<div className="flex items-center gap-2">
					<input
						type="number"
						min={1}
						value={daily}
						onChange={(e) => setDaily(e.target.value)}
						className="w-24 rounded-md border border-border bg-background px-3 py-2.5 text-[15px] font-semibold text-text outline-none"
					/>
					<span className="text-[13px] text-text-secondary">
						{t("assign.dailyPages")}
					</span>
				</div>
			</div>

			<Button onClick={save} loading={saving} className="mt-2">
				{t("assign.save")}
			</Button>
		</div>
	);
}
