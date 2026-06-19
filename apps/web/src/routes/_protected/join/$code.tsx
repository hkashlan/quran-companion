import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button, Card, Spinner } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { joinCircleByCode } from "@/server/queries";

export const Route = createFileRoute("/_protected/join/$code")({
	component: JoinCircle,
});

/**
 * Landing page for a teacher's shared join link (/join/<code>). Auto-submits a
 * join request for the code so the student lands here, lets the teacher approve,
 * and shows the outcome — mirrors the manual "enter code" flow on the home screen.
 */
function JoinCircle() {
	const { t } = useI18n();
	const navigate = useNavigate();
	const { code } = Route.useParams();
	const [pending, setPending] = useState(true);
	const [msg, setMsg] = useState("");
	const [ok, setOk] = useState(false);
	const ran = useRef(false);

	useEffect(() => {
		if (ran.current) return;
		ran.current = true;
		(async () => {
			const res = await joinCircleByCode({ data: { code: code.trim() } });
			if (res.ok) {
				setOk(true);
				setMsg(t("home.requestSent"));
			} else {
				setMsg(
					t(
						res.error === "not_found"
							? "home.notFound"
							: res.error === "already_member"
								? "home.alreadyMember"
								: "home.alreadyRequested",
					),
				);
			}
			setPending(false);
		})();
	}, [code, t]);

	return (
		<div className="flex flex-col gap-4 p-4">
			<Card className="flex flex-col items-center gap-3 py-8 text-center">
				<p className="text-[16px] font-bold text-text">{t("join.title")}</p>
				<p className="text-[13px] font-semibold tracking-wider text-text-secondary">
					{code}
				</p>
				{pending ? (
					<Spinner />
				) : (
					<p
						className={`text-[14px] font-semibold ${ok ? "text-primary" : "text-error"}`}
					>
						{msg}
					</p>
				)}
				<Button
					variant="outline"
					onClick={() => navigate({ to: "/" })}
					disabled={pending}
				>
					{t("join.backHome")}
				</Button>
			</Card>
		</div>
	);
}
