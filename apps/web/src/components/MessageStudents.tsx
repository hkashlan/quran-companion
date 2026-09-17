import { useNavigate } from "@tanstack/react-router";
import { BookmarkPlus, Check, ChevronRight, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { deleteMessageTemplate, messageStudents } from "@/server/queries";

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

export type MessageStudent = {
	id: string;
	name: string;
	done: number;
	target: number;
};

export type MessageTemplate = { id: string; body: string };

/** Which composer this is — scopes the saved messages it offers. */
export type MessageKind = "late" | "done";

/**
 * "Pick students, write a message, send it" screen — shared by the late-students
 * and done-students routes, which differ only in who they list and in the copy
 * around the list. Saved messages are scoped to `kind`: a chase-up and a
 * congratulation are never interchangeable, so each screen keeps its own set.
 */
export function MessageStudents({
	kind,
	title,
	subtitle,
	emptyText,
	students,
	templates: initialTemplates,
}: {
	kind: MessageKind;
	title: string;
	subtitle: string;
	emptyText: string;
	students: MessageStudent[];
	templates: MessageTemplate[];
}) {
	const { t } = useI18n();
	const navigate = useNavigate();

	// Everyone on the list is selected by default; the teacher can unselect some.
	const [selected, setSelected] = useState<Set<string>>(
		() => new Set(students.map((s) => s.id)),
	);
	const [message, setMessage] = useState("");
	const [sent, setSent] = useState(false);
	const [templates, setTemplates] = useState(initialTemplates);
	// Which of the two send buttons is in flight, so only it shows a spinner.
	const [pending, setPending] = useState<"send" | "sendAndSave" | null>(null);

	const allSelected = students.length > 0 && selected.size === students.length;
	const trimmed = message.trim();
	const alreadySaved = templates.some((tpl) => tpl.body === trimmed);
	const canSend = trimmed.length > 0 && selected.size > 0;

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

	/** `save` also stores the text as a template the teacher can reuse later. */
	async function send(save: boolean) {
		if (!trimmed || selected.size === 0 || pending) return;
		setPending(save ? "sendAndSave" : "send");
		const res = await messageStudents({
			data: {
				studentIds: [...selected],
				message: trimmed,
				kind,
				// Re-saving text that is already a template would be a no-op anyway.
				saveTemplate: save && !alreadySaved,
			},
		});
		setPending(null);
		if (res.ok) {
			setSent(true);
			setMessage("");
			setTimeout(() => navigate({ to: "/teacher/leaderboard" }), 1500);
		}
	}

	async function removeTemplate(id: string) {
		setTemplates((prev) => prev.filter((tpl) => tpl.id !== id));
		await deleteMessageTemplate({ data: { id } });
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
				<h1 className="text-[20px] font-bold text-text">{title}</h1>
			</header>

			{students.length === 0 ? (
				<p className="mt-8 text-center text-[14px] text-text-secondary">
					{emptyText}
				</p>
			) : (
				<>
					<p className="text-[13px] text-text-secondary">{subtitle}</p>

					{/* Saved messages — tap one to drop it into the composer. */}
					{templates.length > 0 ? (
						<div className="flex flex-col gap-2">
							<span className="text-[13px] font-bold text-text">
								{t("late.saved")}
							</span>
							<div className="flex flex-col gap-1.5">
								{templates.map((tpl) => (
									<div
										key={tpl.id}
										className="flex items-center gap-2 rounded-md border border-border bg-surface ps-3 pe-1"
									>
										<button
											type="button"
											onClick={() => setMessage(tpl.body)}
											className="flex-1 truncate py-2 text-start text-[13px] text-text"
										>
											{tpl.body}
										</button>
										<button
											type="button"
											onClick={() => removeTemplate(tpl.id)}
											aria-label={t("late.deleteSaved")}
											className="p-2 text-text-light"
										>
											<X size={16} />
										</button>
									</div>
								))}
							</div>
						</div>
					) : null}

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
					{/* Second send that also keeps the phrasing. Hidden once the draft is
					    already a saved template — there would be nothing left to save. */}
					{alreadySaved ? null : (
						<Button
							variant="outline"
							onClick={() => send(true)}
							loading={pending === "sendAndSave"}
							disabled={!canSend || pending !== null || sent}
						>
							<BookmarkPlus size={18} className="me-2" />
							{t("late.sendAndSave")}
						</Button>
					)}
					<Button
						onClick={() => send(false)}
						loading={pending === "send"}
						disabled={!canSend || pending !== null || sent}
					>
						{sent ? t("late.sent") : t("late.send")}
					</Button>
				</>
			)}
		</div>
	);
}
