import { useNavigate, useRouter } from "@tanstack/react-router";
import { Card, Section } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import {
	type getJoinRequests,
	type getPlanChangeRequests,
	respondJoinRequest,
	respondPlanChange,
} from "@/server/queries";

type JoinRequest = Awaited<
	ReturnType<typeof getJoinRequests>
>["requests"][number];
type PlanChange = Awaited<
	ReturnType<typeof getPlanChangeRequests>
>["requests"][number];

function DecisionButtons({
	onApprove,
	onReject,
}: {
	onApprove: () => void;
	onReject: () => void;
}) {
	const { t } = useI18n();
	return (
		<div className="flex gap-2">
			<button
				type="button"
				onClick={onApprove}
				className="flex-1 rounded-md bg-primary py-2 text-[13px] font-semibold text-white"
			>
				{t("requests.approve")}
			</button>
			<button
				type="button"
				onClick={onReject}
				className="flex-1 rounded-md border border-border bg-surface py-2 text-[13px] font-semibold text-text-secondary"
			>
				{t("requests.reject")}
			</button>
		</div>
	);
}

/**
 * Everything waiting on the teacher's decision, shown at the top of the
 * Students screen: join requests to circles they own, then plan changes their
 * students proposed. Renders nothing when there is nothing to decide.
 */
export function PendingRequests({
	requests,
	planChanges,
}: {
	requests: JoinRequest[];
	planChanges: PlanChange[];
}) {
	const { t } = useI18n();
	const router = useRouter();
	const navigate = useNavigate();
	if (requests.length === 0 && planChanges.length === 0) return null;

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
		<>
			{requests.length > 0 ? (
				<Section title={t("requests.title")}>
					{requests.map((r) => (
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
							<DecisionButtons
								onApprove={() => respond(r.id, "approved")}
								onReject={() => respond(r.id, "rejected")}
							/>
						</Card>
					))}
				</Section>
			) : null}

			{planChanges.length > 0 ? (
				<Section title={t("planReq.title")}>
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
								<DecisionButtons
									onApprove={() => respondPlan(r.id, "approved")}
									onReject={() => respondPlan(r.id, "rejected")}
								/>
							</Card>
						);
					})}
				</Section>
			) : null}
		</>
	);
}
