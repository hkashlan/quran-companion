import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronRight, Minus, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button, Card } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { createCircleFn } from "@/server/queries";

export const Route = createFileRoute("/_protected/create-circle")({
	component: CreateCircle,
});

type Slot = { dayOfWeek: number; startTime: string; endTime: string };

function slotsOverlap(slots: Slot[]): boolean {
	const byDay = new Map<number, Slot[]>();
	for (const s of slots) {
		const day = byDay.get(s.dayOfWeek) ?? [];
		for (const other of day) {
			if (s.startTime < other.endTime && other.startTime < s.endTime) {
				return true;
			}
		}
		day.push(s);
		byDay.set(s.dayOfWeek, day);
	}
	return false;
}

function CreateCircle() {
	const { t } = useI18n();
	const navigate = useNavigate();

	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [location, setLocation] = useState("");
	const [reminderHours, setReminderHours] = useState(2);
	const [slots, setSlots] = useState<Slot[]>([]);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const hasInvalidRange = slots.some((s) => s.startTime >= s.endTime);
	const hasOverlap = slotsOverlap(slots);
	const canSave =
		title.trim().length > 0 && !hasInvalidRange && !hasOverlap && !saving;

	function addSlot() {
		setSlots((prev) => [
			...prev,
			{ dayOfWeek: 0, startTime: "17:00", endTime: "18:00" },
		]);
	}

	function updateSlot(index: number, patch: Partial<Slot>) {
		setSlots((prev) =>
			prev.map((s, i) => (i === index ? { ...s, ...patch } : s)),
		);
	}

	function removeSlot(index: number) {
		setSlots((prev) => prev.filter((_, i) => i !== index));
	}

	async function save() {
		setSaving(true);
		setError(null);
		const res = await createCircleFn({
			data: {
				title: title.trim(),
				description: description.trim() || undefined,
				location: location.trim() || undefined,
				reminderHoursBeforeStart: reminderHours,
				timeSlots: slots,
			},
		});
		setSaving(false);
		if (!res.ok) {
			setError(res.error);
			return;
		}
		navigate({ to: "/teacher" });
	}

	return (
		<div className="mx-auto flex min-h-screen max-w-md flex-col gap-3 bg-background p-4">
			<header className="flex items-center gap-2 pb-2">
				<button
					type="button"
					onClick={() => navigate({ to: "/teacher" })}
					className="text-text-secondary"
				>
					<ChevronRight size={24} />
				</button>
				<h1 className="text-[20px] font-bold text-text">
					{t("circle.create")}
				</h1>
			</header>

			<label className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
				<span className="text-[14px] font-semibold text-text">
					{t("circle.title")}
				</span>
				<input
					value={title}
					onChange={(e) => setTitle(e.target.value)}
					className="rounded-md border border-border bg-background px-3 py-2.5 text-[15px] text-text outline-none"
				/>
			</label>

			<label className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
				<span className="text-[14px] font-semibold text-text">
					{t("circle.description")}
				</span>
				<textarea
					value={description}
					onChange={(e) => setDescription(e.target.value)}
					rows={2}
					className="resize-none rounded-md border border-border bg-background px-3 py-2.5 text-[15px] text-text outline-none"
				/>
			</label>

			<label className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
				<span className="text-[14px] font-semibold text-text">
					{t("circle.location")}
				</span>
				<input
					value={location}
					onChange={(e) => setLocation(e.target.value)}
					className="rounded-md border border-border bg-background px-3 py-2.5 text-[15px] text-text outline-none"
				/>
			</label>

			<div className="flex items-center justify-between rounded-lg border border-border bg-surface p-3">
				<span className="text-[14px] font-semibold text-text">
					{t("circle.reminderHours")}
				</span>
				<div className="flex items-center gap-3">
					<button
						type="button"
						onClick={() => setReminderHours((h) => Math.max(0, h - 1))}
						className="flex h-8 w-8 items-center justify-center rounded-md bg-primary-light text-primary"
					>
						<Minus size={16} />
					</button>
					<span className="min-w-6 text-center text-[16px] font-bold text-text">
						{reminderHours}
					</span>
					<button
						type="button"
						onClick={() => setReminderHours((h) => Math.min(24, h + 1))}
						className="flex h-8 w-8 items-center justify-center rounded-md bg-primary-light text-primary"
					>
						<Plus size={16} />
					</button>
				</div>
			</div>

			<div className="flex flex-col gap-2">
				<div className="flex items-center justify-between px-1">
					<span className="text-[14px] font-semibold text-text">
						{t("circle.timeSlots")}
					</span>
					<button
						type="button"
						onClick={addSlot}
						className="flex items-center gap-1 rounded-md bg-primary-light px-2 py-1 text-[12px] font-semibold text-primary"
					>
						<Plus size={14} /> {t("circle.addSlot")}
					</button>
				</div>

				{slots.map((slot, index) => {
					const invalid = slot.startTime >= slot.endTime;
					return (
						<Card
							key={`${index}-${slot.dayOfWeek}`}
							className="flex flex-col gap-2"
						>
							<div className="flex items-center gap-2">
								<select
									value={slot.dayOfWeek}
									onChange={(e) =>
										updateSlot(index, { dayOfWeek: Number(e.target.value) })
									}
									className="flex-1 rounded-md border border-border bg-background px-2 py-2 text-[14px] font-semibold text-text outline-none"
								>
									{[0, 1, 2, 3, 4, 5, 6].map((d) => (
										<option key={d} value={d}>
											{t(`day.${d}`)}
										</option>
									))}
								</select>
								<button
									type="button"
									onClick={() => removeSlot(index)}
									className="flex h-9 w-9 items-center justify-center rounded-md bg-background text-text-light"
									aria-label={t("circle.remove")}
								>
									<Trash2 size={16} />
								</button>
							</div>
							<div className="flex items-center gap-2">
								<label className="flex flex-1 items-center gap-2">
									<span className="text-[12px] text-text-secondary">
										{t("circle.from")}
									</span>
									<input
										type="time"
										value={slot.startTime}
										onChange={(e) =>
											updateSlot(index, { startTime: e.target.value })
										}
										className="flex-1 rounded-md border border-border bg-background px-2 py-2 text-[14px] text-text outline-none"
									/>
								</label>
								<label className="flex flex-1 items-center gap-2">
									<span className="text-[12px] text-text-secondary">
										{t("circle.to")}
									</span>
									<input
										type="time"
										value={slot.endTime}
										onChange={(e) =>
											updateSlot(index, { endTime: e.target.value })
										}
										className="flex-1 rounded-md border border-border bg-background px-2 py-2 text-[14px] text-text outline-none"
									/>
								</label>
							</div>
							{invalid ? (
								<span className="text-[12px] font-semibold text-red-600">
									{t("circle.invalidRange")}
								</span>
							) : null}
						</Card>
					);
				})}

				{hasOverlap ? (
					<span className="px-1 text-[12px] font-semibold text-red-600">
						{t("circle.overlap")}
					</span>
				) : null}
			</div>

			{error ? (
				<span className="px-1 text-[13px] font-semibold text-red-600">
					{error}
				</span>
			) : null}

			<Button
				onClick={save}
				loading={saving}
				disabled={!canSave}
				className="mt-2"
			>
				{t("circle.save")}
			</Button>
		</div>
	);
}
