/** Verifies the full auth flows by reading the dev-logged OTP from the server log. */
import { readFileSync } from "node:fs";
import puppeteer, { type ConsoleMessage, type Page } from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://localhost:3000";
const LOG = "/tmp/quran_dev.log";
const OUT = "/tmp/quran-verify";
const EMAIL = "newstudent@test.com";

const results: string[] = [];
const problems: string[] = [];

/** Latest OTP logged for (email, type) — `[OTP] <type> <email> <otp>`. */
function latestOtp(email: string, type: string): string | null {
	const lines = readFileSync(LOG, "utf8").split("\n").filter((l) => l.includes("[OTP]"));
	for (let i = lines.length - 1; i >= 0; i--) {
		const m = lines[i].match(/\[OTP\]\s+(\S+)\s+(\S+)\s+(\d{6})/);
		if (m && m[1] === type && m[2] === email) return m[3];
	}
	return null;
}

async function main() {
	const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
	const page = await browser.newPage();
	await page.setViewport({ width: 440, height: 980 });
	page.on("console", (m: ConsoleMessage) => m.type() === "error" && problems.push(m.text()));
	page.on("pageerror", (e: Error) => problems.push(e.message));

	try {
		// ── Register → confirm OTP ──
		await page.goto(`${BASE}/register`, { waitUntil: "networkidle0" });
		await page.screenshot({ path: `${OUT}/40-register.png` });
		await page.type('input[placeholder]:nth-of-type(1)', "");
		const inputs = await page.$$("input");
		await inputs[0].type("طالب جديد"); // name
		await inputs[1].type(EMAIL); // email
		await inputs[2].type("Password123!"); // password
		await page.click('button[type="submit"]');
		await new Promise((r) => setTimeout(r, 1500));
		await page.screenshot({ path: `${OUT}/41-register-confirm.png` });

		const otp = latestOtp(EMAIL, "email-verification");
		results.push(`register OTP from log: ${otp ?? "NOT FOUND"}`);
		if (otp) {
			await page.type('input[inputmode="numeric"]', otp);
			await Promise.all([
				page.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => null),
				page.click('button[type="submit"]'),
			]);
			await new Promise((r) => setTimeout(r, 1200));
		}
		results.push(`after confirm → ${page.url()}`);
		await page.screenshot({ path: `${OUT}/42-after-register.png` });

		// ── Forgot password → reset OTP ──
		await page.goto(`${BASE}/forgot-password`, { waitUntil: "networkidle0" });
		await (await page.$('input[type="email"]'))!.type(EMAIL);
		await page.click('button[type="submit"]');
		await new Promise((r) => setTimeout(r, 1500));
		await page.screenshot({ path: `${OUT}/43-forgot-reset.png` });
		const rotp = latestOtp(EMAIL, "forget-password");
		results.push(`reset OTP from log: ${rotp ?? "NOT FOUND"}`);
		if (rotp) {
			await page.type('input[inputmode="numeric"]', rotp);
			await (await page.$('input[type="password"]'))!.type("NewPass456!");
			await page.click('button[type="submit"]');
			await new Promise((r) => setTimeout(r, 1500));
		}
		const resetText = await page.evaluate(() => document.body.innerText);
		results.push(`reset done message shown: ${resetText.includes("بنجاح") || resetText.includes("success")}`);

		// ── Login with the NEW password ──
		await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
		await (await page.$('input[type="email"]'))!.type(EMAIL);
		await (await page.$('input[type="password"]'))!.type("NewPass456!");
		await Promise.all([
			page.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => null),
			page.click('button[type="submit"]'),
		]);
		await new Promise((r) => setTimeout(r, 1200));
		results.push(`login with new password → ${page.url()}`);
	} finally {
		await browser.close();
	}

	console.log("\n===== AUTH VERIFY =====");
	for (const r of results) console.log("•", r);
	console.log(`PROBLEMS (${problems.length})`);
	for (const p of problems) console.log("✗", p);
	if (!problems.length) console.log("✓ no console/page errors");
}

main().catch((e) => {
	console.error("crashed:", e);
	process.exit(1);
});
