import { useI18n } from "@/lib/i18n";
import { getLeaderboardData } from "@/server/queries";
import { createFileRoute } from "@tanstack/react-router";
import { Crown, Flame } from "lucide-react";
import { useState } from "react";

type Period = "weekly" | "monthly" | "overall";
const MEDAL = ["#C8A44E", "#9CA3AF", "#B45309"];

export const Route = createFileRoute("/_protected/teacher/leaderboard")({
	loader: async () => getLeaderboardData({ data: { period: "overall" } }),
	component: TeacherLeaderboard,
});

function TeacherLeaderboard() {
	const { t } = useI18n();
	const initial = Route.useLoaderData();
	const [period, setPeriod] = useState<Period>("overall");
	const [data, setData] = useState(initial);
	const periods: Period[] = ["weekly", "monthly", "overall"];

	async function pick(p: Period) {
		setPeriod(p);
		setData(await getLeaderboardData({ data: { period: p } }));
	}

	return (
		<div className="flex flex-col gap-4 p-4">
			<h1 className="text-[22px] font-bold text-text">{t("leaderboard.title")}</h1>
			<div className="flex gap-2">
				{periods.map((p) => (
					<button
						key={p}
						onClick={() => pick(p)}
						className={`rounded-md border px-3 py-1.5 text-[12px] font-semibold ${
							period === p
								? "border-primary bg-primary-light text-primary"
								: "border-border bg-surface text-text-secondary"
						}`}
					>
						{t(`leaderboard.${p}`)}
					</button>
				))}
			</div>
			<div className="flex flex-col gap-2">
				{data.entries.map((e) => (
					<div key={e.id} className="flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-2">
						<div
							className="flex h-11 w-11 items-center justify-center rounded-md"
							style={{ background: e.rank <= 3 ? `${MEDAL[e.rank - 1]}33` : "#F5F7F4" }}
						>
							{e.rank <= 3 ? (
								<Crown size={20} color={MEDAL[e.rank - 1]} />
							) : (
								<span className="text-[13px] font-bold text-text-secondary">{e.rank}</span>
							)}
						</div>
						<div className="flex flex-1 flex-col">
							<span className="text-[13px] font-bold text-text">{e.name}</span>
							<span className="flex items-center gap-1 text-[12px] text-text-secondary">
								<Flame size={14} color="#C8A44E" /> {e.streak}
							</span>
						</div>
						<span className="rounded-md bg-[#F5F7F4] px-2.5 py-1.5 text-[13px] font-bold text-text">
							{e.points}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}
