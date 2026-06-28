import type {
	ButtonHTMLAttributes,
	InputHTMLAttributes,
	ReactNode,
} from "react";

/** Shared primitives themed to the ported design tokens (emerald / Cairo). */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
	variant?: "primary" | "outline" | "ghost" | "danger";
	loading?: boolean;
};

export function Button({
	variant = "primary",
	loading,
	disabled,
	className = "",
	children,
	...rest
}: ButtonProps) {
	const base =
		"h-[54px] w-full rounded-lg font-semibold text-[17px] transition active:scale-[0.98] disabled:opacity-60 flex items-center justify-center";
	const variants = {
		primary: "bg-primary text-white",
		outline: "border-2 border-primary text-primary bg-transparent",
		ghost: "bg-transparent text-primary",
		danger: "bg-error text-white",
	};
	return (
		<button
			disabled={disabled || loading}
			className={`${base} ${variants[variant]} ${className}`}
			{...rest}
		>
			{loading ? <Spinner /> : children}
		</button>
	);
}

export function TextInput({
	icon,
	className = "",
	...rest
}: InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode }) {
	return (
		<div className="flex h-[54px] items-center gap-3 rounded-lg border border-border bg-surface px-4">
			{icon ? <span className="text-text-light">{icon}</span> : null}
			<input
				className={`h-full flex-1 bg-transparent text-[16px] text-text outline-none placeholder:text-text-light ${className}`}
				{...rest}
			/>
		</div>
	);
}

export function Card({
	className = "",
	children,
}: {
	className?: string;
	children: ReactNode;
}) {
	return (
		<div
			className={`rounded-xl border border-border bg-surface p-4 ${className}`}
		>
			{children}
		</div>
	);
}

export function StatCard({
	value,
	label,
	tone = "primary",
	onClick,
}: {
	value: ReactNode;
	label: string;
	tone?: "primary" | "success" | "warning" | "secondary";
	onClick?: () => void;
}) {
	const toneBg = {
		primary: "bg-accent-light",
		success: "bg-primary-light",
		warning: "bg-accent-light",
		secondary: "bg-secondary-light",
	}[tone];
	return (
		<button
			type="button"
			onClick={onClick}
			className={`flex flex-1 flex-col items-center gap-1 rounded-md border border-border ${toneBg} px-1 py-2 active:opacity-80`}
		>
			<span className="text-[18px] font-bold text-text">{value}</span>
			<span className="text-center text-[9px] text-text-secondary">
				{label}
			</span>
		</button>
	);
}

export function Spinner() {
	return (
		<span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
	);
}

export function Section({
	title,
	children,
	className = "",
}: {
	title?: string;
	children: ReactNode;
	className?: string;
}) {
	return (
		<section className={`flex flex-col gap-3 ${className}`}>
			{title ? (
				<h2 className="text-[13px] font-bold text-text">{title}</h2>
			) : null}
			{children}
		</section>
	);
}

/**
 * In-app confirmation modal. Replaces `window.confirm`, which is unreliable in
 * the Capacitor native shell / installed PWA (it can return false without ever
 * showing a dialog, silently swallowing the action). Controlled via `open`.
 */
export function ConfirmDialog({
	open,
	message,
	confirmLabel,
	cancelLabel,
	onConfirm,
	onCancel,
	loading = false,
	destructive = true,
}: {
	open: boolean;
	message: string;
	confirmLabel: string;
	cancelLabel: string;
	onConfirm: () => void;
	onCancel: () => void;
	loading?: boolean;
	destructive?: boolean;
}) {
	if (!open) return null;
	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
			<button
				type="button"
				aria-label={cancelLabel}
				onClick={onCancel}
				className="absolute inset-0 bg-black/40"
			/>
			<div className="relative w-full max-w-sm rounded-xl bg-surface p-5 shadow-xl">
				<p className="text-[15px] font-semibold text-text">{message}</p>
				<div className="mt-5 flex gap-2">
					<Button variant="outline" onClick={onCancel} disabled={loading}>
						{cancelLabel}
					</Button>
					<Button
						variant={destructive ? "danger" : "primary"}
						onClick={onConfirm}
						loading={loading}
					>
						{confirmLabel}
					</Button>
				</div>
			</div>
		</div>
	);
}
