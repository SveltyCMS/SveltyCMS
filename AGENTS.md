# AGENTS.md

**This is the SveltyCMS agent rulebook.** It contains the non-negotiable rules for working in this codebase — read it before changing code. Where a rule needs context or examples, the linked `docs/` file is the detailed reference: the rule lives here, the detail lives there.

> [!IMPORTANT]
> Read this file in its entirety before any code modification or architectural change. For Svelte 5 rune best practices reference [svelte.dev/llms-full.txt](https://svelte.dev/llms-full.txt): fine-grained reactivity, deep state mutations, no legacy stores.

## 1. Non-Negotiable Rules

### Naming & structure

- **Files/folders: `kebab-case` only** — `user-avatar.svelte`, `auth-service.ts`. PascalCase filenames fail on Linux/CI (case-sensitive FS). Exception: auto-generated `docs/project/benchmarks/benchmark_*.mdx` (pipeline-driven, do not rename).
- Naming: `camelCase` for logic/vars/props, `PascalCase` for types/interfaces/classes, `UPPER_SNAKE_CASE` for constants.
- **Mandatory file headers**: TS `/** … */`, Svelte `<!-- … -->` at the very top, with `@file`, `@description`, `Features:` (and `@component`/`@props` for Svelte).
- **No `any`** — discriminated unions + Valibot for E2E validation.
- **Path aliases** (`@src`, `@utils`, `@widgets`, …) instead of fragile relative imports. Run `bun x svelte-kit sync` after alias changes.
- **Static ESM only** in runtime code — never CommonJS `require(...)`.
- **Lean architecture**: no micro-file fragmentation, no legacy re-export/compat bridges (update consumers and delete in the same changeset), pre-compiled hot paths (`WeakMap` plans, `$O(N)$` parsers), and clean structural parity across all 4 DB adapters (`sqlite`, `postgresql`, `mariadb`, `mongodb`).

### Data & API

- No direct DB access outside adapters — use `dbAdapter.crud.*`, `dbAdapter.auth.*`, etc. Never `mongoose.model(...).find()`.
- **`LocalCMS` in `.server.ts`** for server-to-server calls — never `fetch()` internal `/api` routes (bypasses firewalls/rate-limit/serialization, 10–50× faster).
- Scope everything by `tenantId`.
- Dates: use `ISODateString` + `@utils/date` helpers — `nowISODateString()` (never `new Date().toISOString()`), wrap Drizzle Date columns in `isoDateStringToDate()`, read back through `toISOString()`.
- **Explicit physical column selection** (`new Set(["_id", "path", …])`) for core tables (`content_nodes`, `audit_logs`) — prevents ghost-column bugs in minified production chunks.

### Errors & logging

- Throw via `raise(status, message, code?)` from `@utils/error-handling` — never SvelteKit's raw `error()` or `throw new AppError()`.
- Start every catch with `rethrow(err)`; never swallow errors silently — at minimum `logger.debug()`.

### Frontend

- **Tailwind CSS v4, CSS-first config** — never create/modify `tailwind.config.js`/`.ts`; `@apply` only for base-layer component abstractions.
- **No Skeleton.dev** — removed from the stack; do not reintroduce imports, classes, or docs references.
- **Logical properties for RTL/LTR** (`ps-4`, `me-2`, `text-start`, `rounded-s-`, `border-s-`, `inset-e-`) — never `ml/pl/left/right`; `rtl:-scale-x-[-1]` for directional icons.
- **Status-shade contract**: one shade per role per ramp (`error`, `success`, `warning`, `tertiary`, `primary`, `secondary`, `surface`) — `{hue}-500` fill, `{hue}-500`/`-400` text, `{hue}-500/10` wash (+`-900/20` dark), `{hue}-500/30–40` borders. NEVER reintroduce `bg-{hue}-50/100` washes, `text-{hue}-700/800` emphasis, `dark:text-{hue}-200/300`, or legacy Tailwind hues (`red`→`error`, `blue`→`tertiary`, `green`→`success`, `amber`→`warning`). Drift guard runs in `bun run check` (`consolidate-shades.mjs --check`); repair: `bun run scripts/consolidate-shades.mjs`. Full table + exceptions: `docs/contributing/style-guide-gui.mdx`.
- **Motion**: use `@utils/admin-transitions` (`adminPage`, `adminFade`, `adminStagger`, `adminSlide`) — reduced-motion safe (0ms under `prefers-reduced-motion`). No per-page `in:fly`/`in:scale` one-offs; animate only `transform` + `opacity`.
- **Accessibility** (WCAG 2.2 AA / ATAG 2.0, forward-aligned WCAG 3.0): accessible name on every interactive element; token-based `:focus-visible` rings (≥3:1, both modes); respect reduced motion & high contrast; `cursor: pointer` only on links, never buttons. See `docs/contributing/accessibility.mdx`.
- **Admin UI**: every `(app)` page uses `<AdminPageShell>` + `<AdminCard>`; prefer native `<Button>`, `<Badge>`, `<Input>`, `<Select>`, `<Textarea>` over raw `class="btn"`/`"badge"`/`"input"`; never mix component CSS classes; attributes go on the opening tag (stray attribute text renders as visible content). See `docs/contributing/style-guide-gui.mdx`.
- **Responsive**: every route works at mobile (<768px), tablet (768–1023px), desktop (≥1024px) — `sm/md/lg:` variants, `screen` store for JS, `overflow-x-auto` for wide tables, touch targets ≥40px.

## 2. Security (scanner-enforced, never bypass)

1. **CSPRNG only** — `globalThis.crypto.getRandomValues()`/`randomUUID()` for tokens, resets, API keys, UUIDs. `Math.random()` is forbidden for security-sensitive values; if `crypto` is unavailable, throw — never fall back to weak randomness.
2. **Secrets** — bootstrap secrets (DB creds, `JWT_SECRET_KEY`, `ENCRYPTION_KEY`) in `config/private.ts`; all other secrets DB-driven via System Settings; never hardcode. See `docs/reference/security/secrets-inventory.mdx`.
3. **Granular API authz** — every `/api` request passes `checkEndpointPermission` via the `ENDPOINT_PERMISSIONS` map (fail-closed: unmapped ⇒ 403); RBAC via `hasPermissionWithRoles`.
4. **Account lockout** — 8+ char passwords (4 classes) via `Auth.validatePasswordStrength`; auto-lock 15 min after 5 failed attempts in both `Auth.authenticate()` and `AuthNamespace.login()`.
5. **Session cookies** — `httpOnly`, `sameSite: "strict"`, `secure` in prod; `__Host-` prefix in production (only accept `__Host-` there).
6. **Setup gating** — after setup completes: `/api/setup` ⇒ 403, `/setup` pages redirect to `/login`; `seed-db`/`complete` verify setup state before executing.
7. **Handler defense-in-depth** — system handlers verify `isAdmin`/`role === "admin"` on mutations; `handleMediaUpload` ⇒ `media:write`, `handleMediaPostDelete` ⇒ `media:delete`; `.server.ts` actions use centralized permission guards.
8. **No hardcoded credentials** — never assign or compare against passwords/keys/tokens in code (`password === "x"`); use RBAC or an admin override endpoint.
9. **Secret hashing** — HMAC-SHA-256 with server secret (`hashApiKey`), never plain `createHash("sha256")`/`"md5"`.
10. **CORS/MIME/GraphQL** — origin allowlist (never reflect `Origin`); explicit MIME subtypes (never `application/*`); GraphQL introspection blocked in production unconditionally.
11. **Privilege fields, SVG, SSRF** — strip `role`/`isAdmin`/`permissions`/2FA/lockout from client bodies (`sanitizeClientUserAttributePatch`); buffer + `sanitizeSvg` (never pure-stream); remote URLs via `validateEgressUrl` + `safeFetch` (never `fetch(userUrl)`).
12. **Scanners** — `scan-secret-misuse.ts`, `slop-scanner.ts`, `scan-security-risk.ts`, `scan-osv.ts` (+ `bun audit`) all run via `bun run risk:audit` pre-commit. Exemptions only via `slop:suppress`.

## 2b. EU & German Comparative Advertising Compliance

All public-facing documentation, marketing, and competitive comparisons MUST comply with EU Directive 2006/114/EC and German UWG §6. Before committing competitive content:

- Cite only publicly verifiable sources (CVE/GitHub Advisory DB, published benchmarks, competitor docs), date-stamped with methodology and reproduction commands.
- Never use discrediting language ("suffers from", "cannot", "fails to", "broken") or unverifiable absolutes ("only", "first", "best") — qualify with "based on publicly available documentation" / "as of [date]".
- Compare like-for-like only (SaaS vs self-hosted, free vs enterprise); never imply affiliation with a competitor; label self-assessments as such.

## 3. AI Agent Best Practices

1. **Tree-shaking** — named exports only; avoid side-effect imports.
2. **Svelte 5 runes** — `$state()` deep reactivity, `$derived()` for computed, `$effect()` for side effects (no state writes inside), `$state.raw`/`$state.snapshot`/`$state.eager` as appropriate; no legacy stores.
3. **SvelteKit 3 (RC)** — `$app/env` (not `$app/environment`); `Handle`/`HandleServerError` from `@sveltejs/kit/hooks`; `handleError` reads `error.status`; `goto()` renames (`replace`, `refreshAll`, `reset: false`); `$app/state` runes; external redirects need `{ external: true }`; static imports for boot-time services (Rolldown cyclic-chunk caveat). Config: `vite.config.ts` uses `resolve.alias` with absolute paths (`path.resolve`) + matching `tsconfig.json` `paths`; `tsconfig.json` extends `$app/tsconfig` and lists `types: ["$app/types", ...]`.
4. **SSR-first** — prioritize server rendering for critical paths; prefer SvelteKit Server Functions in `+page.server.ts` over standalone API routes; respect the `hooks.server.ts` pipeline and the `@stores/system` state machine.
5. **Testing discipline (Vitest)** — never `bun:test`; `vi.mock` leaks need matching restore mocks; mock only boundaries (DB, network, FS, IdP) — never partial-stub `node:crypto`/`error-handling`; prefer real CMS core (`raise`, `page-guards`, `getAuthenticatedUser`); integration stays on the real SQLite stack.
6. **Accessibility** — keyboard-navigable, ARIA-compliant, accessible names; see §1 and `docs/contributing/accessibility.mdx`.
7. **MCP knowledge base (CRITICAL)** — query `https://mcp.sveltycms.com/mcp` when in doubt about architecture, schema conventions, or widget syntax.
8. **Predictive preloading** — primary navigation via `<a data-preload="…">` (smart/predict/hover/viewport per context), never `goto()` for navigation (filters/sorting/pagination are the escape hatch). See `docs/reference/architecture/hover-preloading.mdx`.
9. **Behavioral learning** — keep `recordCollectionAccess()`/`recordNavigation()` in `+layout.server.ts`; call `recordEntryAccess()` on collection detail; consult `getHotCollections()`/`predictNextPath()`. See `docs/reference/architecture/behavioral-learning.mdx`.
10. **Reactive search params** — `useReactiveSearchParams()` for client-side table filter/sort/pagination.
11. **Performance** — every change respects the sub-5ms persistence goal; benchmark before/after (`BENCHMARK_RECORD=1`) and check trend labels in `docs/project/benchmarks/`; run `bun run lint:docs` before shipping to catch broken internal links.
12. **Fix pre-existing issues** — never leave the codebase worse; repair bugs/lint/type errors you encounter (unless the fix dwarfs the task — then document and move on).
13. **Commit messages** — Conventional Commits; subject ≤50 chars, imperative, no trailing punctuation; NEVER add `Co-Authored-By` or AI attribution lines.

## 4. Testing & Validation

- **Private config policy**: automated local work (tests, builds, Playwright) must NEVER read/write `config/private.ts` — always `config/private.test.ts` (generated under `TEST_MODE`). CI may create ephemeral `private.ts` on the runner only. See `src/utils/private-config-policy.ts`.
- **E2E control-map policy (CRITICAL)**: soft-skips are banned for control-map rows. Empty product state ⇒ **seed** via `POST /api/testing` (`tests/e2e/helpers/api.ts` helpers: `seedWebhook`, `seedAutomation`, `enablePlugin`, `seedExpiredPasswordReset`, `seedMediaWithMetadata`, …) then assert persistence (create → reload → assert → cleanup). Prefer outcome assertions over shell-only testids; wait on testids/URLs, never fixed sleeps; external fixtures may fail with a clear error but core admin CRUD must never soft-skip. Details + anti-patterns: `docs/tests/adr-testing-2026.mdx`.
- **Testing API is fail-closed**: `/api/testing` ⇒ 403 in production; gated on `TEST_MODE`/`PLAYWRIGHT_TEST` (not bare `NODE_ENV=test`, not `BENCHMARK`); `x-test-secret` matches `TEST_API_SECRET` (timing-safe); stripped from production bundles (`testBackdoorStripperPlugin`). Never add alternate entry points.
- **New features MUST update docs**: `docs/project/roadmap-2026.mdx` is the TODO list — add/mark items there; when shipped, move completed items to `docs/project/achievements-2026.mdx` (achievements log); defensible differentiators also go into `docs/project/competitive-comparison.mdx` (EU/DE-compliant, UWG §6). Plus the relevant MDX (feature→doc matrix and test↔docs map: `docs/contributing/style-guide-gui.mdx` for UI, `docs/contributing/agent-reference.mdx` for the full matrices, `docs/tests/test-to-docs-map.mdx` for test suites).

### CI gate parity (`ci.yml` → local mirror)

CI runs 8 whitebox tasks + harness build + DB ×4 + bench ×4 + 6 E2E shards on every push. Validate the mirror locally first — a green local tree must stay green on CI:

| CI job (`ci.yml`)                  | Local mirror                                                                                                             |
| :--------------------------------- | :----------------------------------------------------------------------------------------------------------------------- |
| 🏁 Bootstrap (paraglide + codegen) | `bun run paraglide`; `bun x svelte-kit sync`                                                                             |
| 01-format / 02-lint                | `bun run format`; `bun run lint` (CI `lint:ci` = same rules, github reporter)                                            |
| 03-check                           | subset of `bun run check` (format + lint + lockfile) — always run full `bun run check`                                   |
| 04-unit                            | `bun run test:unit`                                                                                                      |
| 04b-tenant-gate                    | `bun run test:tenant`; on a dirty tree: `bun run lint:tenant -- --full`                                                  |
| 05-cve / 06-secret / 07-backdoor   | `bun run risk:audit`; `bun run scripts/probe-deploy-testing-api.ts`                                                      |
| 🏗️ Build                           | `COMPILE_ALL_ADAPTERS=true bun run build` (keeps `/api/testing`; plain `bun run build` strips it)                        |
| 🧪 DB (`${{ matrix.db }}`)         | `DB_TYPE=<db> bun run test:integration` against the docker-compose adapter (CI adds `--strict-no-build --summary`)       |
| 🧪 E2E shards                      | `bun run test:e2e` (harness build → wizard → auth-setup → chromium); one group: `bun run test:e2e -- --grep="(<shard>)"` |

**Parity rules — the ones that break otherwise-green trees:**

- **Perf assertions need JIT warm-up** — the `<50ms` timed-loop budget flaked at 71ms cold on CI (`dashboard-runtime`). Run ≥1k warm-up iterations before any timed loop that asserts a budget.
- **Integration/E2E require the harness build** (`COMPILE_ALL_ADAPTERS=true`) — plain `bun run build` strips `/api/testing` ⇒ `API_ENDPOINT_NOT_AVAILABLE`. Only `bun run test:integration`/`test:e2e` (they orchestrate build + preview); never bare `bun x vitest` for integration.
- **`lint-tenant-api` is incremental by default** (git-diff on a dirty tree); CI scans a clean checkout. Always `-- --full` locally.
- **`svelte-kit sync`** after alias/type changes; prod boot is static-import-only — a missing import in `hooks.server.ts` is a `ReferenceError` at startup caught only by the integration harness, never by unit tests.
- **E2E env must match `e2e-prep`** — `TEST_MODE=true`, `TEST_API_SECRET` in `tests/e2e/.auth/test-secret.txt`, `ORIGIN` pinned, `SKIP_TEST_CLEANUP=true`, `DB_NAME=e2e_auth_test`. The wizard → auth-setup chain seeds `tests/e2e/.auth/admin.json`; never skip it for a chromium run.
- **Never combine `--grep` with `--shard`** — Playwright drops ~5/6 of each grep group and empty shards fail (see `.github/workflows/e2e-matrix.ts`).
- **Axe audits run in the Auth & Branding shard** — any color change must keep `bg-{hue}-500` + `text-white` ≥ 4.5:1 (status-shade contract) or the RTL contrast audit fails.
- **DB/contract changes must pass on all 4 adapters** — an adapter-specific bug (e.g. jsonPath re-filter after column-stripping) only surfaces on the DB matrix; when you touch adapter or load-path code, run `test:integration` on at least SQLite + one server DB locally.

**Before you push** — minimum local set: `bun run check` → `bun run test:unit` → `bun run lint:tenant -- --full` → `bun run risk:audit`. Touched server/DB code: `bun run test:integration` (SQLite; `DB_TYPE=<db>` for a specific adapter). Touched a route: `bun run test:e2e -- --grep="(<its shard>)"`. Touched docs: `bun run lint:docs`.

### Commands

| Category  | Command                                                    | Purpose                                                                                       |
| :-------- | :--------------------------------------------------------- | :-------------------------------------------------------------------------------------------- |
| Dev       | `bun run dev` / `build` / `preview`                        | Dev server / prod build / preview :4173                                                       |
| Quality   | `bun run check`                                            | Format + lint + dead-class + design-token + lockfile                                          |
|           | `bun run format` / `lint`                                  | oxfmt / oxlint                                                                                |
| Tests     | `bun run test:unit`                                        | Vitest unit suite (~40s)                                                                      |
|           | `bun run test:security`                                    | Hooks/authz/media/GraphQL security regressions + scanners                                     |
|           | `bun run test:doctor`                                      | Unit + SQLite integration + gate map                                                          |
|           | `bun run test:integration`                                 | Build + SQLite integration (harness)                                                          |
|           | `bun run test:tenant`                                      | Tenant lint (`--full` on dirty trees) + tenant unit suite                                     |
|           | `bun run test:e2e`                                         | Playwright (CI-parity; `-- --grep` for one shard)                                             |
| Git       | `bun run git commit` / `bun run git push` / `bun run gate` | Hardened commit / pre-push gate (blocks `--no-verify`)                                        |
| CI parity | `bun run test:doctor` then `bun run gate`                  | Local green before push; DB ×4/E2E/bench are CI-only — mirror each CI job via the table above |

Pipeline: pre-commit = test-db-safety → format/lint → risk audit → unit → SBOM sync; pre-push = build (4 adapters) → SQLite integration. No double-running the unit suite on pre-push. CI red on a green local tree ⇒ re-check the parity table (harness build, `lint:tenant --full`, JIT warm-up, all-4-DB contract) before touching product code.

## 5. Architecture (brief)

- **`LocalCMS`** — zero-latency SDK bridge for all server-side calls (see §1).
- **Adapters** — all DB logic confined to adapters (`crud`, `auth.*`, `collection`, `media`, `settings`, `widget`), 4 adapters with structural parity.
- **Widgets** — 3-pillar: `index.ts` (`createWidget()` + Valibot schema) / `Input.svelte` / `Display.svelte`.
- **Middleware order** (`hooks.server.ts`) — Compression → Caching → System State → Security (Firewall + Rate Limit) → Setup → Locale → Theme → Auth → Authorization → API Logic → Token Resolution → Security Headers.
- **Multi-tenancy** — native, `tenantId` isolation (enabled in `config/private.ts`).
- **State** — Svelte 5 runes; `widget-store.svelte.ts` singleton; `stores/system/state.ts` auto-recovery state machine. See `docs/reference/architecture/state-management.mdx`.

## 6. Pitfalls (one-liners)

1. Circular deps → dynamic imports for service init. 2. HMR reloads are normal for collections/widgets. 3. Let the setup wizard generate `config/private.ts` — never hand-create it. 4. Kebab-case file casing must match imports exactly (Linux CI is case-sensitive). 5. Path aliases + `bun x svelte-kit sync` after config changes. 6. Windows shell: never `&&` (PowerShell) — use `;`. 7. Playwright: `.locator().locator(":not(...)")` is a descendant query, not a CSS filter — use one selector. 8. `<Checkbox>` input is `sr-only` — click the label, `check({force:true})` fails. 9. Dialog confirm buttons: use page-level `getByRole('button', {name:/confirm/i})` (render gap). 10. API envelopes: `{ success, data }` — tests read `result.data.*`; E2E polls check `body.data` (array). 11. `checkbox.check()` is a no-op when already checked — toggle explicitly. 12. `category: "private"` settings come from `config/private.ts` on fresh loads — verify via API. 13. `bun:sqlite` only under `typeof Bun !== "undefined"` guard. 14. MongoDB `$setOnInsert` must include `tenantId`. 15. `response.clone()` before mutating a Response body. 16. New `CacheService` methods need matching `cacheMock` entries in `tests/unit/setup.ts`. 17. e2e-prep must `mkdir -p config/collections`. 18. CI `db-tests` needs `TEST_API_SECRET`. 19. Media URL cache: call `invalidateMediaUrlCache()` after storage/CDN config changes.

## 7. Troubleshooting (quick)

- **504 Outdated Optimize Dep** → `rm -rf node_modules/.vite` then `bun run dev`.
- **SQLite "value.getTime is not a function"** → pass JS `Date` to Drizzle `timestamp_ms` columns (wrap with `isoDateStringToDate()`).
- **Windows `bun install` corruption** (upstream Bun bug) → use `npm install`; runtime still works. NEVER `rm -rf node_modules bun.lock` together — incremental `bun install`; if corrupted: `git checkout HEAD -- bun.lock` then `bun install` (`repair:drizzle` for drizzle-orm).
- **`bun:test` imports fail under the gate** → Vitest is canonical: import from `"vitest"` always (see §3.5).
- **TS errors** → `bun x svelte-kit sync` to regenerate types.
- **Upgrade** → clean worktree, `bun run scripts/upgrade.ts`, then `bun run check && bun run test:unit`.

## 8. Version Control & Releases

- Branches: `next` (dev), `main` (stable). All work lands on `next`.
- **Release flow** — when stable: 1) bump `package.json` version on `next` (this is what the admin badge shows and CI tags), 2) merge `next` → `main`, 3) CI passes on `main` → `auto-release.yaml` creates+pushes tag `vX.Y.Z`, creates the GitHub Release (auto-generated notes), and publishes to npm. The GitHub Release is **independent of npm publish** — a missing/invalid `NPM_TOKEN` warns but never blocks the release.
- **Emergency paths** — push a tag manually (`git tag vX.Y.Z && git push origin vX.Y.Z` — the workflow listens for `v*` pushes) or `Actions → Auto Release → Run workflow`.
- **Version source** — `package.json` drives the release; the tag is created FROM it. Bump it only when preparing a release — a stray bump ships the wrong version.
- **Hardened git** — `bun run git commit`/`push` block `--no-verify` (bypassing requires the raw system git binary). If the gate fails, fix the issue — never bypass. Ultimate enforcement is GitHub branch protection.

## 9. Docs, Roadmap & Help

- **Docs workflow**: `roadmap-2026.mdx` = TODO list (planned/in-progress); completed items move to `achievements-2026.mdx` (achievements log); competitive differentiators go to `competitive-comparison.mdx` (EU/DE-compliant).
- **Key reference maps**: documentation matrix + key files: `docs/contributing/agent-reference.mdx`; test↔docs: `docs/tests/test-to-docs-map.mdx`.
- **Docs layout**: `docs/reference/` (API, architecture, security, database), `docs/guides/` (configuration, content, deployment), `docs/development/`, `docs/tests/`, `docs/contributing/`, `docs/project/`.
- **Links**: GitHub https://github.com/SveltyCMS/SveltyCMS · Discord https://discord.gg/qKQRB6mP · https://sveltycms.com · https://docs.sveltycms.com · https://marketplace.sveltycms.com · security@sveltycms.com.
- **Security policy**: only the latest release on `next` is supported. Report vulnerabilities via the GitHub Security tab (private) — 48h response, 7-day critical fix target.

---

_Last updated: 2026-08-24_
