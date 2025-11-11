<p style="border: none; margin-bottom:0; padding-bottom: 0;" align="center">
  <img width="200" alt="SveltyCMS logo" src="https://raw.githubusercontent.com/SveltyCMS/SveltyCMS/main/static/SveltyCMS.png">
</p>

<h1 align="center"><strong>SveltyCMS - Headless CMS with Sveltekit Power</strong></h1>
<p align="center"><strong>(Still in Development - Your Support is always Appreciated!!)</strong></>

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

This SveltyCMS headless CMS provides a powerful backend based on a modern [SvelteKit 2 / Svelte 5](https://svelte.dev) framework. Being designed to be database agnostic, we currently launch with a fast [MongoDB](https://www.mongodb.com), and will use [drizzel](https://drizzle-orm.netlify.app) for future SQL/Postgres support.

Content Collections can easily be implemented, due to full typescript support by using many available widgets. We offer two ways to use define your collections, via code or via a Gui based collection builder.

All Widget fields offer full translation, and customization, validation using [valibot](https://valibot.dev) and access handling..

The System language uses [Inlang's Paraglide JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJs) a light weight JavaScript i18n library. :gb: English is our default and we offer multiple languages out of the box. More Languages can easily be extended to support further languages.

We used [tailwindcss](https://tailwindcss.com) and a [skeleton UI toolkit](https://www.skeleton.dev), so the CMS can be quickly optimized to your personal needs.

The Backend Data is provided via Rest Api or [GraphQL Yoga](https://the-guild.dev/graphql/yoga-server), to build extremely fast frontends.

<p align="center">
 <img width="100%" alt="SveltyCMS Gui" src="https://raw.githubusercontent.com/SveltyCMS/SveltyCMS/main/static/docs/SveltyCMS-Demo1.png">
</p>

## :toolbox: SveltyCMS & DXP: Your Gateway to Streamlined Digital Experiences

Leverage the power of SveltyCMS along with the capabilities of Developer Experience Platform (DXP). This potent combination redefines content development, making it agile, efficient and optimized.

When DXP integrates into our CMS, it presents a suite of advanced tools, offering developers the freedom and adaptability for content creation and management. The result is a streamlined workflow and a quicker process of crafting superior quality content.

Experience a leap in productivity with DXP seamlessly woven into SveltyCMS. Watch it automate routine tasks, provide clear interfaces and simplify CMS management. Developers can now channel their focus on core tasks - creating premium content and applications.

Footnote: As a headless CMS fortified with GraphQL API, SveltyCMS fully harnesses the potential of DXP, driving functions, ensuring scalability, enhancing adaptability and delivering personalized digital experiences. Empower your development voyage today with the versatile capabilities of SveltyCMS integrated with DXP.

## :rocket: Setup

### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js 20+** - [Download](https://nodejs.org/en/download/) | Check: `node --version`
- **Package Manager** - Choose one: [npm](https://www.npmjs.com/) (included with Node.js), [pnpm](https://pnpm.io/), or [bun](https://bun.sh) (recommended)
- **MongoDB** - Choose one option:
  - [MongoDB Community Server](https://www.mongodb.com/try/download/community) (local)
  - [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) (cloud, free tier available)
  - Docker: `docker run -d -p 27017:27017 mongo`
- **Git** - [Download](https://git-scm.com/downloads)

### Installation

#### 1. Clone the repository

```bash
git clone https://github.com/SveltyCMS/SveltyCMS.git
cd SveltyCMS
```

#### 2. Install dependencies

Choose your preferred package manager:

<details open>
<summary><b>npm</b></summary>

```bash
# Install all dependencies
npm install

# Development (CLI installer launches automatically if needed)
npm run dev

# Manual CLI Installer (optional)
npm run installer

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

# Manual CLI Installer (optional)
pnpm run installer

# Build for production
pnpm run build

# Preview production build
pnpm run preview
```

</details>

<details>
<summary><b>bun</b></summary>

```bash
# Install bun if you haven't already
curl -fsSL https://bun.sh/install | bash

# Install all dependencies
bun install

# Development (CLI installer launches automatically if needed)
bun run dev

# Manual CLI Installer (optional)
bun run installer

# Build for production
bun run build

# Preview production build
bun run preview
```

</details>

#### 3. Start development server

```bash
bun run dev  # or npm run dev / pnpm run dev
```

The application will open at `http://localhost:5173`

### Setup Wizard

On first launch, the **GUI Setup Wizard** will automatically appear. Follow these steps:

**Step 1: Database Configuration**

- Select database type (MongoDB recommended)
- Enter connection details (host, port, database name)
- For local MongoDB without auth, leave username/password empty
- Click "Test Connection" to verify

**Step 2: Admin Account**

- Create your administrator account
- Enter username, email, and secure password

**Step 3: System Settings**

- Configure CMS name and URL
- Set default language and timezone
- Choose media storage location

**Step 4: Complete**

- Review configuration
- Click "Complete Setup"
- Login with your admin credentials

### Troubleshooting

**MongoDB connection failed**

- Ensure MongoDB is running: `sudo systemctl start mongod` (Linux) or check MongoDB Compass
- Verify connection details
- For Atlas, check IP whitelist

**Port 5173 already in use**

- Stop other applications or change port in `vite.config.ts`

**Setup wizard doesn't appear**

- Delete `config/private.ts` if it exists and restart

**Authentication timeout**

- Check MongoDB has data (roles/users)
- Use "Reset Setup" button on login page if needed

### Additional Features

SveltyCMS includes:

- **Smart Detection**: Runs automatically via `vite.config.ts` when config files are missing
- **Database Configuration**: Choose from MongoDB, PostgreSQL, or SQLite
- **Admin Account Setup**: Create your first administrator account
- **Security Configuration**: Automatic generation of secrets and keys
- **Email & OAuth Setup**: Optional SMTP and Google OAuth configuration

Simply run `bun run dev` (or npm/pnpm equivalent) and follow the interactive prompts!

### Development and Production

See our `package.json` for more information about development, build, preview, format, lint & testing commands.

Development server runs on `localhost:5173`
Preview server runs on `localhost:4173`

## :lock: Authentication & Security

We want to keep your data Private and Secure.

Our extensive Authentication allows us to stay flexible for the future and adapt to changing security needs.

You can login into SveltyCMS by email and password or use google oauth.

Field-based content access enables the allocation of varying levels of access to users according to their roles and permissions. This way, you can control who can view, edit, or delete your data.

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

- 📖 **[Full Documentation](docs/)** - Complete guides, API reference, and architecture docs
- 🚀 **[Installation Guide](docs/installation.mdx)** - Setup instructions
- 🎯 **[Getting Started](docs/getting-started.mdx)** - Quick start guide
- 🧪 **[Testing Guide](docs/testing.mdx)** - Testing documentation
- 🤝 **[Contributing Guide](CONTRIBUTING.md)** - How to contribute

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

We welcome all kinds of contributions! Please see our [`CONTRIBUTING.md`](https://github.com/SveltyCMS/SveltyCMS/CONTRIBUTING.md) for details on how to get started with this.

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
