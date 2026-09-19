import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Crown, Flame } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { getLeaderboardData } from "@/server/queries";

type Period = "weekly" | "monthly" | "overall";

export const Route = createFileRoute("/_protected/student/leaderboard")({
	loader: async () => getLeaderboardData({ data: { period: "monthly" } }),
	component: Leaderboard,
});

const MEDAL = ["#C8A44E", "#9CA3AF", "#B45309"];

type Entry = {
	rank: number;
	id: string;
	name: string;
	points: number;
	streak: number;
};

/**
 * Entries already carry shared ranks, so everyone tied on points repeats the
 * same rank in a row. Collapse each of those runs into one leaderboard row.
 */
function groupByRank(
	entries: Entry[],
): { rank: number; points: number; members: Entry[] }[] {
	const groups: { rank: number; points: number; members: Entry[] }[] = [];
	for (const e of entries) {
		const last = groups[groups.length - 1];
		if (last && last.rank === e.rank) last.members.push(e);
		else groups.push({ rank: e.rank, points: e.points, members: [e] });
	}
	return groups;
}

function Leaderboard() {
	const { t } = useI18n();
	const router = useRouter();
	const initial = Route.useLoaderData();
	const [period, setPeriod] = useState<Period>("monthly");
	const [data, setData] = useState(initial);

	async function pick(p: Period) {
		setPeriod(p);
		setData(await getLeaderboardData({ data: { period: p } }));
		router.invalidate();
	}

	const periods: Period[] = ["monthly", "weekly", "overall"];
	const groups = groupByRank(data.entries);

	return (
		<div className="flex flex-col gap-4 p-4">
			<h1 className="text-[22px] font-bold text-text">
				{t("leaderboard.title")}
			</h1>
			<div className="flex gap-2">
				{periods.map((p) => (
					<button
						type="button"
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
				{groups.map((g) => {
					const hasMe = g.members.some((m) => m.id === data.meId);
					return (
						<div
							key={g.members[0].id}
							className={`flex items-center gap-2 rounded-md border px-2.5 py-2 ${
								hasMe
									? "border-primary bg-primary-light"
									: "border-border bg-surface"
							}`}
						>
							<div
								className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md"
								style={{
									background:
										g.rank <= 3 ? `${MEDAL[g.rank - 1]}33` : "#F5F7F4",
								}}
							>
								{g.rank <= 3 ? (
									<Crown size={20} color={MEDAL[g.rank - 1]} />
								) : (
									<span className="text-[13px] font-bold text-text-secondary">
										{g.rank}
									</span>
								)}
							</div>
							<div className="flex flex-1 flex-col gap-1">
								{g.members.map((m) => (
									<div key={m.id} className="flex flex-col">
										<span className="text-[13px] font-bold text-text">
											{m.name}
										</span>
										<span className="flex items-center gap-1 text-[12px] text-text-secondary">
											<Flame size={14} color="#C8A44E" /> {m.streak}
										</span>
									</div>
								))}
							</div>
							<span className="shrink-0 rounded-md bg-surface-elevated bg-[#F5F7F4] px-2.5 py-1.5 text-[13px] font-bold text-text">
								{g.points}
							</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}
