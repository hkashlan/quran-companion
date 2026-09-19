import { useRouter } from "@tanstack/react-router";
import { MessageCircle, X } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { markNotificationRead } from "@/server/queries";

export type TeacherMessage = { id: string; title: string; body: string };

/**
 * The newest unread teacher message, pinned to the top of every student screen
 * so it isn't lost among the other notifications. It stays until the student
 * closes it; closing marks that one notification read (nothing is deleted, so
 * the message is still in the notifications list afterwards).
 */
export function TeacherMessageBanner({ message }: { message: TeacherMessage }) {
	const { t } = useI18n();
	const router = useRouter();
	const [closed, setClosed] = useState(false);

	async function close() {
		setClosed(true); // hide immediately; the loader refresh confirms it
		await markNotificationRead({ data: { id: message.id } });
		router.invalidate();
	}

	if (closed) return null;

	return (
		<div className="sticky top-0 z-30 flex items-start gap-2 border-b border-primary bg-primary px-4 py-3 text-white shadow-md">
			<MessageCircle size={18} className="mt-0.5 shrink-0" />
			<div className="flex flex-1 flex-col gap-0.5">
				<span className="text-[12px] font-bold opacity-90">
					{message.title}
				</span>
				<span className="text-[14px] font-semibold leading-snug">
					{message.body}
				</span>
			</div>
			<button
				type="button"
				onClick={close}
				aria-label={t("notifications.dismiss")}
				className="-me-1 shrink-0 rounded-md p-1 active:bg-white/20"
			>
				<X size={18} />
			</button>
		</div>
	);
}
