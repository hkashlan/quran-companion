import {
	createFileRoute,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import { Card, Section } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import {
	getJoinRequests,
	getPlanChangeRequests,
	respondJoinRequest,
	respondPlanChange,
} from "@/server/queries";

export const Route = createFileRoute("/_protected/teacher/requests")({
	loader: async () => {
		const [join, planChanges] = await Promise.all([
			getJoinRequests(),
			getPlanChangeRequests(),
		]);
		return { requests: join.requests, planChanges: planChanges.requests };
	},
	component: RequestsScreen,
});

function RequestsScreen() {
	const { t } = useI18n();
	const router = useRouter();
	const navigate = useNavigate();
	const { requests, planChanges } = Route.useLoaderData();

	async function respond(id: string, status: "approved" | "rejected") {
		const res = await respondJoinRequest({ data: { id, status } });
		// After approving a student, send the teacher straight to the assign-plan
		// screen for that student instead of just refreshing the list.
		if (
			status === "approved" &&
			res.requestedRole === "student" &&
			res.userId
		) {
			navigate({ to: "/assign-review", search: { studentId: res.userId } });
			return;
		}
		router.invalidate();
	}

	async function respondPlan(id: string, status: "approved" | "rejected") {
		await respondPlanChange({ data: { id, status } });
		router.invalidate();
	}

	return (
		<div className="flex flex-col gap-4 p-4">
			<h1 className="text-[22px] font-bold text-text">{t("requests.title")}</h1>
			{requests.length === 0 ? (
				<p className="py-12 text-center text-[14px] text-text-secondary">
					{t("requests.empty")}
				</p>
			) : (
				requests.map((r) => (
					<Card key={r.id} className="flex flex-col gap-3">
						<div className="flex flex-col">
							<span className="text-[15px] font-bold text-text">
								{r.userName}
							</span>
							<span className="text-[12px] text-text-secondary">
								{r.userEmail}
							</span>
							<span className="text-[12px] text-text-light">
								{r.circleTitle}
							</span>
						</div>
						<div className="flex gap-2">
							<button
								type="button"
								onClick={() => respond(r.id, "approved")}
								className="flex-1 rounded-md bg-primary py-2 text-[13px] font-semibold text-white"
							>
								{t("requests.approve")}
							</button>
							<button
								type="button"
								onClick={() => respond(r.id, "rejected")}
								className="flex-1 rounded-md border border-border bg-surface py-2 text-[13px] font-semibold text-text-secondary"
							>
								{t("requests.reject")}
							</button>
						</div>
					</Card>
				))
			)}

			{planChanges.length > 0 ? (
				<Section title={t("planReq.title")}>
					<div className="flex flex-col gap-3">
						{planChanges.map((r) => {
							const label =
								r.field === "daily_amount"
									? `${t("planReq.daily")}: ${r.currentDailyAmount} → ${r.proposedDailyAmount}`
									: `${t("planReq.start")}: ${r.currentStartPage ?? "—"} → ${r.proposedStartPage}`;
							return (
								<Card key={r.id} className="flex flex-col gap-3">
									<div className="flex flex-col">
										<span className="text-[15px] font-bold text-text">
											{r.studentName}
										</span>
										<span className="text-[13px] text-text-secondary">
											{label}
										</span>
									</div>
									<div className="flex gap-2">
										<button
											type="button"
											onClick={() => respondPlan(r.id, "approved")}
											className="flex-1 rounded-md bg-primary py-2 text-[13px] font-semibold text-white"
										>
											{t("requests.approve")}
										</button>
										<button
											type="button"
											onClick={() => respondPlan(r.id, "rejected")}
											className="flex-1 rounded-md border border-border bg-surface py-2 text-[13px] font-semibold text-text-secondary"
										>
											{t("requests.reject")}
										</button>
									</div>
								</Card>
							);
						})}
					</div>
				</Section>
			) : null}
		</div>
	);
}
