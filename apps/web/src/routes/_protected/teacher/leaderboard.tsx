import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, Check, ClipboardList, Crown, Flame } from "lucide-react";
import { useState } from "react";
import { Ring } from "@/components/DailyProgress";
import { useI18n } from "@/lib/i18n";
import { getLeaderboardData, getTeacherToday, nudgeStudent } from "@/server/queries";

type Period = "weekly" | "monthly" | "overall";
const MEDAL = ["#C8A44E", "#9CA3AF", "#B45309"];

export const Route = createFileRoute("/_protected/teacher/leaderboard")({
	loader: async () => ({
		leaderboard: await getLeaderboardData({ data: { period: "overall" } }),
		today: await getTeacherToday(),
	}),
	component: TeacherLeaderboard,
});

type TodayStudent = {
	id: string;
	name: string;
	today: { target: number; done: number; over: number; status: string } | null;
};

/** One student row in the "Today" section: progress, a remind nudge, plan link. */
function TodayRow({ student }: { student: TodayStudent }) {
	const { t } = useI18n();
	const [sending, setSending] = useState(false);
	const [sent, setSent] = useState(false);
	const tdy = student.today;
	const met = tdy != null && tdy.done >= tdy.target;
	const pct = tdy ? tdy.done / tdy.target : 0;

	async function remind() {
		setSending(true);
		const res = await nudgeStudent({ data: { studentId: student.id } });
		setSending(false);
		if (res.ok) {
			setSent(true);
			setTimeout(() => setSent(false), 2000);
		}
	}

	return (
		<div className="flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-2">
			{tdy ? <Ring pct={pct} size={40} stroke={5} /> : null}
			<div className="flex flex-1 flex-col gap-0.5">
				<span className="text-[13px] font-bold text-text">{student.name}</span>
				{tdy ? (
					<>
						<span
							className={`flex items-center gap-1 text-[12px] font-semibold ${
								met ? "text-success" : "text-text-secondary"
							}`}
						>
							{met ? <Check size={13} /> : null}
							{t("leaderboard.pagesDone", {
								done: tdy.done,
								target: tdy.target,
							})}
						</span>
						{tdy.over > 0 ? (
							<span className="text-[11px] font-semibold text-primary">
								{t("leaderboard.plus", { over: tdy.over })}
							</span>
						) : null}
					</>
				) : (
					<span className="text-[12px] text-text-light">
						{t("leaderboard.noPlanToday")}
					</span>
				)}
			</div>
			<button
				type="button"
				onClick={remind}
				disabled={sending}
				className="flex items-center gap-1 rounded-md bg-accent-light px-2 py-1.5 text-[11px] font-semibold text-text disabled:opacity-60"
			>
				{sent ? <Check size={13} /> : <Bell size={13} />}
				{sent ? t("leaderboard.reminded") : t("leaderboard.remind")}
			</button>
			<Link
				to="/assign-review"
				search={{ studentId: student.id }}
				className="flex items-center gap-1 rounded-md bg-primary-light px-2 py-1.5 text-[11px] font-semibold text-primary"
			>
				<ClipboardList size={13} /> {t("leaderboard.plan")}
			</Link>
		</div>
	);
}

function TeacherLeaderboard() {
	const { t } = useI18n();
	const { leaderboard: initial, today } = Route.useLoaderData();
	const [period, setPeriod] = useState<Period>("overall");
	const [data, setData] = useState(initial);
	const periods: Period[] = ["weekly", "monthly", "overall"];

	async function pick(p: Period) {
		setPeriod(p);
		setData(await getLeaderboardData({ data: { period: p } }));
	}

	return (
		<div className="flex flex-col gap-4 p-4">
			<h1 className="text-[22px] font-bold text-text">
				{t("leaderboard.today")}
			</h1>
			<div className="flex flex-col gap-3">
				{today.circles.map((c) => (
					<div key={c.id} className="flex flex-col gap-2">
						<h2 className="text-[13px] font-bold text-text">{c.title}</h2>
						{c.students.length > 0 ? (
							c.students.map((s) => <TodayRow key={s.id} student={s} />)
						) : (
							<span className="text-[12px] text-text-light">
								{t("teacher.members")}: 0
							</span>
						)}
					</div>
				))}
			</div>

			<h2 className="mt-2 text-[15px] font-bold text-text">
				{t("leaderboard.ranking")}
			</h2>
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
				{data.entries.map((e) => (
					<div
						key={e.id}
						className="flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-2"
					>
						<div
							className="flex h-11 w-11 items-center justify-center rounded-md"
							style={{
								background: e.rank <= 3 ? `${MEDAL[e.rank - 1]}33` : "#F5F7F4",
							}}
						>
							{e.rank <= 3 ? (
								<Crown size={20} color={MEDAL[e.rank - 1]} />
							) : (
								<span className="text-[13px] font-bold text-text-secondary">
									{e.rank}
								</span>
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
