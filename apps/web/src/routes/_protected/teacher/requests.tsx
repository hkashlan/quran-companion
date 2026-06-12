import { Card } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { getJoinRequests, respondJoinRequest } from "@/server/queries";
import { createFileRoute, useRouter } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/teacher/requests")({
	loader: async () => getJoinRequests(),
	component: RequestsScreen,
});

function RequestsScreen() {
	const { t } = useI18n();
	const router = useRouter();
	const { requests } = Route.useLoaderData();

	async function respond(id: string, status: "approved" | "rejected") {
		await respondJoinRequest({ data: { id, status } });
		router.invalidate();
	}

	return (
		<div className="flex flex-col gap-4 p-4">
			<h1 className="text-[22px] font-bold text-text">{t("requests.title")}</h1>
			{requests.length === 0 ? (
				<p className="py-12 text-center text-[14px] text-text-secondary">{t("requests.empty")}</p>
			) : (
				requests.map((r) => (
					<Card key={r.id} className="flex flex-col gap-3">
						<div className="flex flex-col">
							<span className="text-[15px] font-bold text-text">{r.userName}</span>
							<span className="text-[12px] text-text-secondary">{r.userEmail}</span>
							<span className="text-[12px] text-text-light">{r.circleTitle}</span>
						</div>
						<div className="flex gap-2">
							<button
								onClick={() => respond(r.id, "approved")}
								className="flex-1 rounded-md bg-primary py-2 text-[13px] font-semibold text-white"
							>
								{t("requests.approve")}
							</button>
							<button
								onClick={() => respond(r.id, "rejected")}
								className="flex-1 rounded-md border border-border bg-surface py-2 text-[13px] font-semibold text-text-secondary"
							>
								{t("requests.reject")}
							</button>
						</div>
					</Card>
				))
			)}
		</div>
	);
}
