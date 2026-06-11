/**
 * Headless-Chrome smoke test (puppeteer-core + system Chrome). Verifies the
 * running dev server end-to-end: pages render, no console/page errors, and the
 * login flow reaches the protected home. Screenshots land in /tmp/quran-verify.
 *
 * Run:  pnpm --filter @quran/web verify   (server must be up on :3000)
 */
import { mkdirSync } from "node:fs";
import puppeteer, { type ConsoleMessage, type HTTPRequest } from "puppeteer-core";

const CHROME =
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://localhost:3000";
const OUT = "/tmp/quran-verify";
mkdirSync(OUT, { recursive: true });

type Problem = { kind: string; detail: string };
const problems: Problem[] = [];

function attach(page: import("puppeteer-core").Page, label: string) {
	page.on("console", (msg: ConsoleMessage) => {
		if (msg.type() === "error") {
			problems.push({ kind: `console.error@${label}`, detail: msg.text() });
		}
	});
	page.on("pageerror", (err: Error) => {
		problems.push({ kind: `pageerror@${label}`, detail: err.message });
	});
	page.on("requestfailed", (req: HTTPRequest) => {
		const url = req.url();
		// favicon / icon 404s are expected (no icons yet) — ignore.
		if (url.includes("/icons/") || url.includes("favicon")) return;
		problems.push({
			kind: `requestfailed@${label}`,
			detail: `${url} — ${req.failure()?.errorText}`,
		});
	});
}

async function main() {
	const browser = await puppeteer.launch({
		executablePath: CHROME,
		headless: true,
		args: ["--no-sandbox", "--window-size=440,900"],
	});
	const results: string[] = [];

	try {
		// 1. Unauthenticated root → should redirect to /login
		const page = await browser.newPage();
		await page.setViewport({ width: 440, height: 900 });
		attach(page, "login");
		await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
		const afterRoot = page.url();
		results.push(`root redirect → ${afterRoot}`);
		await page.screenshot({ path: `${OUT}/01-login.png` });

		const hasEmail = await page.$('input[type="email"]');
		const hasPassword = await page.$('input[type="password"]');
		results.push(`login form: email=${!!hasEmail} password=${!!hasPassword}`);

		// 2. Log in as the seeded teacher
		await page.type('input[type="email"]', "teacher@test.com");
		await page.type('input[type="password"]', "Password123!");
		await Promise.all([
			page.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => null),
			page.click('button[type="submit"]'),
		]);
		// give the client redirect (/ → /app) a moment
		await new Promise((r) => setTimeout(r, 1500));
		const afterLogin = page.url();
		results.push(`after login → ${afterLogin}`);
		await page.screenshot({ path: `${OUT}/02-app-teacher.png` });

		const bodyText = await page.evaluate(() => document.body.innerText);
		results.push(
			`teacher home shows name(الأستاذ أحمد)=${bodyText.includes("الأستاذ أحمد")} role(teacher)=${bodyText.includes("teacher")}`,
		);

		// 3. Direct hit on a protected route while logged in
		await page.goto(`${BASE}/app`, { waitUntil: "networkidle0" });
		results.push(`/app direct → ${page.url()}`);
		await page.screenshot({ path: `${OUT}/03-app-direct.png` });

		// 4. Fresh context: student login
		const ctx = await browser.createBrowserContext();
		const sp = await ctx.newPage();
		await sp.setViewport({ width: 440, height: 900 });
		attach(sp, "student");
		await sp.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
		await sp.type('input[type="email"]', "ali@test.com");
		await sp.type('input[type="password"]', "Password123!");
		await Promise.all([
			sp.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => null),
			sp.click('button[type="submit"]'),
		]);
		await new Promise((r) => setTimeout(r, 1500));
		results.push(`student after login → ${sp.url()}`);
		const sText = await sp.evaluate(() => document.body.innerText);
		results.push(`student home shows name(علي حسن)=${sText.includes("علي حسن")}`);
		await sp.screenshot({ path: `${OUT}/04-app-student.png` });
	} finally {
		await browser.close();
	}

	console.log("\n===== VERIFY RESULTS =====");
	for (const r of results) console.log("•", r);
	console.log(`\n===== PROBLEMS (${problems.length}) =====`);
	for (const p of problems) console.log(`✗ [${p.kind}] ${p.detail}`);
	if (problems.length === 0) console.log("✓ no console/page errors");
	console.log(`\nscreenshots → ${OUT}`);
}

main().catch((err) => {
	console.error("verify crashed:", err);
	process.exit(1);
});
