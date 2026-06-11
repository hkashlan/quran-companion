import { createFileRoute, useRouteContext } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/app")({ component: AppHome });

/**
 * Placeholder home. Phase 3 splits this into the student tabs (home, progress,
 * leaderboard, notifications, settings) and teacher tabs (students, requests,
 * leaderboard, notifications, settings) based on `session.user.role`.
 */
function AppHome() {
	const { session } = useRouteContext({ from: "/_protected" });
	return (
		<main className="mx-auto max-w-md p-6">
			<h1 className="text-xl font-bold text-primary">
				أهلاً، {session.user.name}
			</h1>
			<p className="mt-2 text-text-secondary">
				الدور: {(session.user as { role?: string }).role ?? "—"}
			</p>
			<p className="mt-6 rounded-md bg-accent-light p-4 text-sm">
				Phase 0 scaffold. Screens are ported in Phase 3 — see MIGRATION_PLAN.md.
			</p>
		</main>
	);
}
