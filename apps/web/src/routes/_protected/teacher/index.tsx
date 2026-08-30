import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarPlus, ClipboardList, Plus, Share2, Users } from "lucide-react";
import { useState } from "react";
import { PendingRequests } from "@/components/PendingRequests";
import { Card, Section } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import {
	getJoinRequests,
	getPlanChangeRequests,
	getTeacherHome,
} from "@/server/queries";

export const Route = createFileRoute("/_protected/teacher/")({
	loader: async () => {
		const [home, join, planChanges] = await Promise.all([
			getTeacherHome(),
			getJoinRequests(),
			getPlanChangeRequests(),
		]);
		return {
			...home,
			requests: join.requests,
			planChanges: planChanges.requests,
		};
	},
	component: TeacherHome,
});

/**
 * Share a circle's join link. Uses the native share sheet (great for sending via
 * WhatsApp/messages on mobile) and falls back to copying the link to clipboard.
 */
function ShareButton({ code }: { code: string }) {
	const { t } = useI18n();
	const [copied, setCopied] = useState(false);

	async function share() {
		const url = `${window.location.origin}/join/${code}`;
		// Prefer the native share sheet on mobile; ignore an in-progress/cancelled
		// share rather than surprising the user with a clipboard copy.
		if (navigator.share) {
			try {
				await navigator.share({
					title: t("appName"),
					text: t("teacher.shareText"),
					url,
				});
			} catch {
				// User cancelled or share rejected — do nothing.
			}
			return;
		}
		try {
			await navigator.clipboard.writeText(url);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// Clipboard blocked — nothing more we can do silently.
		}
	}

	return (
		<button
			type="button"
			onClick={share}
			className="flex items-center gap-1 rounded-md bg-primary-light px-2 py-1 text-[11px] font-semibold text-primary"
		>
			<Share2 size={13} />{" "}
			{copied ? t("teacher.linkCopied") : t("teacher.share")}
		</button>
	);
}

function TeacherHome() {
	const { t } = useI18n();
	const data = Route.useLoaderData();
	return (
		<div className="flex flex-col gap-4 p-4">
			<header className="flex items-center justify-between pt-2">
				<h1 className="text-[22px] font-bold text-text">
					{t("teacher.greeting", { name: data.user.name })}
				</h1>
				<div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-white">
					{data.user.name.slice(0, 1)}
				</div>
			</header>

			<PendingRequests
				requests={data.requests}
				planChanges={data.planChanges}
			/>

			<Link
				to="/create-circle"
				className="flex h-[54px] w-full items-center justify-center gap-2 rounded-lg bg-primary text-[17px] font-semibold text-white transition active:scale-[0.98]"
			>
				<Plus size={20} /> {t("circle.create")}
			</Link>

			<Section title={t("teacher.myCircles")}>
				{data.circles.map((c) => (
					<Card key={c.id} className="flex flex-col gap-2">
						<div className="flex items-center justify-between gap-2">
							<span className="text-[15px] font-bold text-text">{c.title}</span>
							<div className="flex items-center gap-2">
								<span className="text-[12px] text-text-secondary">
									{t("teacher.code")}: {c.code}
								</span>
								<ShareButton code={c.code} />
							</div>
						</div>
						{c.description ? (
							<span className="text-[13px] text-text-secondary">
								{c.description}
							</span>
						) : null}
						<span className="flex items-center gap-1 text-[12px] text-text-light">
							<Users size={14} /> {c.studentsCount} {t("teacher.members")}
						</span>
						{c.students.length > 0 ? (
							<div className="flex flex-col divide-y divide-border border-t border-border">
								{c.students.map((s) => (
									<div
										key={s.id}
										className="flex items-center justify-between gap-2 py-2"
									>
										<Link
											to="/student-detail"
											search={{ studentId: s.id }}
											className="text-[13px] font-semibold text-text underline-offset-2 hover:underline"
										>
											{s.name}
										</Link>
										<div className="flex gap-1">
											<Link
												to="/assign-review"
												search={{ studentId: s.id }}
												className="flex items-center gap-1 rounded-md bg-primary-light px-2 py-1 text-[11px] font-semibold text-primary"
											>
												<ClipboardList size={13} /> {t("teacher.assignReview")}
											</Link>
											<Link
												to="/add-session"
												search={{ studentId: s.id }}
												className="flex items-center gap-1 rounded-md bg-secondary-light px-2 py-1 text-[11px] font-semibold text-secondary"
											>
												<CalendarPlus size={13} /> {t("teacher.addSession")}
											</Link>
										</div>
									</div>
								))}
							</div>
						) : null}
					</Card>
				))}
			</Section>
		</div>
	);
}
