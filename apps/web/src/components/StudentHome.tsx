import { Link, useRouter } from "@tanstack/react-router";
import {
	BookOpen,
	ChevronDown,
	Clock,
	LogOut,
	MapPin,
	Search,
	SlidersHorizontal,
	Users,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { BacklogSection } from "@/components/BacklogList";
import { DailyProgress } from "@/components/DailyProgress";
import { ExcuseDayButton } from "@/components/ExcuseDayButton";
import { PlanResetCard } from "@/components/PlanResetCard";
import {
	Button,
	Card,
	ConfirmDialog,
	Section,
	StatCard,
	TextInput,
} from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { reviewRange } from "@/lib/review-range";
import {
	type getStudentHome,
	joinCircleByCode,
	leaveCircleFn,
	submitReview,
} from "@/server/queries";

export type StudentHomeData = Awaited<ReturnType<typeof getStudentHome>>;

/** Scroll target shared by the backlog "reset your plan" CTA and the card. */
const RESET_ANCHOR = "plan-reset-card";

type EditableReview = {
	id: string;
	startPage: number | null;
	endPage: number | null;
	progressPage: number | null;
};

/**
 * Inline "what I did today" editor for a pages review on the home card. Lets the
 * student report the page they've reached — including past the day's target — and
 * change it any time; progress is monotonic so the ring only ever climbs.
 */
function PagesProgressEditor({ review }: { review: EditableReview }) {
	const { t } = useI18n();
	const router = useRouter();
	const start = review.startPage ?? 1;
	const end = review.endPage ?? start;
	// Keep the raw text so the student can edit freely (clear it, type a couple
	// of digits) without the value being clamped out from under them on every
	// keystroke. We validate the parsed number and only enable Save when it's in
	// range — reaching past the day's target (up to the last mushaf page) is fine.
	const [text, setText] = useState(String(review.progressPage ?? end));
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);

	const parsed = Number.parseInt(text, 10);
	const valid = /^\d+$/.test(text.trim()) && parsed >= start && parsed <= 604;
	const showError = text.trim() !== "" && !valid;

	async function save() {
		if (!valid) return;
		setSaving(true);
		setSaved(false);
		const res = await submitReview({
			data: { reviewId: review.id, currentPage: parsed },
		});
		setSaving(false);
		if (res.ok) {
			setSaved(true);
			router.invalidate();
		}
	}

	return (
		<div className="flex flex-col gap-2">
			<span className="text-[13px] font-semibold text-text">
				{t("submit.currentPage")}
			</span>
			<div className="flex items-center gap-2">
				<input
					type="number"
					inputMode="numeric"
					min={start}
					max={604}
					value={text}
					onChange={(e) => {
						setText(e.target.value);
						setSaved(false);
					}}
					onFocus={(e) => e.currentTarget.select()}
					aria-invalid={showError}
					className={`h-[54px] w-24 rounded-lg border bg-background px-3 text-[15px] font-semibold text-text outline-none ${
						showError ? "border-error" : "border-border"
					}`}
				/>
				<Button
					onClick={save}
					loading={saving}
					disabled={!valid || parsed === review.progressPage}
				>
					{t("common.save")}
				</Button>
			</div>
			{showError ? (
				<p className="text-[12px] font-semibold text-error">
					{t("submit.pageRangeError", { from: start, to: 604 })}
				</p>
			) : (
				<span className="text-[12px] text-text-secondary">
					{t("submit.pagesHint", {
						from: start,
						to: end,
						reached: review.progressPage ?? "—",
					})}
				</span>
			)}
			{saved ? (
				<p className="text-[12px] font-semibold text-primary">
					{t("submit.savedKeepGoing")}
				</p>
			) : null}
		</div>
	);
}

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

/**
 * "No circle yet" card with the join-by-code box. Sends a join request the
 * circle's owner approves from their requests screen.
 */
export function JoinCircleCard() {
	const { t } = useI18n();
	const router = useRouter();
	const [code, setCode] = useState("");
	const [joining, setJoining] = useState(false);
	const [joinMsg, setJoinMsg] = useState<{ text: string; ok: boolean } | null>(
		null,
	);

	async function join() {
		if (!code.trim()) return;
		setJoining(true);
		setJoinMsg(null);
		const res = await joinCircleByCode({ data: { code: code.trim() } });
		setJoining(false);
		if (res.ok) {
			setJoinMsg({ text: t("home.requestSent"), ok: true });
			setCode("");
			router.invalidate();
		} else {
			const key =
				res.error === "not_found"
					? "home.notFound"
					: res.error === "already_member"
						? "home.alreadyMember"
						: "home.alreadyRequested";
			setJoinMsg({ text: t(key), ok: false });
		}
	}

	return (
		<Card className="flex flex-col items-center gap-3 text-center">
			<BookOpen className="text-primary" size={36} />
			<p className="text-[15px] font-bold text-text">{t("home.noCircle")}</p>
			<p className="text-[13px] text-text-secondary">{t("home.findCircle")}</p>
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
				<p
					className={`text-[13px] font-semibold ${joinMsg.ok ? "text-primary" : "text-error"}`}
				>
					{joinMsg.text}
				</p>
			) : null}
		</Card>
	);
}

/** Join requests still waiting for the circle owner's approval (hidden when none). */
export function PendingRequestsSection({
	requests,
}: {
	requests: StudentHomeData["pendingRequests"];
}) {
	const { t } = useI18n();
	if (requests.length === 0) return null;
	return (
		<Section title={t("home.pendingRequests")}>
			<Card className="flex flex-col gap-2 p-3">
				{requests.map((r) => (
					<div
						key={r.id}
						className="flex items-center justify-between gap-2 text-[13px]"
					>
						<span className="font-semibold text-text">{r.circleTitle}</span>
						<span className="flex items-center gap-1 text-[12px] text-text-light">
							<Clock size={13} /> {t("home.awaitingApproval")}
						</span>
					</div>
				))}
			</Card>
		</Section>
	);
}

/**
 * Header strip of the active-review card: the circle(s) the student reviews in,
 * tapping open to the details and the (rarely used) leave action, with `action`
 * (the plan chip) pinned to the other side.
 */
function CircleSummary({
	circles,
	onLeave,
	action,
}: {
	circles: StudentHomeData["circles"];
	onLeave: (circleId: string) => void;
	action: ReactNode;
}) {
	const { t } = useI18n();
	const [open, setOpen] = useState(false);
	const location = circles.find((c) => c.location)?.location;

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center justify-between gap-3">
				<button
					type="button"
					onClick={() => setOpen((o) => !o)}
					aria-expanded={open}
					className="flex min-w-0 items-center gap-2.5 text-start active:opacity-80"
				>
					<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-light text-primary">
						<Users size={18} />
					</span>
					<span className="flex min-w-0 flex-col">
						<span className="truncate text-[14px] font-bold text-text">
							{circles.map((c) => c.title).join(" · ")}
						</span>
						{location ? (
							<span className="flex items-center gap-1 truncate text-[12px] text-text-light">
								<MapPin size={12} className="shrink-0" /> {location}
							</span>
						) : null}
					</span>
					<ChevronDown
						size={16}
						className={`shrink-0 text-text-light transition-transform ${open ? "rotate-180" : ""}`}
					/>
				</button>
				{action}
			</div>

			{open
				? circles.map((c) => (
						<div
							key={c.id}
							className="flex flex-col gap-1.5 rounded-lg bg-background p-3"
						>
							{circles.length > 1 ? (
								<span className="text-[13px] font-bold text-text">
									{c.title}
								</span>
							) : null}
							{c.description ? (
								<span className="text-[12px] text-text-secondary">
									{c.description}
								</span>
							) : null}
							{circles.length > 1 && c.location ? (
								<span className="flex items-center gap-1 text-[12px] text-text-light">
									<MapPin size={12} /> {c.location}
								</span>
							) : null}
							<div className="flex items-center justify-between gap-2">
								<span className="text-[12px] text-text-secondary">
									{t("teacher.code")}:{" "}
									<span className="font-semibold text-text" dir="ltr">
										{c.code}
									</span>
								</span>
								<button
									type="button"
									onClick={() => onLeave(c.id)}
									className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-semibold text-error active:bg-error/10"
								>
									<LogOut size={13} /> {t("home.leave")}
								</button>
							</div>
						</div>
					))
				: null}
		</div>
	);
}

/**
 * Everything on the student home below the header: stat cards, today's review
 * (with the circle and the plan link folded into its card), the join box when
 * there's no circle, pending requests and outstanding reviews. Rendered at
 * /student, and embedded on the teacher home for a teacher who is also a
 * student in another teacher's circle.
 * Meant to sit inside a `flex flex-col gap-4` container.
 */
export function StudentHomeBody({
	data,
	planTo = "/student/plan",
}: {
	data: StudentHomeData;
	/** Where the plan chip leads — the teacher shell has its own copy of the editor. */
	planTo?: "/student/plan" | "/teacher/plan";
}) {
	const { t } = useI18n();
	const router = useRouter();
	const countdown = useCountdownToMidnight();
	// Circle pending a leave confirmation, or null when the dialog is closed.
	const [leavingId, setLeavingId] = useState<string | null>(null);
	const [leaving, setLeaving] = useState(false);
	const hasCircle = data.circles.length > 0;

	async function confirmLeave() {
		if (!leavingId) return;
		setLeaving(true);
		await leaveCircleFn({ data: { circleId: leavingId } });
		setLeaving(false);
		setLeavingId(null);
		router.invalidate();
	}

	const planChipClass =
		"flex shrink-0 items-center gap-1.5 rounded-full bg-primary-light px-3 py-1.5 text-[12px] font-semibold text-primary active:opacity-80";
	const planChipBody = (
		<>
			<SlidersHorizontal size={14} />
			{t("plan.title")}
		</>
	);
	const planChip =
		planTo === "/teacher/plan" ? (
			<Link to="/teacher/plan" className={planChipClass}>
				{planChipBody}
			</Link>
		) : (
			<Link to="/student/plan" className={planChipClass}>
				{planChipBody}
			</Link>
		);

	return (
		<>
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

			{hasCircle ? null : (
				<>
					<JoinCircleCard />
					<PendingRequestsSection requests={data.pendingRequests} />
				</>
			)}

			<section className="flex flex-col gap-3">
				<div className="flex items-center justify-between gap-2">
					<h2 className="text-[13px] font-bold text-text">
						{t("home.activeReview")}
					</h2>
					{data.activeReview ? (
						<span className="flex items-center gap-1.5 text-[12px] text-text-secondary">
							<Clock size={13} className="text-secondary" />
							<span className="text-[14px] font-bold text-secondary tabular-nums">
								{countdown}
							</span>
							{t("home.timeRemaining")}
						</span>
					) : null}
				</div>

				<Card className="flex flex-col gap-3">
					{hasCircle ? (
						<CircleSummary
							circles={data.circles}
							onLeave={setLeavingId}
							action={planChip}
						/>
					) : (
						<div className="flex justify-end">{planChip}</div>
					)}
					{data.hasPendingPlanChange ? (
						<span className="flex items-center gap-1 text-[12px] text-text-light">
							<Clock size={13} /> {t("plan.title")} ·{" "}
							{t("plan.awaitingApproval")}
						</span>
					) : null}

					<div className="border-t border-border" />

					{data.activeReview ? (
						<>
							<span className="rounded-md bg-primary-light px-3 py-2 text-center text-[15px] font-bold text-primary">
								{reviewRange(data.activeReview)}
							</span>
							<DailyProgress
								review={data.activeReview}
								streak={data.user.streak}
							/>
							{data.activeReview.status === "excused" ? null : data.activeReview
									.startPage != null ? (
								<PagesProgressEditor review={data.activeReview} />
							) : (
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
							)}
							<ExcuseDayButton date={data.activeReview.assignedDate} />
						</>
					) : (
						<p className="py-2 text-center text-[13px] text-text-secondary">
							{t("home.noActiveReview")}
						</p>
					)}
				</Card>
			</section>

			{hasCircle ? (
				<PendingRequestsSection requests={data.pendingRequests} />
			) : null}

			<BacklogSection
				backlog={data.backlog}
				resetCardShown={data.backlog.showResetCard}
			/>

			{data.backlog.showResetCard ? (
				<PlanResetCard anchorId={RESET_ANCHOR} />
			) : null}

			<ConfirmDialog
				open={leavingId !== null}
				message={t("home.leaveConfirm")}
				confirmLabel={t("home.leave")}
				cancelLabel={t("common.cancel")}
				loading={leaving}
				onConfirm={confirmLeave}
				onCancel={() => setLeavingId(null)}
			/>
		</>
	);
}
