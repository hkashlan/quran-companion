/**
 * Generates the branded PWA / home-screen app icons from a single SVG source by
 * rasterizing with the system Chrome via puppeteer-core — no image deps, no
 * committed binary blobs to hand-edit.
 *
 * Artwork: an open mushaf (white pages + gold verse lines) with a gold bookmark
 * ribbon, on the brand emerald tile — a Quran memorization / reminder mark.
 *
 * Outputs (committed to the repo, so this only runs on a dev machine):
 *   public/icons/icon-192.png          rounded, transparent corners — manifest "any"
 *   public/icons/icon-512.png          rounded, transparent corners — manifest "any"
 *   public/icons/icon-maskable-512.png full-bleed, safe-zone padded — manifest "maskable"
 *   public/icons/apple-touch-icon.png  180px opaque square          — iOS home screen
 *
 * Run: pnpm --filter @quran/web icons
 * Override the browser with CHROME_PATH=... if the default macOS path is wrong.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import puppeteer from "puppeteer-core";

const CHROME =
	process.env.CHROME_PATH ??
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// Brand palette (see styles.css / favicon.svg).
const EMERALD = "#0a7b4f";
const EMERALD_DARK = "#075f3d";
const GOLD = "#e6c260";
const GOLD_DEEP = "#c8a44e";

// ── Artwork, authored in a 512×512 coordinate space (spine at x=256) ──────────

const BOOK_SCALE = 1.18;
const BOOK_CY = 280;

/** Map a point authored around (256, 300) into the book's scaled position. */
const bx = (n: number) => 256 + (n - 256) * BOOK_SCALE;
const by = (n: number) => BOOK_CY + (n - 300) * BOOK_SCALE;

/** Solid-gold verse line (a gradient stroke on a flat line renders empty). */
const line = (x1: number, x2: number, y: number) =>
	`<line x1="${bx(x1)}" y1="${by(y)}" x2="${bx(x2)}" y2="${by(y)}" stroke="${GOLD_DEEP}" stroke-width="${8 * BOOK_SCALE}" stroke-linecap="round"/>`;

const artwork = `
  <g>
    <!-- open pages -->
    <path d="M256 ${by(268)} C214 ${by(248)} 168 ${by(244)} ${bx(120)} ${by(262)} L${bx(120)} ${by(352)} C168 ${by(336)} 214 ${by(338)} 256 ${by(358)} Z" fill="#ffffff"/>
    <path d="M256 ${by(268)} C298 ${by(248)} 344 ${by(244)} ${bx(392)} ${by(262)} L${bx(392)} ${by(352)} C344 ${by(336)} 298 ${by(338)} 256 ${by(358)} Z" fill="#ffffff"/>
    <!-- spine -->
    <path d="M256 ${by(268)} L256 ${by(358)}" stroke="#d7e6dc" stroke-width="${5 * BOOK_SCALE}" stroke-linecap="round"/>
    <!-- verse lines (left + right pages, last line shorter) -->
    ${line(140, 232, 274)}${line(140, 232, 296)}${line(140, 206, 318)}
    ${line(280, 372, 274)}${line(280, 372, 296)}${line(306, 372, 318)}
    <!-- bookmark ribbon -->
    <path d="M236 166 L276 166 L276 262 L256 244 L236 262 Z" fill="url(#gold)"/>
  </g>`;

/**
 * @param size          output px (square)
 * @param radius        corner radius in 512-space units (0 = full-bleed square)
 * @param contentScale  shrink the artwork about the center (maskable safe zone)
 */
function iconSvg(size: number, radius: number, contentScale: number): string {
	const content =
		contentScale === 1
			? artwork
			: `<g transform="translate(256 256) scale(${contentScale}) translate(-256 -256)">${artwork}</g>`;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${EMERALD}"/>
      <stop offset="1" stop-color="${EMERALD_DARK}"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${GOLD}"/>
      <stop offset="1" stop-color="${GOLD_DEEP}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="42%" r="55%">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.18"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="${radius}" ry="${radius}" fill="url(#bg)"/>
  <rect width="512" height="512" rx="${radius}" ry="${radius}" fill="url(#glow)"/>
  ${content}
</svg>`;
}

type Target = {
	file: string;
	size: number;
	svg: string;
	/** iOS home-screen icons must be opaque; PWA icons keep transparent corners. */
	opaque: boolean;
};

const targets: Target[] = [
	{ file: "icon-192.png", size: 192, svg: iconSvg(192, 112, 1), opaque: false },
	{ file: "icon-512.png", size: 512, svg: iconSvg(512, 112, 1), opaque: false },
	// Maskable: full-bleed, artwork shrunk so it survives Android's adaptive mask.
	{
		file: "icon-maskable-512.png",
		size: 512,
		svg: iconSvg(512, 0, 0.72),
		opaque: true,
	},
	// apple-touch-icon: iOS rounds it itself and renders transparency as black,
	// so it must be an opaque square.
	{
		file: "apple-touch-icon.png",
		size: 180,
		svg: iconSvg(180, 0, 1),
		opaque: true,
	},
];

const dir = resolve(import.meta.dirname, "../public/icons");
mkdirSync(dir, { recursive: true });

const browser = await puppeteer.launch({
	executablePath: CHROME,
	headless: true,
	args: ["--no-sandbox", "--force-color-profile=srgb"],
});
try {
	for (const t of targets) {
		const page = await browser.newPage();
		await page.setViewport({
			width: t.size,
			height: t.size,
			deviceScaleFactor: 1,
		});
		await page.setContent(
			`<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;padding:0}svg{display:block}</style></head>
<body>${t.svg}</body></html>`,
			{ waitUntil: "networkidle0" },
		);
		const png = (await page.screenshot({
			type: "png",
			omitBackground: !t.opaque,
			clip: { x: 0, y: 0, width: t.size, height: t.size },
		})) as Uint8Array;
		writeFileSync(resolve(dir, t.file), png);
		await page.close();
		console.log(`icons: wrote ${t.file} (${t.size}×${t.size})`);
	}
} finally {
	await browser.close();
}
