import {
	createFileRoute,
	Link,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import { ChevronRight, Flame, Star } from "lucide-react";
import { ReviewProgress } from "@/components/ReviewProgress";
import { Card } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { reviewRange } from "@/lib/review-range";
import { getStudentDetail, removeReviewPlan } from "@/server/queries";

export const Route = createFileRoute("/_protected/student-detail")({
	validateSearch: (s: Record<string, unknown>) => ({
		studentId: String(s.studentId ?? ""),
	}),
	loaderDeps: ({ search }) => ({ studentId: search.studentId }),
	loader: async ({ deps }) =>
		getStudentDetail({ data: { studentId: deps.studentId } }),
	component: StudentDetail,
});

function StudentDetail() {
	const { t } = useI18n();
	const navigate = useNavigate();
	const router = useRouter();
	const { studentId } = Route.useSearch();
	const { student, plan, reviews, sessions } = Route.useLoaderData();

	if (!student)
		return <div className="p-6 text-center text-text-secondary">—</div>;

	async function remove() {
		await removeReviewPlan({ data: { studentId } });
		router.invalidate();
	}

	const planRange = plan ? reviewRange(plan) : null;

	return (
		<div className="mx-auto flex min-h-screen max-w-md flex-col gap-4 bg-background p-4">
			<header className="flex items-center gap-2 pb-1">
				<button
					type="button"
					onClick={() => navigate({ to: "/teacher" })}
					className="text-text-secondary"
				>
					<ChevronRight size={24} />
				</button>
				<h1 className="text-[20px] font-bold text-text">{student.name}</h1>
			</header>

			<Card className="flex items-center justify-between">
				<div className="flex flex-col">
					<span className="text-[15px] font-bold text-text">
						{student.name}
					</span>
					<span className="text-[12px] text-text-secondary">
						{student.email}
					</span>
				</div>
				<div className="flex gap-3 text-[13px]">
					<span className="flex items-center gap-1 font-bold text-accent">
						<Star size={14} /> {student.points}
					</span>
					<span className="flex items-center gap-1 font-bold text-secondary">
						<Flame size={14} /> {student.streak}
					</span>
				</div>
			</Card>

			<Card className="flex flex-col gap-2">
				<div className="flex items-center justify-between">
					<span className="text-[13px] font-bold text-text">
						{t("detail.plan")}
					</span>
					<div className="flex gap-2">
						<Link
							to="/assign-review"
							search={{ studentId }}
							className="rounded-md bg-primary-light px-2 py-1 text-[12px] font-semibold text-primary"
						>
							{t("detail.edit")}
						</Link>
						{plan ? (
							<button
								type="button"
								onClick={remove}
								className="rounded-md bg-error/10 px-2 py-1 text-[12px] font-semibold text-error"
							>
								{t("detail.remove")}
							</button>
						) : null}
					</div>
				</div>
				{plan ? (
					<span className="text-[14px] text-text-secondary">
						{planRange} · {plan.dailyAmount} {t("detail.daily")}
					</span>
				) : (
					<span className="text-[13px] text-text-light">
						{t("detail.noPlan")}
					</span>
				)}
			</Card>

			<ReviewProgress
				reviews={reviews}
				sessions={sessions}
				points={student.points}
				streak={student.streak}
			/>
		</div>
	);
}
