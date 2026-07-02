import {
	createRootRoute,
	HeadContent,
	Outlet,
	Scripts,
} from "@tanstack/react-router";

import { I18nProvider } from "@/lib/i18n";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1, viewport-fit=cover",
			},
			{ name: "theme-color", content: "#0a7b4f" },
			{ title: "Quran Companion" },
		],
		links: [
			{ rel: "stylesheet", href: appCss },
			{ rel: "manifest", href: "/manifest.webmanifest" },
			{ rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
			// iOS ignores the manifest for "Add to Home Screen" and uses this.
			{ rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" },
		],
	}),
	component: RootComponent,
});

function RootComponent() {
	return (
		<html lang="ar" dir="rtl">
			<head>
				<HeadContent />
			</head>
			<body>
				<I18nProvider initialLocale="ar">
					<Outlet />
				</I18nProvider>
				<Scripts />
			</body>
		</html>
	);
}
