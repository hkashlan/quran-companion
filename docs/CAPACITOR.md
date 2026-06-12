# Phase 5 — Capacitor native wrapper + Capgo OTA + native push

The web app is the source of truth; Capacitor wraps the built PWA into Android/iOS
shells. OTA updates use **Capgo** (free tier); native push uses **FCM/APNs**, stored
in the same `push_tokens` table (`kind = "fcm" | "apns"`).

> Needs your accounts: Apple Developer, Google Play, a Capgo account, and a Firebase
> project for FCM. Everything below is the runbook; nothing here requires me.

## 1. Install Capacitor (from `apps/web`)

```bash
cd apps/web
pnpm add @capacitor/core @capacitor/push-notifications @capgo/capacitor-updater
pnpm add -D @capacitor/cli @capacitor/android @capacitor/ios
```

`capacitor.config.ts` is already committed (appId `com.hkashlan.qurancompanion`).

## 2. Add native shells (folders are gitignored)

```bash
pnpm build                 # produces .output/public (webDir)
npx cap add android
npx cap add ios            # macOS + Xcode only
npx cap copy
```

## 3. Live mode vs bundled

- **Live (recommended):** uncomment `server.url` in `capacitor.config.ts` and point it
  at your Vercel URL. The shell always loads the latest deployed web build — you mostly
  ship via Vercel, and only release a new store binary when native plugins change.
- **Bundled:** ship the built assets inside the app and use **Capgo** for OTA:

```bash
pnpm add @capgo/cli
npx @capgo/cli login <CAPGO_TOKEN>
npx @capgo/cli bundle upload --channel production
```

`CapacitorUpdater.autoUpdate` is already on in the config.

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
