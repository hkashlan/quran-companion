/**
 * Headless-Chrome smoke test (puppeteer-core + system Chrome). Logs in as a
 * student and a teacher, walks every tab, screenshots each, and reports any
 * console / page errors. Screenshots land in /tmp/quran-verify.
 *
 * Run:  pnpm --filter @quran/web verify   (server must be up on :3000)
 */
import { mkdirSync } from "node:fs";
import puppeteer, { type ConsoleMessage, type HTTPRequest, type Page } from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://localhost:3000";
const OUT = "/tmp/quran-verify";
mkdirSync(OUT, { recursive: true });

const problems: { kind: string; detail: string }[] = [];
const results: string[] = [];

function attach(page: Page, label: string) {
	page.on("console", (m: ConsoleMessage) => {
		if (m.type() === "error") problems.push({ kind: `console@${label}`, detail: m.text() });
	});
	page.on("pageerror", (e: Error) => problems.push({ kind: `pageerror@${label}`, detail: e.message }));
	page.on("requestfailed", (r: HTTPRequest) => {
		const u = r.url();
		if (u.includes("/icons/") || u.includes("favicon")) return;
		problems.push({ kind: `reqfail@${label}`, detail: `${u} — ${r.failure()?.errorText}` });
	});
}

async function login(page: Page, email: string) {
	await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
	await page.type('input[type="email"]', email);
	await page.type('input[type="password"]', "Password123!");
	await Promise.all([
		page.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => null),
		page.click('button[type="submit"]'),
	]);
	await new Promise((r) => setTimeout(r, 1200));
}

async function shoot(page: Page, path: string, file: string, expect?: string) {
	await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" });
	await new Promise((r) => setTimeout(r, 400));
	await page.screenshot({ path: `${OUT}/${file}` });
	const text = await page.evaluate(() => document.body.innerText);
	const ok = expect ? text.includes(expect) : true;
	results.push(`${path} → ${file} ${expect ? `(has "${expect}"=${ok})` : ""}`);
}

async function main() {
	const browser = await puppeteer.launch({
		executablePath: CHROME,
		headless: true,
		args: ["--no-sandbox"],
	});
	try {
		// ── Student ──
		const sctx = await browser.createBrowserContext();
		const sp = await sctx.newPage();
		await sp.setViewport({ width: 440, height: 900 });
		attach(sp, "student");
		await login(sp, "ali@test.com");
		results.push(`student landed → ${sp.url()}`);
		await shoot(sp, "/student", "10-student-home.png", "علي حسن");
		await shoot(sp, "/student/leaderboard", "11-student-leaderboard.png");
		await shoot(sp, "/student/notifications", "12-student-notifications.png");
		await shoot(sp, "/student/settings", "13-student-settings.png");

		// ── Teacher ──
		const tctx = await browser.createBrowserContext();
		const tp = await tctx.newPage();
		await tp.setViewport({ width: 440, height: 900 });
		attach(tp, "teacher");
		await login(tp, "teacher@test.com");
		results.push(`teacher landed → ${tp.url()}`);
		await shoot(tp, "/teacher", "20-teacher-home.png", "حلقة");
		await shoot(tp, "/teacher/requests", "21-teacher-requests.png");
		await shoot(tp, "/teacher/leaderboard", "22-teacher-leaderboard.png");
	} finally {
		await browser.close();
	}

	console.log("\n===== VERIFY RESULTS =====");
	for (const r of results) console.log("•", r);
	console.log(`\n===== PROBLEMS (${problems.length}) =====`);
	for (const p of problems) console.log(`✗ [${p.kind}] ${p.detail}`);
	if (!problems.length) console.log("✓ no console/page errors");
	console.log(`\nscreenshots → ${OUT}`);
}

main().catch((e) => {
	console.error("verify crashed:", e);
	process.exit(1);
});
