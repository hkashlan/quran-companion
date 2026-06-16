/**
 * Build an Android APK (debug or release) for CI/CD.
 *
 * This project uses TanStack Start (SSR) so there is no static index.html.
 * Capacitor is configured to load the app from CAPACITOR_SERVER_URL (live mode).
 * The capacitor-www directory only needs a placeholder index.html shell and the
 * compiled static assets (icons, service worker, etc.).
 *
 * Steps:
 *   1. vite build  → .output/public/  (static assets: icons, SW, manifests)
 *   2. populate capacitor-www/ with static assets + shell index.html
 *   3. npx cap sync android
 *   4. ./gradlew assembleDebug | assembleRelease
 *
 * Environment variables:
 *   BUILD_TYPE            "debug" (default) | "release"
 *   CAPACITOR_SERVER_URL  live server URL (production deploy); app loads from here
 *
 * Release signing — all four required for a signed release APK:
 *   ANDROID_KEYSTORE_BASE64   base64-encoded .jks / .keystore file
 *   ANDROID_KEYSTORE_PASSWORD keystore password
 *   ANDROID_KEY_ALIAS         key alias inside the keystore
 *   ANDROID_KEY_PASSWORD      key password
 *
 * Output:
 *   android/app/build/outputs/apk/<debug|release>/app-<debug|release>.apk
 *
 * Run:
 *   pnpm --filter @quran/web build:android
 *   BUILD_TYPE=release CAPACITOR_SERVER_URL=https://app.example.com pnpm --filter @quran/web build:android
 */

import { execSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const DIST = join(ROOT, ".output", "public");
const CAP_WWW = join(ROOT, "capacitor-www");
const ANDROID = join(ROOT, "android");
// Shell index.html shared with iOS — a loading screen shown when no server URL is set
const SHELL_HTML = join(ROOT, "ios", "App", "App", "public", "index.html");

const buildType = (process.env.BUILD_TYPE ?? "debug").toLowerCase();
if (buildType !== "debug" && buildType !== "release") {
	console.error(`BUILD_TYPE must be "debug" or "release", got: ${buildType}`);
	process.exit(1);
}

function run(cmd: string, opts: { cwd?: string } = {}) {
	console.log(`\n▶ ${cmd}`);
	execSync(cmd, { cwd: opts.cwd ?? ROOT, stdio: "inherit" });
}

// ── 1. Web build ─────────────────────────────────────────────────────────────
console.log("\n=== Step 1: vite build ===");
run("pnpm vite build");

// ── 2. Populate capacitor-www ─────────────────────────────────────────────────
// Copy static assets then inject the shell index.html (SSR apps don't produce one).
console.log("\n=== Step 2: populate capacitor-www ===");
if (!existsSync(DIST)) {
	console.error(`Build output not found at ${DIST}`);
	process.exit(1);
}
if (existsSync(CAP_WWW)) rmSync(CAP_WWW, { recursive: true, force: true });
mkdirSync(CAP_WWW, { recursive: true });
cpSync(DIST, CAP_WWW, { recursive: true });

if (!existsSync(SHELL_HTML)) {
	console.error(`Shell index.html not found at ${SHELL_HTML}`);
	process.exit(1);
}
copyFileSync(SHELL_HTML, join(CAP_WWW, "index.html"));
console.log("Copied shell index.html into capacitor-www/");

// ── 3. Cap sync ───────────────────────────────────────────────────────────────
console.log("\n=== Step 3: cap sync android ===");
const serverUrl = process.env.CAPACITOR_SERVER_URL ?? "https://quran-companion-web.vercel.app";
process.env.CAPACITOR_SERVER_URL = serverUrl;
run("npx cap sync android");

// ── 4. Keystore setup (release only) ─────────────────────────────────────────
if (buildType === "release") {
	const b64 = process.env.ANDROID_KEYSTORE_BASE64;
	const ksPass = process.env.ANDROID_KEYSTORE_PASSWORD;
	const keyAlias = process.env.ANDROID_KEY_ALIAS;
	const keyPass = process.env.ANDROID_KEY_PASSWORD;

	if (!b64 || !ksPass || !keyAlias || !keyPass) {
		console.error(
			"Release build requires ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD",
		);
		process.exit(1);
	}

	const keystorePath = join(ANDROID, "app", "release.keystore");
	writeFileSync(keystorePath, Buffer.from(b64, "base64"));

	// Inject signing config into local gradle properties (not committed)
	const gradleProps = [
		`storeFile=${keystorePath}`,
		`storePassword=${ksPass}`,
		`keyAlias=${keyAlias}`,
		`keyPassword=${keyPass}`,
	].join("\n");
	writeFileSync(join(ANDROID, "keystore.properties"), gradleProps);

	console.log(`\nKeystore written to ${keystorePath}`);
	console.log(`Signing properties written to android/keystore.properties`);
}

// ── 5. Gradle build ───────────────────────────────────────────────────────────
console.log(`\n=== Step 4: Gradle assemble${buildType === "release" ? "Release" : "Debug"} ===`);

// In CI the local.properties must point at ANDROID_HOME / ANDROID_SDK_ROOT
const sdkDir = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
if (sdkDir) {
	writeFileSync(join(ANDROID, "local.properties"), `sdk.dir=${sdkDir}\n`);
}

const gradleTask = buildType === "release" ? "assembleRelease" : "assembleDebug";
const gradlew = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
run(`${gradlew} ${gradleTask}`, { cwd: ANDROID });

// ── Done ──────────────────────────────────────────────────────────────────────
const apkDir = join(ANDROID, "app", "build", "outputs", "apk", buildType);
console.log(`\n✓ APK ready at: ${apkDir}/app-${buildType}.apk`);
