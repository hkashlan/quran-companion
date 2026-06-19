# Phase 5 — Capacitor native wrapper + live-mode updates + native push

The web app is the source of truth; Capacitor wraps the PWA into Android/iOS shells.

**Updates are free and need no OTA service.** The shells run in **live mode**: the
native app loads the deployed PWA origin (`CAPACITOR_SERVER_URL`) on every launch,
so each Vercel deploy is instantly live in the installed app — no store review, no
Capgo, no bundle uploads. A new store binary is only needed when **native** code or
plugins change. An offline fallback page (`server.errorPath` → `public/error.html`)
is shown when the device can't reach the server.

Native push uses **FCM**, stored in the same `push_tokens` table
(`kind = "fcm" | "apns"`).

## Status (done in-repo)

- ✅ Capacitor deps installed (`@capacitor/core`, cli, android, ios,
  push-notifications)
- ✅ **App id `com.qurancompanion`** — matches the existing Firebase project
  (`google-services.json` `package_name`), so FCM works without re-registering
- ✅ `capacitor.config.ts` + static `capacitor-www/` shell (live-mode webDir)
- ✅ `google-services.json` committed at `apps/web/` (Android Firebase client config)
- ✅ **Trapeze** config `capacitor.config.yaml` makes native setup reproducible:
  copies `google-services.json` into `android/app/` and pins the iOS bundle id
- ✅ Native client `src/lib/native-push.ts` (registers FCM token →
  `subscribeNativePush`), wired into the protected layout
- ✅ Server FCM send branch (`src/server/fcm.ts`, used by `sendPush`)
- ✅ **Verified building locally:** Android `assembleDebug` → `app-debug.apk`
  (7.7 MB) with `:app:processDebugGoogleServices` running (FCM active); iOS Xcode
  **simulator build succeeded**
- ⏳ Native projects (`android/`, `ios/`) are gitignored — regenerate with the
  commands below; Trapeze re-applies the native config each time

## Reproduce the native setup

```bash
cd apps/web
pnpm build
pnpm exec cap add android && pnpm exec cap add ios   # regenerate shells
pnpm exec cap sync
pnpm exec trapeze run capacitor.config.yaml -y        # copy google-services + bundle id
cd android && ./gradlew assembleDebug                 # → app-debug.apk
```

## What still needs your accounts

- A deployed PWA URL (set `CAPACITOR_SERVER_URL` for live mode)
- **iOS** FCM: a `GoogleService-Info.plist` from Firebase (Android is done) + `FCM_*`
  service-account env on the server for sending
- Apple Developer + Google Play accounts for store builds + signing (updates between
  store releases ship for free via the live-mode deploy)

## 1. Install Capacitor (from `apps/web`)

```bash
cd apps/web
pnpm add @capacitor/core @capacitor/push-notifications
pnpm add -D @capacitor/cli @capacitor/android @capacitor/ios
```

`capacitor.config.ts` is already committed (appId `com.qurancompanion`).

## 2. Add native shells (folders are gitignored)

```bash
pnpm build                 # produces .output/public (webDir)
npx cap add android
npx cap add ios            # macOS + Xcode only
npx cap copy
```

## 3. Live mode (free updates, no OTA service)

Set `CAPACITOR_SERVER_URL` to your Vercel URL before `cap sync`. `capacitor.config.ts`
reads it into `server.url`, so the shell loads the latest deployed web build on every
launch. Practically:

- **Web/UI changes** → just deploy to Vercel. The next time the app opens it shows the
  new build. No rebuild, no store review, no upload — this replaces what Capgo did.
- **Native changes** (new Capacitor plugin, native permission, app icon/splash) → cut a
  new store binary (`cap sync` + Gradle/Xcode build → Play/App Store).
- **Offline** → `server.errorPath` shows `public/error.html` (a retry screen) instead of
  a blank webview when the device can't reach the server.

> If you ever need true offline-first (app fully usable with no network), that requires
> shipping a static bundle inside the app and swapping it via the
> `@capgo/capacitor-updater` plugin's `download`/`set` API against a self-hosted
> `latest.json` manifest — a larger change since this app is SSR (TanStack Start). Not
> needed for live mode.

## 4. Native push (FCM / APNs)

1. Create a Firebase project, add Android + iOS apps, download `google-services.json`
   (Android) and `GoogleService-Info.plist` (iOS) into the native projects.
2. On the client, register and POST the token to the existing endpoint:

```ts
import { PushNotifications } from "@capacitor/push-notifications";
import { subscribeNativePush } from "@/server/subscribe-push"; // add a kind:"fcm" variant

await PushNotifications.requestPermissions();
await PushNotifications.register();
PushNotifications.addListener("registration", (t) =>
  subscribeNativePush({ data: { token: t.value, kind: "fcm", platform: "android" } }),
);
```

3. Server: extend `server/push.ts::sendPush` with an FCM HTTP v1 branch for tokens
   where `kind !== "webpush"` (service-account creds via `FCM_*` env, already in
   `.env.example`). The `push_tokens` schema already stores native tokens.

## 5. Build & submit

```bash
npx cap open android   # Android Studio → build AAB → Play Console
npx cap open ios       # Xcode → Archive → App Store Connect
```
