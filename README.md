<p style="border: none; margin-bottom:0; padding-bottom: 0;" align="center">
  <img width="200" alt="SveltyCMS logo" src="https://raw.githubusercontent.com/SveltyCMS/SveltyCMS/main/static/SveltyCMS.png">
</p>

<h1 align="center"><strong>SveltyCMS - Headless CMS with Sveltekit Power</strong></h1>
<p align="center"><strong>(Still in Development — your support is appreciated!)</strong></p>

<div align="center">

[![Chat](https://img.shields.io/discord/1369537436656603188?label=chat&logo=discord&color=7289da)](https://discord.gg/qKQRB6mP)

 <img alt="Latest SemVer" src="https://img.shields.io/github/v/tag/SveltyCMS/SveltyCMS">
 <img alt="GitHub issues" src="https://img.shields.io/github/issues/SveltyCMS/SveltyCMS">
 <img alt="Bundle Size" src="https://img.shields.io/badge/Bundle-508%20KB%20Brotli-success?style=flat">
</div>
<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![SvelteKit](https://img.shields.io/badge/SvelteKit-V2-FF3E00?logo=svelte)](https://kit.svelte.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwindcss](https://img.shields.io/badge/Tailwind%20CSS-4-38B2AC)](https://tailwindcss.com/)

</div>

<p align="center">
  <a href="https://github.com/SveltyCMS/SveltyCMS/actions/workflows/github-code-scanning/codeql"><img alt="CodeQL" src="https://github.com/SveltyCMS/SveltyCMS/actions/workflows/github-code-scanning/codeql/badge.svg"></a>
  <a href="https://github.com/SveltyCMS/SveltyCMS/actions/workflows/playwright.yml"><img alt="Playwright Tests" src="https://github.com/SveltyCMS/SveltyCMS/actions/workflows/playwright.yml/badge.svg"></a>
  <a href="https://github.com/SveltyCMS/SveltyCMS/actions/workflows/auto-release.yaml"><img alt="Auto Release" src="https://github.com/SveltyCMS/SveltyCMS/actions/workflows/auto-release.yaml/badge.svg"></a>
</p>

<h2 align="center">A powerful Headless CMS with Sveltekit Power</h2>

<h3 align="center"><strong>It's lightning fast, flexible and an easy to use modern content management system to provide a headless backend</strong></h3>

This SveltyCMS headless CMS provides a powerful backend based on a modern [SvelteKit 2 / Svelte 5](https://svelte.dev) framework. Being designed to be database agnostic, we currently launch with [MongoDB](https://www.mongodb.com); SQL/Postgres support via [Drizzle ORM](https://drizzle-orm.netlify.app) is planned.

You can define Content Collections in two ways: in code or via the GUI-based collection builder. Full TypeScript support and a rich widget library make it straightforward to build custom data structures.

All widget fields support localization, validation using [Valibot](https://valibot.dev), and access control.

System localization uses [Inlang Paraglide JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJs), a lightweight, type-safe i18n library. English is the default; additional languages are bundled and can be extended.

We used [tailwindcss](https://tailwindcss.com) and a [skeleton UI toolkit](https://www.skeleton.dev), so the CMS can be quickly optimized to your personal needs.

Backend data is available via REST API or [GraphQL Yoga](https://the-guild.dev/graphql/yoga-server) for fast, flexible frontends.

## ⭐ Key Features

| Feature                    | Status     | Notes                                                         |
| -------------------------- | ---------- | ------------------------------------------------------------- |
| Collection Builder         | ✅         | GUI and code-based definitions                                |
| Typed Widget System        | ✅         | Localization, validation, access control                      |
| Multi-language (Paraglide) | ✅         | Type-safe i18n out of the box                                 |
| REST API                   | ✅         | CRUD and configuration endpoints                              |
| GraphQL API (Yoga)         | ✅         | High-performance schema                                       |
| Database Resilience        | ✅         | Retries, self-healing reconnection, diagnostics, log download |
| Email Templating           | ✅         | Svelte Email + SMTP                                           |
| Roles & Permissions        | ✅         | Database-backed access control                                |
| SQL/Postgres via Drizzle   | 📅 Planned | Roadmap item                                                  |

## 🚀 Quick Start

Get up and running fast:

1. Clone and install

```bash
git clone https://github.com/SveltyCMS/SveltyCMS.git
cd SveltyCMS
bun install  # or npm/pnpm
```

2. Start dev server (guided installer auto-launches)

```bash
bun run dev  # or npm run dev / pnpm run dev
```

3. Open the app

- Admin: http://localhost:5173/admin
- API: http://localhost:5173/api
- GraphQL: http://localhost:5173/api/graphql

Prefer a full walkthrough? See: ./docs/getting-started.mdx

<p align="center">
 <img width="100%" alt="SveltyCMS Gui" src="https://raw.githubusercontent.com/SveltyCMS/SveltyCMS/main/static/docs/SveltyCMS-Demo1.png">
</p>

## :toolbox: Developer Experience (DXP)

- CLI installer auto-launches for smooth first-run setup
- Typed widgets and schema-driven collection builder
- Fast feedback loop with hot reloads and strong typing

## :rocket: Fresh Installation Guide

### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v20 or higher) - [Download](https://nodejs.org/en)
- **Bun** (recommended) - [Install](https://bun.sh)
- **MongoDB** (v6 or higher) - [Download](https://www.mongodb.com/try/download/community)
- **Git** - [Download](https://git-scm.com/downloads)

### Step 1: Clone the Repository

```bash
git clone https://github.com/SveltyCMS/SveltyCMS.git
cd SveltyCMS
```

### Step 2: Install Dependencies

We recommend using **Bun** for the best performance:

```bash
# Install Bun if you haven't already
curl -fsSL https://bun.sh/install | bash

# Install all dependencies
bun install
```

<details>
<summary>Alternative: Using npm or pnpm</summary>

```bash
# Using npm
npm install

# Using pnpm
npm install -g pnpm
pnpm install
```

</details>

### Step 3: Start MongoDB

Ensure MongoDB is running on your system:

```bash
# On Linux/macOS
sudo systemctl start mongod

# On macOS with Homebrew
brew services start mongodb-community

# On Windows
net start MongoDB
```

Verify MongoDB is running:

```bash
mongosh --eval "db.version()"
```

### Step 4: Run SveltyCMS

SveltyCMS uses a smart launcher that automatically detects if setup is needed:

```bash
# Smart launcher - automatically runs setup wizard or CMS
bun dev
```

**First Time Setup:**

- The launcher detects no configuration exists
- Automatically opens setup wizard at `http://localhost:5174`
- Guide you through:
  - Database configuration
  - Admin account creation
  - Email settings (optional)
  - Security configuration

**After Setup:**

- Run `bun dev` again
- Launcher detects valid configuration
- Automatically starts CMS at `http://localhost:5173`

**Manual Control:**

```bash
# Force setup wizard (useful for testing)
bun dev:setup

# Force CMS (skip validation)
bun dev:cms
```

### Quick Start Commands

```bash
# Smart launcher (auto-detects setup need)
bun dev

# Force setup wizard
bun dev:setup

# Force CMS
bun dev:cms

# Build for production
bun build

# Build all apps
bun build:all

# Run documentation site
bun nx run docs:dev

# Run all tests
bun nx run-many --target=test --all

# Lint all projects
bun nx run-many --target=lint --all
```

### Monorepo Structure

SveltyCMS uses NX monorepo with the following apps:

```
apps/
├── cms/              # Main CMS application
├── setup-wizard/     # Initial setup wizard
├── docs/             # Documentation site
├── shared-config/    # Shared configuration
├── shared-utils/     # Shared utilities
└── shared-theme/     # Shared theme
```

### Common Issues & Solutions

**Issue: MongoDB connection failed**

```bash
# Solution: Check if MongoDB is running
sudo systemctl status mongod

# Or start MongoDB
sudo systemctl start mongod
```

**Issue: Port already in use**

```bash
# Solution: Kill the process using the port
# For port 5173 (CMS)
lsof -ti:5173 | xargs kill -9

# For port 5174 (Setup Wizard)
lsof -ti:5174 | xargs kill -9
```

**Issue: Dependency scan errors**

```bash
# Solution: Clear caches and reinstall
rm -rf node_modules/.vite
rm -rf apps/cms/.svelte-kit
rm -rf apps/setup-wizard/.svelte-kit
bun install
```

**Issue: Build fails**

```bash
# Solution: Clear NX cache and rebuild
bun nx reset
bun install
bun nx run cms:build
```

### Environment Configuration

After running the setup wizard, your configuration will be saved in:

- `config/private.ts` - Database and security settings
- `config/roles.ts` - User roles and permissions

You can manually edit these files if needed.

### Next Steps

After installation:

1. Log in to the CMS at `http://localhost:5173`
2. Create your first collection
3. Add content
4. Access via REST API or GraphQL at `/api/graphql`

For detailed documentation, see our [Documentation](docs/) folder.

## :lock: Authentication & Security

We want to keep your data Private and Secure.

Our extensive Authentication allows us to stay flexible for the future and adapt to changing security needs.

You can log in with email/password or Google OAuth. Role- and field-based access control lets you define precisely who can view, edit, or delete content. Sensitive data is masked in logs; admin-only endpoints protect operational features.

## :art: Easy Theme Adaptions to your needs

If you require a different look, use the [skeleton theme generator](https://www.skeleton.dev/docs/generator) and modify the `SveltyCMSTheme.ts` to your needs

## :earth_africa: Great System Localization i18n infrastructure

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

## :clipboard: Easily create Data Collections

Great Experience to designing user-friendly and intuitive interfaces for managing content.
Full Typescript support to display all available widgets, options to create fully custom data structures.

## :incoming_envelope: Flexible Email Templating System

Build and send emails using [Svelty Email](https://svelte-email.vercel.app/) and TypeScript.

## 📦 Optimized Bundle Size

SveltyCMS is built with modern optimization techniques resulting in a **compact bundle** compared to traditional CMS platforms:

<div align="center">

| CMS Platform    | Bundle Size (gzipped) | Bundle Size (Brotli) | Technology Stack   |
| --------------- | --------------------- | -------------------- | ------------------ |
| **SveltyCMS**   | **604 KB**            | **508 KB** ⚡        | SvelteKit 5 + Vite |
| WordPress Admin | ~800 KB               | ~675 KB              | jQuery + PHP       |
| Drupal Admin    | ~1.1 MB               | ~930 KB              | jQuery + Drupal    |

</div>

**What this means:**

- ✅ **Smaller downloads** = Faster initial load
- ✅ **Lower bandwidth costs** = Savings at scale
- ✅ **Better mobile experience** = Works well on slower connections
- ✅ **Brotli compression** = Automatically served by modern servers

## 📚 Documentation

Comprehensive documentation is available to help you get started:

- 📖 **[Documentation](./docs/)** — Guides, API reference, and architecture
- 🎯 **[Getting Started](./docs/getting-started.mdx)** — Quick start
- � **Architecture: Database Resilience** — `./docs/architecture/database-resilience.mdx`
- 🤝 **[Contributing Guide](./CONTRIBUTING.md)** — How to contribute

## :question: Need help

Contact us if you're struggling with installation or other issues:

- 💬 [GitHub Discussions](https://github.com/SveltyCMS/SveltyCMS/discussions)
- 💬 [Discord Server](https://discord.gg/qKQRB6mP)
- 🔧 [Report Issues](https://github.com/SveltyCMS/SveltyCMS/issues)
- 📖 [Documentation](docs/)
- 📧 Email: support@sveltycms.com

## :rocket: Semantic Versioning

For detailed information on our Git workflow, branching strategy, and commit conventions, see our [Git Workflow & Automated Releases guide](docs/git-workflows.mdx).

We use [semantic versioning](https://semver.org/) to manage our releases. This means that our version numbers follow a specific format: `MAJOR.MINOR.PATCH`.

- `MAJOR` version changes when we make incompatible API changes,
- `MINOR` version changes when we add functionality in a backwards-compatible manner, and
- `PATCH` version changes when we make backwards-compatible bug fixes.

When submitting pull requests, please make sure your commit messages follow the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification. This will help us automatically generate changelogs and release notes.

Please also read our [Code of Conduct](https://github.com/SveltyCMS/SveltyCMS/blob/main/CODE-OF-CONDUCT.md) before submitting Pull Requests.

If your PR makes a change that should be noted in one or more packages' changelogs, generate a changeset by running pnpm changeset and following the prompts.
Changesets that add features should be minor and those that fix bugs should be patch.

Run the tests with `pnpm test` and lint the project with `pnpm lint` and `pnpm check`

Please prefix changeset messages with `feat:`, `fix:`, or `chore:`.

Thank you for helping us maintain a consistent and predictable release process! :heart:

# Contributing

We welcome all kinds of contributions! Please see our [`CONTRIBUTING.md`](./CONTRIBUTING.md) for details on how to get started.

## 🔌 Quick API Examples

REST (fetch 5 posts):

```bash
curl -H "Authorization: Bearer <token>" \
  "http://localhost:5173/api/collections/posts?limit=5"
```

GraphQL (posts with author):

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

## :moneybag: Sponsoring

If you find our project useful and would like to support its development, you can become a sponsor! Your sponsorship will help us cover the costs of maintaining the project and allow us to dedicate more time to its development.

There are several ways you can sponsor us:

- [Become a GitHub sponsor](https://github.com/sponsors/Rar9)
- [Donate via PayPal](https://www.paypal.com/donate/?hosted_button_id=5VA28AG6MW2H2)

Thank you for your support!

## :clap: Thanks

To all our contributors without this SveltyCMS would never have been possible.

# :star: Give us a star

If you like what we're doing, give us a `star` and share our `SveltyCMS` project with others

<p align="center">
<img width="100%" alt="SveltyCMS Builder" src="https://raw.githubusercontent.com/SveltyCMS/SveltyCMS/main/static/docs/SveltyCMS-Demo2.png">
<img width="100%" alt="SveltyCMS User" src="https://raw.githubusercontent.com/SveltyCMS/SveltyCMS/main/static/docs/SveltyCMS-Demo3.png">
</p>
