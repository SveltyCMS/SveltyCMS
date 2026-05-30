<p style="border: none; margin-bottom:0; padding-bottom: 0;" align="center">
  <img width="200" alt="SveltyCMS logo" src="https://raw.githubusercontent.com/SveltyCMS/SveltyCMS/main/static/SveltyCMS.png">
</p>

<h1 align="center"><strong>SveltyCMS - Headless CMS with Sveltekit Power</strong></h1>
<p align="center"><strong><a href="https://SveltyCMS.com">SveltyCMS.com</a></strong> <img src="https://img.shields.io/github/package-json/v/SveltyCMS/SveltyCMS?color=blue&style=flat-square&label=" alt="Version" style="vertical-align: middle;"></p>
<p align="center"><strong>(Still in Development — your support is appreciated!)</strong></p>

<div align="center">
  <a href="https://discord.gg/qKQRB6mP"><img src="https://img.shields.io/discord/1369537436656603188?label=chat&logo=discord&color=7289da" alt="Chat"></a>
  <a href="LICENSE.md"><img src="https://img.shields.io/badge/License-BSL%201.1%20Fair%20Source-blue.svg" alt="License: BSL 1.1"></a>
  <img src="https://img.shields.io/github/issues/SveltyCMS/SveltyCMS" alt="GitHub issues">
  <a href="docs/security/tested-security-features.mdx"><img src="https://img.shields.io/badge/Security-Tested%20Fortress-blue?style=flat-square&labelColor=1e293b" alt="Security: Tested Fortress"></a>
  <img src="https://img.shields.io/badge/Bundle-842%20KB%20Brotli%20/%203.01%20MB%20Total-success?style=flat-square&labelColor=1e293b" alt="Bundle Size">
  <img src="https://img.shields.io/badge/Performance-12µs%20Hooks%20/%2014k%20RPS-blueviolet?style=flat-square&labelColor=1e293b" alt="Performance">
</div>

<div align="center">
  <a href="https://kit.svelte.dev"><img src="https://img.shields.io/badge/SvelteKit-V2-FF3E00?logo=svelte" alt="SvelteKit"></a>
  <a href="https://voidzero.dev"><img src="https://img.shields.io/badge/Toolchain-Vite%2B-646CFF?logo=vite" alt="Vite+"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript" alt="TypeScript"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-24%2B-339933?logo=node.js" alt="Node.js"></a>
  <a href="https://tailwindcss.com/"><img src="https://img.shields.io/badge/Tailwind%20CSS-4-38B2AC" alt="Tailwindcss"></a>
</div>

<p align="center">
  <a href="https://github.com/SveltyCMS/SveltyCMS/actions/workflows/github-code-scanning/codeql"><img alt="CodeQL" src="https://github.com/SveltyCMS/SveltyCMS/actions/workflows/github-code-scanning/codeql/badge.svg"></a>
  <a href="https://github.com/SveltyCMS/SveltyCMS/actions/workflows/ci.yml"><img alt="CI Pipeline" src="https://github.com/SveltyCMS/SveltyCMS/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/SveltyCMS/SveltyCMS/actions/workflows/auto-release.yaml"><img alt="Auto Release" src="https://github.com/SveltyCMS/SveltyCMS/actions/workflows/auto-release.yaml/badge.svg"></a>
</p>

<h2 align="center">A powerful Enterprise Headless CMS with Sveltekit Power</h2>

<h3 align="center"><strong>It's lightning fast, flexible and an easy to use modern content management system to provide a headless backend</strong></h3>

This SveltyCMS headless CMS provides a powerful backend based on a modern [SvelteKit 2 / Svelte 5](https://svelte.dev) framework. Being designed to be database agnostic, we fully support **MongoDB**, **PostgreSQL**, **SQLite**, and **MariaDB/MySQL** (via [Drizzle ORM](https://drizzle.dev)).

You can define Content Collections in two ways: in code or via the GUI-based collection builder. Full TypeScript support and a rich widget library make it straightforward to build custom data structures.

All widget fields support localization, validation using [Valibot](https://valibot.dev), and access control.

System localization uses [Inlang Paraglide JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJs), a lightweight, type-safe i18n library. English is the default; additional languages are bundled and can be extended.

We use the latest [tailwindcss v4](https://tailwindcss.com), so the CMS can be quickly optimized to your personal needs.

Backend data is available via REST API or [GraphQL Yoga](https://the-guild.dev/graphql/yoga-server) for fast, flexible frontends.

## ⭐ Key Features

| Feature                    | Status | Notes                                                         |
| -------------------------- | ------ | ------------------------------------------------------------- |
| Collection Builder         | ✅     | GUI and code-based definitions                                |
| Typed Widget System        | ✅     | Localization, validation, access control                      |
| Multi-language (Paraglide) | ✅     | Type-safe i18n out of the box                                 |
| REST API                   | ✅     | CRUD and configuration endpoints                              |
| GraphQL API (Yoga)         | ✅     | High-performance schema                                       |
| Database Resilience        | ✅     | Retries, self-healing reconnection, diagnostics, log download |
| Email Templating           | ✅     | Svelte Email + SMTP                                           |
| Roles & Permissions        | ✅     | Database-backed access control                                |
| MariaDB / MySQL            | ✅     | SQL support via Drizzle ORM                                   |
| PostgreSQL                 | ✅     | Full production support via Drizzle ORM                       |
| SQLite                     | ✅     | Optimized Multi-Tenant Indexing (Sub-ms)                      |
| Persistent DoS Protection  | ✅     | State-aware rate limiting across restarts                     |

## 🚀 Quick Start

Get up and running fast:

1. **Clone and install**

```bash
git clone https://github.com/SveltyCMS/SveltyCMS.git
cd SveltyCMS
bun install  # or npm/pnpm
```

2. **Start dev server** (guided installer auto-launches)

```bash
bun run dev  # or npm run dev / pnpm run dev
```

3. **Open the app**

- SvelyCMS: http://localhost:5173/
- GraphQL: http://localhost:5173/api/graphql

Prefer a full walkthrough? See: [./docs/getting-started.mdx](./docs/getting-started.mdx)

<p align="center">
 <img width="100%" alt="SveltyCMS Gui" src="https://raw.githubusercontent.com/SveltyCMS/SveltyCMS/main/static/docs/SveltyCMS-Demo1.png">
</p>

## 🛠️ Developer Experience (DXP)

- CLI installer auto-launches for smooth first-run setup
- Typed widgets and schema-driven collection builder
- Fast feedback loop with hot reloads and strong typing

## 🚀 Setup

### Clone the repository

To clone our [repository](https://github.com/SveltyCMS/SveltyCMS.git) you need to be able to use [Git](https://git-scm.com/downloads).

```bash
git clone https://github.com/SveltyCMS/SveltyCMS.git
cd SveltyCMS
```

### Install all dependencies

> [!TIP]
> **Bun is preferred for best results.**
> While SveltyCMS is fully compatible with Node.js (>=24), running the application under the **Bun** runtime unlocks native Zig-based cryptographic performance (like native Argon2id hashing) and optimized OS-level file watching with zero binding overhead.

Install LATEST STABLE [Node.js (>=24)](https://nodejs.org/en) to get started. We recommend using [Bun](https://bun.sh) for the best experience (3-4x faster than npm/pnpm). Then choose your preferred package manager:

<details open>
<summary><b>bun</b></summary>

```bash
# Install bun if you haven't already
curl -fsSL https://bun.sh/install | bash

# Install all dependencies
bun install

# Development (CLI installer launches automatically if needed)
bun run dev

# Build for production
bun run build

# Preview production build
bun run preview
```

**⚠️ Windows users**: If `bun install` fails with `ParserError` or corrupted packages (null bytes in package.json files), use `npm install` instead. `bun run dev` and other commands work normally after `npm install`. This is an upstream bun bug affecting Windows only.

</details>

<details>
<summary><b>npm</b></summary>

```bash
# Install all dependencies
npm install

# Development (CLI installer launches automatically if needed)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

</details>

<details>
<summary><b>pnpm</b></summary>

```bash
# Install pnpm if you haven't already
npm install -g pnpm

# Install all dependencies
pnpm install

# Development (CLI installer launches automatically if needed)
pnpm run dev

# Build for production
pnpm run build

# Preview production build
pnpm run preview
```

</details>

### Setup Wizard (auto)

When starting the dev server without configuration, the guided installer launches automatically:

- Smart detection via `vite.config.ts`
- Database configuration: MongoDB, PostgreSQL, SQLite, or MariaDB/MySQL
- Admin account setup, secrets/keys generation
- Optional SMTP and Google OAuth configuration

Start with:

```bash
bun run dev  # or npm run dev / pnpm run dev
```

### Development and Production

We use the unified **Vite+ Alpha (VoidZero)** toolchain for an ultra-fast development experience.

- **Development**: `vp dev` (runs on `localhost:5173`)
- **Production Build**: `vp build` (Rust-based Rolldown bundler)
- **Preview**: `vp preview` (runs on `localhost:4173`)
- **Linting**: `oxlint` (project-wide checks in <50ms)
- **Formatting**: `oxfmt` (blazing fast Rust-based formatter)

See our `package.json` for all available commands.

## 🔒 Authentication & Security

SveltyCMS implements **A++ enterprise-grade security** with 4-layer defense-in-depth architecture.

**Multi-Layer Protection:**

- **AI Bot Defense Shield** — Proactive detection blocks 28 AI crawler patterns (GPTBot, Claude, Perplexity) and reconnaissance tools (Nmap, SQLMap, Burp Suite). A 45-route honeypot grid with progressive tarpit delays and response poisoning wastes attacker resources.
- **4-Layer Defense-in-Depth** — Middleware → Dispatcher → Handler → Page Action; every layer re-validates permissions independently with fail-closed defaults.
- **Enterprise SSO** — Native SAML 2.0 and SCIM 2.0 support for automated user provisioning (Okta, Azure AD).
- **Zero-Bias Cryptography** — CSPRNG token generation with rejection sampling, Argon2id password hashing (64MB memory-hard), AES-256-GCM encryption, SHA-256 crypto-chained audit logs.
- **Cross-Origin Isolation** — COOP, COEP, and CORP headers on all API responses prevent Spectre/Meltdown side-channel attacks.
- **Multi-Tenancy** — Native `tenantId` isolation at the database adapter level with TBAC role scoping.
- **Granular RBAC** — Role-based and field-level access control; OAuth HMAC state integrity; timing-safe cryptographic comparisons; `__Host-` cookie prefix enforcement (RFC 6265bis).

You can log in with email/password, Google OAuth, or GitHub OAuth. Role- and field-based access control lets you define precisely who can view, edit, or delete content.

📖 **[Full Security Documentation](./docs/architecture/security/index.mdx)**

## 🎨 Modern Theming & Design System

SveltyCMS features a **native Svelte 5 component library** (42+ primitives) built on Tailwind 4 CSS variables with zero third-party UI dependencies.

- **Swappable Admin Themes** — Centralized `app.css` using Tailwind 4 `@theme` blocks. Replace the default color palette to give your CMS a corporate brand identity — from startup purple to enterprise blue in minutes.
- **Dark Mode** — Native support via `media` and `class` selectors.
- **Accessibility-First** — All components verified for WCAG 2.2 AA compliance in the Kitchen Sink validation lab.
- **Zero Runtime Overhead** — Components use Svelte 5 Runes (`$state`, `$props`) with Svelte `use:action` patterns instead of heavy state machines.

📖 **[UI Style Guide](./docs/contributing/style-guide-gui.mdx)**

## 🌍 Great System Localization i18n infrastructure

<table>
<tr>
<td>

We use [Paraglide JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJs), the best i18n library together with [inlang](https://inlang.com/) ecosystem for first class System Translations with full typescript support.

Our System Translations are available at: [inlang](https://inlang.com/editor/github.com/SveltyCMS/SveltyCMS) and can easily be extended.

If a language has not yet been defined, reach out to us, so that you can help extend the System Localization.

</td>
<td>

[![inlang status badge](https://badge.inlang.com/?url=github.com/SveltyCMS/SveltyCMS)](https://fink.inlang.com/github.com/SveltyCMS/SveltyCMS?ref=badge)

</td>
</tr>
</table>

## ♿ Accessibility & Inclusivity

SveltyCMS is designed with inclusivity at its core, strictly following **WCAG 2.2 AA** and **ATAG 2.0** standards, and proactively moving towards **WCAG 3.0 (Functional Performance)**.

- **Screen Reader Ready**: Semantic HTML landmarks, ARIA live regions for status updates, and descriptive labels.
- **Keyboard Navigation**: Full support for keyboard-only users, including complex widgets like tree views and drag-and-drop interfaces.
- **Cognitive Accessibility**: Clear input validation, consistent navigation, and focus management.
- **For Developers**: We provide a comprehensive [Accessibility Guide](./docs/contributing/accessibility.mdx) to help you maintain these standards in your custom widgets.

## 📋 Easily create Data Collections

Great Experience to designing user-friendly and intuitive interfaces for managing content.
Full Typescript support to display all available widgets, options to create fully custom data structures.

## 📧 Flexible Email Templating System

Build and send emails using [Svelty Email](https://svelte-email.vercel.app/) and TypeScript.

📦 Optimized Bundle Size
SveltyCMS is built with modern optimization techniques resulting in a compact bundle compared to traditional CMS platforms:

| CMS Platform    | Total Asset Size | Bundle Size (Brotli) | Technology Stack |
| :-------------- | :--------------- | :------------------- | :--------------- |
| **SveltyCMS**   | **3.01 MB**      | **842 KB ⚡**        | Svelte 5 + Vite+ |
| WordPress Admin | ~12.5 MB         | ~950 KB              | jQuery + PHP     |
| Drupal Admin    | ~15.0 MB         | ~1.2 MB              | jQuery + Drupal  |
| Payload CMS     | ~8.5 MB          | ~1.1 MB              | React + Next.js  |
| Directus        | ~6.5 MB          | ~1.0 MB              | Vue.js           |

> [!NOTE]
> **Secure-by-Design Architecture**: The 842 KB figure represents the total Brotli-compressed assets for the standard admin dashboard. By leveraging Svelte 5's zero-runtime reactivity and the Vite+ tree-shaking compiler, we achieve a highly optimized delivery where the client only receives exactly what it needs to render.

## ⚡ Performance Benchmarks

SveltyCMS ships with an enterprise-grade benchmark intelligence system — 48 tests across 9 dimensions, 8 database-specific MDX reports, and smart trend analysis.

### Enterprise Benchmark Matrix

| Capability                    | Description                                                                       |
| ----------------------------- | --------------------------------------------------------------------------------- |
| **48 tests, 9 dimensions**    | Baseline, Adapter, Internals, Logic, API, Scale, Resilience, Security, Governance |
| **4 databases + Redis**       | SQLite, PostgreSQL, MariaDB, MongoDB — each with Redis on/off variants            |
| **Trend analysis**            | Rolling median baselines, 7 root cause categories, confidence levels              |
| **Code path recommendations** | Each regression links to specific source files to investigate                     |
| **Differential execution**    | `--differential` runs only tests affected by recent code changes                  |
| **8 educational reports**     | `docs/project/benchmarks/benchmark_<db>.mdx` with Measures/Budget/Code/Why        |

### Latest SQLite Results (May 2026)

| Metric                           | Value       | Budget  |
| -------------------------------- | ----------- | ------- |
| Cold Start                       | **381ms**   | <5000ms |
| REST API p95                     | **0.59ms**  | <5ms    |
| DB Raw p95                       | **0.074ms** | <50ms   |
| Middleware + Auth                | **1.78ms**  | <2ms    |
| Index Pressure (25K rows)        | **1.89ms**  | <250ms  |
| Content Scale (1000 collections) | **750ms**   | —       |

### How to Run

```bash
# Console only (safe for normal dev)
bun test tests/benchmarks/auth-performance.test.ts

# Record to report
BENCHMARK_RECORD=1 bun test tests/benchmarks/auth-performance.test.ts

# Full matrix
bun run scripts/benchmark-matrix/index.ts --sql

# Differential (only affected tests)
bun run scripts/benchmark-matrix/index.ts --sql --differential
```

> See `docs/project/benchmarks/index.mdx` for the complete architecture guide.

## 📚 Documentation

Comprehensive documentation is available to help you get started:

- 📖 **[Documentation](./docs/)** — Guides, API reference, and architecture
- 🎯 **[Getting Started](./docs/getting-started.mdx)** — Quick start guide
- 🔄 **[Upgrading SveltyCMS](./docs/guides/configuration/Upgrading.mdx)** — Safe update guide
- 🏗️ **Architecture: Database Resilience** — [./docs/architecture/database-resilience.mdx](./docs/architecture/database-resilience.mdx)
- 🤝 **[Contributing Guide](./CONTRIBUTING.md)** — How to contribute

## 🔌 Quick API Examples

**REST** (fetch 5 posts):

```bash
curl -H "Authorization: Bearer <token>" \
  "http://localhost:5173/api/collections/posts?limit=5"
```

**GraphQL** (posts with author):

```graphql
query {
  posts(limit: 5) {
    id
    title
    slug
    author {
      name
    }
  }
}
```

## 📜 License: Fair Source (BSL 1.1)

SveltyCMS is licensed under the [Business Source License 1.1 (BSL 1.1)](LICENSE.md) — Fair Source software that balances openness with sustainability.

### What this means:

- ✅ **Free for individuals & small businesses** — Use, modify, and deploy in production if your organization's total finances are under $1,000,000 USD
- 💼 **Paid license for larger organizations** — Commercial license required if total finances exceed $1M USD
- 🔓 **Future open source** — Automatically converts to MIT License on the "Change Date" specified in the license file
- 🤝 **Open collaboration** — Source code is publicly available; contributions welcome

### Who needs a paid license?

If your organization's **Total Finances** (revenue, funding, assets) exceed $1,000,000 USD, you must purchase a commercial license to use SveltyCMS in production.

### Commercial licensing inquiries:

📧 **Email:** info@sveltycms.com

For more details, see the full [LICENSE](LICENSE) file.

## ❓ Need help?

Contact us if you're struggling with installation or other issues:

- 💬 [GitHub Discussions](https://github.com/SveltyCMS/SveltyCMS/discussions)
- 💬 [Discord Server](https://discord.gg/qKQRB6mP)
- 🔧 [Report Issues](https://github.com/SveltyCMS/SveltyCMS/issues)
- 📖 [Documentation](./docs/)
- 📧 Email: support@sveltycms.com

## 🚀 Semantic Versioning

For detailed information on our Git workflow, branching strategy, and commit conventions, see our [Git Workflow & Automated Releases guide](docs/tests/git-workflow.mdx).

We use [semantic versioning](https://semver.org/) to manage our releases. This means that our version numbers follow a specific format: `MAJOR.MINOR.PATCH`.

- `MAJOR` version changes when we make incompatible API changes
- `MINOR` version changes when we add functionality in a backwards-compatible manner
- `PATCH` version changes when we make backwards-compatible bug fixes

When submitting pull requests, please make sure your commit messages follow the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification. This will help us automatically generate changelogs and release notes.

Please also read our [Code of Conduct](https://github.com/SveltyCMS/SveltyCMS/blob/main/CODE-OF-CONDUCT.md) before submitting Pull Requests.

If your PR makes a change that should be noted in one or more packages' changelogs, generate a changeset by running `pnpm changeset` and following the prompts. Changesets that add features should be `minor` and those that fix bugs should be `patch`.

### 🧪 Verified CI Parity

Before submitting Pull Requests, ensure your changes pass all checks by running:

```bash
bun run lint && bun run check && bun run test:unit:bun
```

This runs the linter (`oxlint`), type checker (`svelte-check`), and the full unit test suite (`bun test`) exactly as the CI pipeline does.

Please prefix changeset messages with `feat:`, `fix:`, or `chore:`.

Thank you for helping us maintain a consistent and predictable release process! ❤️

## 🤝 Contributing

We welcome all kinds of contributions! Please see our [CONTRIBUTING.md](./CONTRIBUTING.md) for details on how to get started.

## � Sponsoring

If you find our project useful and would like to support its development, you can become a sponsor! Your sponsorship will help us cover the costs of maintaining the project and allow us to dedicate more time to its development.

There are several ways you can sponsor us:

- [Become a GitHub sponsor](https://github.com/sponsors/Rar9)
- [Donate via PayPal](https://www.paypal.com/donate/?hosted_button_id=5VA28AG6MW2H2)

Thank you for your support! 🙏

## 👏 Thanks

To all our contributors — without you, SveltyCMS would never have been possible.

## ⭐ Give us a star

If you like what we're doing, give us a `star` and share our `SveltyCMS` project with others!

---

<p align="center">
<img width="100%" alt="SveltyCMS Builder" src="https://raw.githubusercontent.com/SveltyCMS/SveltyCMS/main/static/docs/SveltyCMS-Demo2.png">
<img width="100%" alt="SveltyCMS User" src="https://raw.githubusercontent.com/SveltyCMS/SveltyCMS/main/static/docs/SveltyCMS-Demo3.png">
</p>
