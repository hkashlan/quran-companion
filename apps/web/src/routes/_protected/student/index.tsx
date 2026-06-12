import { createFileRoute, useRouter } from "@tanstack/react-router";
import { BookOpen, MapPin, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Card, Section, StatCard, TextInput } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { getStudentHome, joinCircleByCode } from "@/server/queries";

export const Route = createFileRoute("/_protected/student/")({
	loader: async () => getStudentHome(),
	component: StudentHome,
});

function useCountdownToMidnight() {
	const [text, setText] = useState("--:--");
	useEffect(() => {
		const tick = () => {
			const now = new Date();
			const midnight = new Date(now);
			midnight.setHours(24, 0, 0, 0);
			const mins = Math.floor((midnight.getTime() - now.getTime()) / 60000);
			setText(
				`${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`,
			);
		};
		tick();
		const id = setInterval(tick, 30000);
		return () => clearInterval(id);
	}, []);
	return text;
}

function reviewRange(r: {
	surahName: string;
	verseFrom: number;
	verseTo: number;
	endSurahName: string | null;
	rangeMode: string;
	startPage: number | null;
	endPage: number | null;
}): string {
	if (r.rangeMode === "pages" && r.startPage && r.endPage)
		return `ص ${r.startPage}–${r.endPage}`;
	const end =
		r.endSurahName && r.endSurahName !== r.surahName
			? ` – ${r.endSurahName}`
			: "";
	return `${r.surahName}${end}: ${r.verseFrom}–${r.verseTo}`;
}

function StudentHome() {
	const { t } = useI18n();
	const router = useRouter();
	const data = Route.useLoaderData();
	const countdown = useCountdownToMidnight();
	const [code, setCode] = useState("");
	const [joining, setJoining] = useState(false);
	const [joinMsg, setJoinMsg] = useState<string | null>(null);

	async function join() {
		if (!code.trim()) return;
		setJoining(true);
		setJoinMsg(null);
		const res = await joinCircleByCode({ data: { code: code.trim() } });
		setJoining(false);
		if (res.ok) {
			setJoinMsg(`✓ ${res.circleTitle}`);
			setCode("");
			router.invalidate();
		} else {
			setJoinMsg("✗");
		}
	}

	return (
		<div className="flex flex-col gap-4 p-4">
			<header className="flex items-center justify-between pt-2">
				<h1 className="text-[22px] font-bold text-text">
					{t("home.greeting", { name: data.user.name })}
				</h1>
				<div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-white">
					{data.user.name.slice(0, 1)}
				</div>
			</header>

			<div className="flex gap-2">
				<StatCard
					value={data.stats.points}
					label={t("home.points")}
					tone="primary"
				/>
				<StatCard
					value={data.stats.completed}
					label={t("home.completed")}
					tone="success"
				/>
				<StatCard
					value={`${data.stats.onTime}%`}
					label={t("home.onTime")}
					tone="warning"
				/>
				<StatCard
					value={data.stats.streak}
					label={t("home.streak")}
					tone="secondary"
				/>
			</div>

			<div className="flex items-center justify-center gap-2 text-secondary">
				<span className="text-[16px] font-bold">{countdown}</span>
				<span className="text-[13px] text-text-secondary">
					{t("home.timeRemaining")}
				</span>
			</div>

			{data.circles.length === 0 ? (
				<Card className="flex flex-col items-center gap-3 text-center">
					<BookOpen className="text-primary" size={36} />
					<p className="text-[15px] font-bold text-text">
						{t("home.noCircle")}
					</p>
					<p className="text-[13px] text-text-secondary">
						{t("home.findCircle")}
					</p>
					<div className="flex w-full gap-2">
						<TextInput
							placeholder={t("home.enterCode")}
							value={code}
							onChange={(e) => setCode(e.target.value.toUpperCase())}
							maxLength={8}
						/>
						<button
							type="button"
							onClick={join}
							disabled={joining}
							className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-lg bg-primary text-white disabled:opacity-60"
						>
							<Search size={22} />
						</button>
					</div>
					{joinMsg ? (
						<p className="text-[13px] text-text-secondary">{joinMsg}</p>
					) : null}
				</Card>
			) : (
				<Section title={t("home.myCircles")}>
					<Card className="flex flex-col gap-3 p-3">
						{data.circles.map((c) => (
							<div
								key={c.id}
								className="flex flex-col gap-1 border-b border-border pb-3 last:border-0 last:pb-0"
							>
								<div className="flex items-center justify-between">
									<span className="text-[14px] font-bold text-text">
										{c.title}
									</span>
									<span className="text-[12px] text-text-secondary">
										{c.code}
									</span>
								</div>
								{c.description ? (
									<span className="text-[12px] text-text-secondary">
										{c.description}
									</span>
								) : null}
								{c.location ? (
									<span className="flex items-center gap-1 text-[12px] text-text-light">
										<MapPin size={12} /> {c.location}
									</span>
								) : null}
							</div>
						))}
					</Card>
				</Section>
			)}

			<Section title={t("home.activeReview")}>
				{data.activeReview ? (
					<Card className="flex flex-col gap-3">
						<span className="rounded-md bg-primary-light px-3 py-2 text-center text-[15px] font-bold text-primary">
							{reviewRange(data.activeReview)}
						</span>
						<Button
							onClick={() =>
								router.navigate({
									to: "/submit-review",
									search: { reviewId: data.activeReview?.id },
								})
							}
						>
							{t("home.submit")}
						</Button>
					</Card>
				) : (
					<Card className="text-center text-[13px] text-text-secondary">
						{t("home.noActiveReview")}
					</Card>
				)}
			</Section>

			{data.undoneReviews.length > 0 ? (
				<Section title={t("home.pendingReviews")}>
					<Card className="flex flex-col gap-2 p-3">
						{data.undoneReviews.map((r) => (
							<div
								key={r.id}
								className="flex items-center justify-between gap-2 text-[12px]"
							>
								<span className="flex items-center gap-2">
									<span
										className={`h-2 w-2 rounded-full ${r.status === "missed" ? "bg-error" : "bg-text-light"}`}
									/>
									<span className="text-text">{reviewRange(r)}</span>
								</span>
								<span className="text-text-light">{r.assignedDate}</span>
							</div>
						))}
					</Card>
				</Section>
			) : null}
		</div>
	);
}
