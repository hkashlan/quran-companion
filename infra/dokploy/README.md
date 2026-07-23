# Dokploy deployment — quran

The `@quran/web` SSR app and its Postgres database, deployed to the Dokploy
server at https://dokploy.myclinic-sy.cloud.

- **Project**: `quran-companion` (`SggSGc56xHBJ8yhS3H74P`)
- **App**: Compose service `quran-web` (`NKMfiD4d2IK72uqrBR119`)
- **Database**: native Dokploy Postgres `quran-db` (`B9bhitW0jh52aF8fJOnOj`)

Postgres runs as a **native Dokploy Database** (not inside the compose) so it has
its own backups, external-access toggle, and a lifecycle independent of app
redeploys. The app reaches it over `dokploy-network` by the DB's service name.

## Database — quran-db

- **image**: `postgres:16-alpine`  ·  **db / user**: `quran` / `quran`
- **internal host** (from other dokploy-network containers): `postgres-connect-back-end-application-mp7j6z`
- **status**: deployed & running
- The app's `DATABASE_URL` (set in the compose Environment) is:
  `postgresql://quran:<password>@postgres-connect-back-end-application-mp7j6z:5432/quran`

### Connecting from DBeaver (or any external client)

The DB is not publicly exposed. Two options:

1. **SSH tunnel (recommended, nothing exposed).** DBeaver → PostgreSQL:
   - *SSH tab*: Use SSH Tunnel → host `dokploy.myclinic-sy.cloud`, port 22, your SSH user/key.
   - *Main tab*: the tunnel forwards to the container, so use the DB container's
     host/port on the server. Easiest is to enable a loopback external port (below)
     and target `127.0.0.1:<port>`.
2. **External port toggle (Dokploy-native).** In the quran-db UI → *External Port*,
   or via API `postgres.saveExternalPort` with `{ "postgresId": "B9bhitW0jh52aF8fJOnOj", "externalPort": 5433 }`.
   Then connect to `dokploy.myclinic-sy.cloud:5433`. Note this publishes Postgres on
   the server's public interface — prefer the SSH tunnel, or firewall the port.

## App — quran-web (compose)

- **Git source**: `hkashlan/quran-companion` @ `main`, GitHub app `Dokploy-hkashlan`
- **Compose path**: `infra/dokploy/docker-compose.yml`
- **Build**: root [`Dockerfile`](../../Dockerfile) (node:22 slim, `pnpm --filter @quran/web build`)

The `web` container (Nitro node-server on :3000) runs `drizzle-kit migrate` on
start, then serves SSR.

### Before the first app deploy — required manual steps

1. **Push these files** (`Dockerfile`, `infra/dokploy/`) to `main`, or Dokploy
   has nothing to clone.
2. **Grant repo access**: the `Dokploy-hkashlan` GitHub app must be able to see
   `hkashlan/quran-companion` (it currently only sees `hkashlan/clinic`).
   GitHub → Settings → Applications → Dokploy → Configure → add the repo.
3. **Domain / DNS**: domain `quran-companion.de` is attached (`jDo3N6KKfx_ZAUzw0z9dH`,
   service `web`, port `3000`, HTTP / cert `none`). Point the `quran-companion.de`
   A record at the Dokploy server IP (it currently resolves to Vercel), then switch
   the domain to `https` + `letsencrypt` — do that AFTER DNS points here or cert
   issuance fails.

   **Auth URL mismatch to resolve before go-live**: `BETTER_AUTH_URL` /
   `VITE_BETTER_AUTH_URL` are `https://www.quran-companion.de` (www + https), but
   the attached domain is the apex `quran-companion.de` over http. Make the served
   host and these two vars agree, or auth cookies/redirects break.

## Backups

The database is backed up daily to the existing destination **Clinic DB Backups
(SeaweedFS)** (`erCuORzIzlEnOTXO1ZfD8`, bucket `clinic-files`).

- **backupId**: `cHyvoGw9R_6ZOuwigs49-`  ·  type database / postgres
- **schedule**: `0 3 * * *` (daily 03:00, server timezone)
- **prefix**: `quran/`  ·  **retention**: keepLatestCount = 7

> ⚠️ Destination auth is currently failing: `destination.testConnection` against
> this SeaweedFS returns `InvalidAccessKeyId` (affects clinic's backups too). Fix
> the SeaweedFS S3 key, or create a working destination, before relying on these
> backups. Trigger a manual run to verify once fixed:
>
> ```sh
> curl -sS -X POST -H "x-api-key: $DOKPLOY_API_KEY" -H 'Content-Type: application/json' \
>   "$DOKPLOY_URL/api/backup.manualBackupPostgres" -d '{"backupId":"cHyvoGw9R_6ZOuwigs49-"}'
> ```

## Deploy

Push to `main` (auto-deploy is on) or trigger the app manually:

```sh
curl -sS -X POST -H "x-api-key: $DOKPLOY_API_KEY" -H 'Content-Type: application/json' \
  "$DOKPLOY_URL/api/compose.deploy" -d '{"composeId":"NKMfiD4d2IK72uqrBR119"}'
```
