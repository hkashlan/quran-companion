# Production image for the @quran/web app (TanStack Start + Nitro node-server).
# Built by the Dokploy compose stack (infra/dokploy/docker-compose.yml).
#
# Debian slim (glibc) is used rather than alpine so the native build deps
# (esbuild, lightningcss) resolve their prebuilt binaries cleanly.
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

# ---- build ----------------------------------------------------------------
FROM base AS build

# VITE_BETTER_AUTH_URL is read via import.meta.env and baked into the client
# bundle, so it must be present at BUILD time (not just runtime).
ARG VITE_BETTER_AUTH_URL
ENV VITE_BETTER_AUTH_URL=$VITE_BETTER_AUTH_URL

# Install deps first (cached until a manifest or the lockfile changes).
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/db/package.json packages/db/package.json
RUN pnpm install --frozen-lockfile

# Build the web app -> apps/web/.output (self-contained node server).
COPY . .
RUN pnpm --filter @quran/web build

# ---- runner ---------------------------------------------------------------
# The full /app tree is carried over so that drizzle-kit and @quran/db are
# available to run migrations on start, alongside the built .output server.
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /app /app
EXPOSE 3000

# Apply pending migrations, then start the SSR server. If migrations fail the
# container exits non-zero rather than serving against a stale schema.
CMD ["sh", "-c", "pnpm --filter @quran/db db:migrate && node apps/web/.output/server/index.mjs"]
