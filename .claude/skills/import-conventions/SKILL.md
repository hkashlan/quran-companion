---
name: import-conventions
description: Conventions for #/ subpath imports in this monorepo. Activate when working with #/ import path aliases, the "imports"/"exports" fields in package.json, or when a #/ import fails to resolve.
---

# Import Conventions

How `#/` internal import aliases work in this monorepo, and how to keep them working when you add new ones.

## When to Apply

- Adding or changing a `#/` import in any package
- Editing the `"imports"` or `"exports"` fields of a `package.json`
- Debugging a `#/...` specifier that fails to resolve ("Cannot find module", unresolved import)
- Setting up a new package that will use `#/` aliases

## What `#/` Is

`#/` is a [Node.js standard **subpath import**](https://nodejs.org/api/packages.html#subpath-imports) — an internal package alias declared in the `"imports"` field of that package's `package.json`. Subpath import keys **must** start with `#`. This is the standards-based, runtime-supported alternative to TypeScript `tsconfig` `"paths"` (which is type-checker-only).

This monorepo uses `moduleResolution: "bundler"` and `allowImportingTsExtensions`, so **imports include the file extension**:

```ts
import { cn } from "#/lib/utils.ts";
import { Button } from "#/components/ui/button.tsx";
```

## The Rule: Declare It in Each Package's Own package.json

Subpath imports are **NOT inherited** across packages in a monorepo. Each package that uses `#/` must declare it in its **own** `package.json`. The canonical form is a wildcard mapping into `src`:

```json
{
  "imports": {
    "#/*": "./src/*"
  }
}
```

With this, `#/components/ui/button.tsx` resolves to `./src/components/ui/button.tsx`.

## Troubleshooting "#/ not working"

If a `#/...` import does not resolve, check, in order:

1. **Does the package containing the file have an `"imports"` field at all?** If the file lives in `packages/ui`, then `packages/ui/package.json` — not the root, not the consuming app — must declare `"imports"`.
2. **Does it use the `#/*` wildcard?** A non-wildcard entry such as `"#/paraglide/runtime": "..."` maps **only** that one exact specifier. It does not enable `#/anything-else`. You need a `"#/*": "./src/*"` wildcard entry for general use.
3. **Mix as needed — they coexist.** Explicit entries and a `#/*` wildcard can live in the same `"imports"` object. Node resolves the most specific matching key first, then falls back to the wildcard.

## Repo Examples

- `packages/ui` declares the general wildcard:

  ```json
  "imports": {
    "#/*": "./src/*"
  }
  ```

- `apps/management` declares explicit `#/paraglide/*` entries (pointing generated paraglide output to specific locations) alongside its general usage. Explicit entries and the wildcard coexist there.

## Checklist When Adding `#/` Usage

Any time you introduce a `#/` import into a package:

- Confirm that package's `package.json` has an `"imports"` field with `"#/*": "./src/*"`.
- If it is missing, add it **in the same change** — do not rely on another package or the root.
- Remember the file extension (`.ts` / `.tsx`) because of `bundler` resolution + `allowImportingTsExtensions`.
