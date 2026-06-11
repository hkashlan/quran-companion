# sf-static-imports: Import server-only modules statically, never with `await import()`

## Priority: HIGH

## Explanation

`createServerFn().handler()` bodies run **only on the server**. The build
extracts each handler into a server bundle and replaces the call site on the
client with an RPC stub — so any module a handler imports (the database, `pg`,
secrets, Node APIs) is already guaranteed to stay out of the client bundle.

Because of that, there is **no bundling reason** to lazy-load server-only modules
with `const { db } = await import("@clinic/db/db")` inside a handler. The dynamic
import adds nothing and costs real things:

- It defeats type-checking ergonomics and makes the dependency invisible at the
  top of the file.
- It runs an async module resolution on **every invocation** instead of once.
- It hides what the function actually touches, so server/client separation is
  harder to reason about.
- It is inconsistent with the repo's service files (e.g.
  `appointment.service.ts`, `clinic.service.ts`) that import their DB layer
  statically.

Import server-only modules with a normal top-level `import` statement instead.

## Bad Example

```ts
// apps/management/src/lib/control-panel.service.ts
import { createServerFn } from "@tanstack/react-start";

import { requireSession } from "@/lib/auth.functions";

export const listControlPanelUsers = createServerFn({ method: "GET" }).handler(
  async () => {
    const session = await requireSession();
    // ❌ dynamic import of a server-only module inside the handler
    const { db } = await import("@clinic/db/db");

    return db.query.member.findMany({
      where: (table, { eq }) => eq(table.organizationId, session.user.id),
    });
  },
);
```

## Good Example

```ts
// apps/management/src/lib/control-panel.service.ts
import { createServerFn } from "@tanstack/react-start";

import { db } from "@clinic/db/db"; // ✅ static, top-level — stripped from client bundle
import { requireSession } from "@/lib/auth.functions";

export const listControlPanelUsers = createServerFn({ method: "GET" }).handler(
  async () => {
    const session = await requireSession();
    return db.query.member.findMany({
      where: (table, { eq }) => eq(table.organizationId, session.user.id),
    });
  },
);
```

## Better: push queries into a `@clinic/db` repo function

The established pattern in this repo keeps raw queries out of the service layer
entirely. The service stays a thin `createServerFn` wrapper that statically
imports a repo module from `@clinic/db/<entity>` (which maps to
`packages/db/src/functions/<entity>.db.ts`):

```ts
// apps/management/src/lib/appointment.service.ts
import { createServerFn } from "@tanstack/react-start";

import * as appointmentRepo from "@clinic/db/appointment"; // ✅ static repo import
import { listAppointmentsInputSchema } from "@clinic/db/schemas/appointment";
import { getCurrentOrgId } from "@/lib/auth.functions";

export const listAppointments = createServerFn({ method: "POST" })
  .inputValidator(listAppointmentsInputSchema)
  .handler(async ({ data }) => {
    const orgId = await getCurrentOrgId();
    return appointmentRepo.listAppointments(orgId, data);
  });
```

## Context

- Applies to **any** server-only module imported inside a `createServerFn`
  handler — `@clinic/db/*`, `pg`, secret config, Node built-ins — not just the
  database.
- The legitimate reasons to keep a dynamic `import()` are genuine runtime needs,
  not stylistic ones:
  - **Client-safe modules.** A file imported by client route code (e.g.
    `auth.functions.ts`, which exposes helpers the client calls) must NOT
    statically import a server-only module like `@clinic/db/db` — that would pull
    the DB and `pg` into the client bundle. Such files use `await import(...)`
    deliberately so the server-only code loads only when the handler runs on the
    server. This is the opposite of a `.service.ts`, whose server-fn bodies are
    stripped from the client and so import statically.
  - Code-splitting a heavy **optional** dependency, or breaking a real circular
    import.
  None of these apply to a normal `.service.ts` pulling in its always-used DB
  client.
- This is purely about the **import form**. Don't confuse it with
  `file-separation`: that rule is about not letting server code leak into files
  the client imports; this rule is about how a confirmed server-only file pulls
  in its server-only dependencies.
- Existing offenders to migrate when touched: `patient.service.ts`,
  `visit.service.ts` (management) and `management-user.service.ts`,
  `organization.service.ts` (admin). `auth.functions.ts` is **not** an offender —
  it is client-safe by design (see the client-safe exception above).
