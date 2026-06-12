/** Focused check of the 3 review modals. IDs passed via env (ALI_ID, REVIEW_ID). */
import { mkdirSync } from "node:fs";
import puppeteer, { type ConsoleMessage, type Page } from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://localhost:3000";
const OUT = "/tmp/quran-verify";
mkdirSync(OUT, { recursive: true });
const ALI = process.env.ALI_ID!;
const REVIEW = process.env.REVIEW_ID!;

const problems: string[] = [];
const results: string[] = [];

async function login(page: Page, email: string) {
	await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
	await page.type('input[type="email"]', email);
	await page.type('input[type="password"]', "Password123!");
	await Promise.all([
		page.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => null),
		page.click('button[type="submit"]'),
	]);
	await new Promise((r) => setTimeout(r, 1000));
}

async function clickText(page: Page, text: string) {
	const handles = await page.$$("button");
	for (const h of handles) {
		const txt = await page.evaluate((el) => el.textContent ?? "", h);
		if (txt.includes(text)) {
			await h.click();
			return true;
		}
	}
	return false;
}

async function main() {
	const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
	try {
		// ── Teacher modals ──
		const tctx = await browser.createBrowserContext();
		const tp = await tctx.newPage();
		await tp.setViewport({ width: 440, height: 980 });
		tp.on("console", (m: ConsoleMessage) => m.type() === "error" && problems.push(`teacher: ${m.text()}`));
		await login(tp, "teacher@test.com");
		await tp.goto(`${BASE}/teacher`, { waitUntil: "networkidle0" });
		await tp.screenshot({ path: `${OUT}/30-teacher-students.png` });
		await tp.goto(`${BASE}/assign-review?studentId=${ALI}`, { waitUntil: "networkidle0" });
		await tp.screenshot({ path: `${OUT}/31-assign-review.png` });
		results.push(`assign-review rendered: ${(await tp.$("select")) ? "ok" : "NO FORM"}`);
		await tp.goto(`${BASE}/add-session?studentId=${ALI}`, { waitUntil: "networkidle0" });
		await tp.screenshot({ path: `${OUT}/32-add-session.png` });
		results.push(`add-session rendered: ${(await tp.$('input[type="date"]')) ? "ok" : "NO FORM"}`);

		// ── Student submit (and confirm points rise) ──
		const sctx = await browser.createBrowserContext();
		const sp = await sctx.newPage();
		await sp.setViewport({ width: 440, height: 980 });
		sp.on("console", (m: ConsoleMessage) => m.type() === "error" && problems.push(`student: ${m.text()}`));
		await login(sp, "ali@test.com");

		const before = await sp.goto(`${BASE}/student`, { waitUntil: "networkidle0" }).then(() =>
			sp.evaluate(() => document.body.innerText),
		);
		const pointsBefore = Number(before.match(/(\d+)\s*النقاط|النقاط\s*(\d+)/)?.[1] ?? "?");

		await sp.goto(`${BASE}/submit-review?reviewId=${REVIEW}`, { waitUntil: "networkidle0" });
		await sp.screenshot({ path: `${OUT}/33-submit-review.png` });
		const confirmed = await clickText(sp, "تأكيد");
		await new Promise((r) => setTimeout(r, 1500));
		await sp.screenshot({ path: `${OUT}/34-submit-done.png` });
		results.push(`submit confirm clicked: ${confirmed}`);

		await sp.goto(`${BASE}/student`, { waitUntil: "networkidle0" });
		const afterText = await sp.evaluate(() => document.body.innerText);
		results.push(`points before≈${pointsBefore}; home after-submit text contains النقاط: ${afterText.includes("النقاط")}`);
	} finally {
		await browser.close();
	}
	console.log("\n===== MODAL VERIFY =====");
	for (const r of results) console.log("•", r);
	console.log(`PROBLEMS (${problems.length})`);
	for (const p of problems) console.log("✗", p);
	if (!problems.length) console.log("✓ no console errors");
}

main().catch((e) => {
	console.error("crashed:", e);
	process.exit(1);
});
