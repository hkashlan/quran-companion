import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { getLateStudents, messageLateStudents } from "@/server/queries";

export const Route = createFileRoute("/_protected/teacher/late-students")({
	loader: async () => getLateStudents(),
	component: LateStudents,
});

const QUICK_EMOJIS = [
	"👏",
	"🌟",
	"📖",
	"💪",
	"⏰",
	"🤲",
	"❤️",
	"😊",
	"🔥",
	"✨",
];

function LateStudents() {
	const { t } = useI18n();
	const navigate = useNavigate();
	const { students } = Route.useLoaderData();

	// All late students are selected by default; the teacher can unselect some.
	const [selected, setSelected] = useState<Set<string>>(
		() => new Set(students.map((s) => s.id)),
	);
	const [message, setMessage] = useState("");
	const [sending, setSending] = useState(false);
	const [sent, setSent] = useState(false);

	const allSelected = students.length > 0 && selected.size === students.length;

	function toggle(id: string) {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}

	function toggleAll() {
		setSelected(allSelected ? new Set() : new Set(students.map((s) => s.id)));
	}

	async function send() {
		const trimmed = message.trim();
		if (!trimmed || selected.size === 0) return;
		setSending(true);
		const res = await messageLateStudents({
			data: { studentIds: [...selected], message: trimmed },
		});
		setSending(false);
		if (res.ok) {
			setSent(true);
			setMessage("");
			setTimeout(() => navigate({ to: "/teacher/leaderboard" }), 1500);
		}
	}

	return (
		<div className="flex flex-col gap-4 p-4">
			<header className="flex items-center gap-2">
				<button
					type="button"
					onClick={() => navigate({ to: "/teacher/leaderboard" })}
					className="text-text-secondary"
				>
					<ChevronRight size={24} />
				</button>
				<h1 className="text-[20px] font-bold text-text">{t("late.title")}</h1>
			</header>

			{students.length === 0 ? (
				<p className="mt-8 text-center text-[14px] text-text-secondary">
					{t("late.none")}
				</p>
			) : (
				<>
					<p className="text-[13px] text-text-secondary">
						{t("late.subtitle")}
					</p>

					{/* Message with a quick emoji bar. */}
					<div className="flex flex-col gap-2">
						<span className="text-[13px] font-bold text-text">
							{t("late.message")}
						</span>
						<div className="flex flex-wrap gap-1.5">
							{QUICK_EMOJIS.map((e) => (
								<button
									type="button"
									key={e}
									onClick={() => setMessage((m) => m + e)}
									className="rounded-md border border-border bg-surface px-2 py-1 text-[18px]"
								>
									{e}
								</button>
							))}
						</div>
						<textarea
							value={message}
							onChange={(ev) => setMessage(ev.target.value)}
							placeholder={t("late.placeholder")}
							rows={3}
							maxLength={500}
							className="w-full resize-none rounded-lg border border-border bg-surface p-3 text-[16px] text-text outline-none placeholder:text-text-light"
						/>
					</div>

					{/* Recipients — all preselected, teacher can unselect some. */}
					<div className="flex items-center justify-between">
						<span className="text-[13px] font-bold text-text">
							{t("late.selected", { count: selected.size })}
						</span>
						<button
							type="button"
							onClick={toggleAll}
							className="text-[12px] font-semibold text-primary"
						>
							{t("late.selectAll")}
						</button>
					</div>
					<div className="flex flex-col gap-2">
						{students.map((s) => {
							const on = selected.has(s.id);
							return (
								<button
									type="button"
									key={s.id}
									onClick={() => toggle(s.id)}
									className="flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-2.5 text-start"
								>
									<span
										className={`flex h-5 w-5 items-center justify-center rounded border ${
											on
												? "border-primary bg-primary text-white"
												: "border-border bg-transparent"
										}`}
									>
										{on ? <Check size={14} /> : null}
									</span>
									<span className="flex flex-1 flex-col gap-0.5">
										<span className="text-[14px] font-bold text-text">
											{s.name}
										</span>
										<span className="text-[12px] text-text-secondary">
											{t("leaderboard.pagesDone", {
												done: s.done,
												target: s.target,
											})}
										</span>
									</span>
								</button>
							);
						})}
					</div>

					<Button
						onClick={send}
						loading={sending}
						disabled={!message.trim() || selected.size === 0 || sent}
					>
						{sent ? t("late.sent") : t("late.send")}
					</Button>
				</>
			)}
		</div>
	);
}
