import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export type Tab = {
	to: string;
	icon: ReactNode;
	label: string;
	badge?: number;
};

/** Fixed bottom tab bar (mobile-style), active tint emerald. */
export function BottomTabBar({ tabs }: { tabs: Tab[] }) {
	return (
		<nav className="fixed inset-x-0 bottom-0 z-40 flex h-14 items-stretch border-t border-border bg-surface">
			{tabs.map((tab) => (
				<Link
					key={tab.to}
					to={tab.to}
					activeOptions={{
						exact: tab.to.endsWith("/student") || tab.to.endsWith("/teacher"),
					}}
					className="relative flex flex-1 flex-col items-center justify-center gap-0.5 text-text-light [&.active]:text-primary"
				>
					<span className="relative">
						{tab.icon}
						{tab.badge ? (
							<span className="absolute -end-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[10px] font-bold text-white">
								{tab.badge}
							</span>
						) : null}
					</span>
					<span className="text-[10px]">{tab.label}</span>
				</Link>
			))}
		</nav>
	);
}
