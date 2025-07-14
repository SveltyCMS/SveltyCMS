<p style="border: none; margin-bottom:0; padding-bottom: 0;" align="center">
  <img width="200" alt="SveltyCMS logo" src="https://github.com/SveltyCMS/SveltyCMS/raw/main/static/SveltyCMS-light.png">
</p>

<h1 align="center"><strong>SveltyCMS - Headless CMS with Sveltekit Power</strong></h1>
<p align="center"><strong>(Still in Development - Your Support is always Appreciated!!)</strong></>

<p align="center">
 <img alt="Latest SemVer" src="https://img.shields.io/github/v/tag/Rar9/SveltyCMS">
 <img alt="GitHub issues" src="https://img.shields.io/github/issues/Rar9/SveltyCMS">
</p>

<p align="center">
  <a href="https://kit.svelte.dev/">
    <img src="https://img.shields.io/badge/Svelte-FF3E00?logo=svelte&amp;logoColor=fff&amp;" alt="Sveltekit Badge"/>
  </a>

  <a href="https://www.typescriptlang.org/">
    <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&amp;logoColor=fff&amp;" alt="TypeScript Badge"/>
  </a>

  <a href="https://www.mongodb.com/">
    <img src="https://img.shields.io/badge/MongoDB-47A248?logo=mongodb&amp;logoColor=fff&amp;" alt="Mongodb Badge" />
  </a>

  <a href="https://tailwindcss.com/">
    <img src="https://img.shields.io/badge/Tailwind%20CSS-06B6D4?logo=tailwindcss&logoColor=fff&" alt="Tailwindcss Badge" />
  </a>
</p>

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
 <img width="100%" alt="SveltyCMS Gui" src="https://github.com/SveltyCMS/SveltyCMS/blob/main/static/docs/SveltyCMS-Demo1.png">
</p>

## :toolbox: SveltyCMS & DXP: Your Gateway to Streamlined Digital Experiences

Leverage the power of SveltyCMS along with the capabilities of Developer Experience Platform (DXP). This potent combination redefines content development, making it agile, efficient and optimized.

When DXP integrates into our CMS, it presents a suite of advanced tools, offering developers the freedom and adaptability for content creation and management. The result is a streamlined workflow and a quicker process of crafting superior quality content.

Experience a leap in productivity with DXP seamlessly woven into SveltyCMS. Watch it automate routine tasks, provide clear interfaces and simplify CMS management. Developers can now channel their focus on core tasks - creating premium content and applications.

Footnote: As a headless CMS fortified with GraphQL API, SveltyCMS fully harnesses the potential of DXP, driving functions, ensuring scalability, enhancing adaptability and delivering personalized digital experiences. Empower your development voyage today with the versatile capabilities of SveltyCMS integrated with DXP.

## :rocket: Setup

### Clone the repository

To clone our [repository](https://github.com/SveltyCMS/SveltyCMS.git) you need to be able to use [Git](https://git-scm.com/downloads).

```bash
git clone https://github.com/SveltyCMS/SveltyCMS.git
cd SveltyCMS
```

### Install all dependencies

Install STABLE [Node.js](https://nodejs.org/en) to get started. Then choose your preferred package manager:

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

### Automated Setup via CLI Installer

SveltyCMS features an intelligent CLI installer that automatically launches when you start the development server without configuration files. The installer handles all setup automatically:

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

Our System Translations are available at: [inlang](https://inlang.com/editor/github.com/Rar9/SveltyCMS) and can easily be extended.

If a language has not yet been defined, reach out to us, so that you can help extend the System Localization.

</td>
<td>

[![inlang status badge](https://badge.inlang.com/?url=github.com/Rar9/SveltyCMS)](https://fink.inlang.com/github.com/Rar9/SveltyCMS?ref=badge)

</td>
</tr>
</table>

## :clipboard: Easily create Data Collections

Great Experience to designing user-friendly and intuitive interfaces for managing content.
Full Typescript support to display all available widgets, options to create fully custom data structures.

## :incoming_envelope: Flexible Email Templating System

Build and send emails using [Svelty Email](https://svelte-email.vercel.app/) and TypeScript.

## :question: Need help

Contact us if you're struggling installation or other issues via:
[GitHub Discussions](https://github.com/SveltyCMS/SvelteCMS/discussions)

## :rocket: Semantic Versioning

We use [semantic versioning](https://semver.org/) to manage our releases. This means that our version numbers follow a specific format: `MAJOR.MINOR.PATCH`.

- `MAJOR` version changes when we make incompatible API changes,
- `MINOR` version changes when we add functionality in a backwards-compatible manner, and
- `PATCH` version changes when we make backwards-compatible bug fixes.

When submitting pull requests, please make sure your commit messages follow the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification. This will help us automatically generate changelogs and release notes.

Please also read our [Code of Conduct](https://github.com/SveltyCMS/SvelteCMS/blob/main/CODE-OF-CONDUCT.md) before submitting Pull Requests.

If your PR makes a change that should be noted in one or more packages' changelogs, generate a changeset by running pnpm changeset and following the prompts.
Changesets that add features should be minor and those that fix bugs should be patch.

Run the tests with `pnpm test` and lint the project with `pnpm lint` and `pnpm check`

Please prefix changeset messages with `feat:`, `fix:`, or `chore:`.

Thank you for helping us maintain a consistent and predictable release process! :heart:

# Contributing

We welcome all kinds of contributions! Please see our [`CONTRIBUTING.md`](https://github.com/SveltyCMS/SvelteCMS/CONTRIBUTING.md) for details on how to get started with this.

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
<img width="100%" alt="SveltyCMS Builder" src="https://github.com/SveltyCMS/SveltyCMS/blob/main/static/docs/SveltyCMS-Demo2.png">
<img width="100%" alt="SveltyCMS User" src="https://github.com/SveltyCMS/SveltyCMS/blob/main/static/docs/SveltyCMS-Demo3.png">
</p>
