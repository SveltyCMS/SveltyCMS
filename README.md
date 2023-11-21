<p style="border: none; margin-bottom:0; padding-bottom: 0;" align="center">
      <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://github.com/Rar9/SimpleCMS/blob/main/static/SimpleCMS_Logo_Round.png">
      <img width="200" alt="SimpleCMC logo" src="https://github.com/Rar9/SimpleCMS/blob/main/static/SimpleCMS_Logo_Round.png">
    </picture>
 </p>

<h1 align="center"><strong>SimpleCMS</strong></h1>
<p align="center"><strong>(Still in Development - Support always Appreciated!!)</strong></>

<p align="center">
  <img alt="GitHub package.json version" src="https://img.shields.io/github/package-json/v/Rar9/SimpleCMS">
  <img alt="GitHub issues" src="https://img.shields.io/github/issues/Rar9/SimpleCMS">
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
  <a href="https://github.com/Rar9/SimpleCMS/actions/workflows/github-code-scanning/codeql"><img alt="CodeQL" src="https://github.com/Rar9/SimpleCMS/actions/workflows/github-code-scanning/codeql/badge.svg"></a>
  <a href="https://github.com/Rar9/SimpleCMS/actions/workflows/playwright.yml"><img alt="Playwright Tests" src="https://github.com/Rar9/SimpleCMS/actions/workflows/playwright.yml/badge.svg"></a>
  <a href="https://github.com/Rar9/SimpleCMS/actions/workflows/auto-release.yaml"><img alt="Auto Release" src="https://github.com/Rar9/SimpleCMS/actions/workflows/auto-release.yaml/badge.svg"></a>
</p>

<h2 align="center">A powerful Headless CMS with sveltekit power</h2>

<h3 align="center"><strong>It's lightning fast, flexible and an easy to use modern content management system to provide a headless backend </strong></h3>

This sveltekit CMS provides a backend based on a modern sveltekit framework with a fast MongoDB for document database scalability and flexibility.

New Collections can easily be implemented, due to full typescript support with already many support available widgets.

All fields offer full translations, and customization as well as access restriction handled by Lucia auth.

The System language uses ParaglideJS aJavaScript i18n library to providing :gb: English, :de: German, :es: Spanish and :fr: French out of the box. It can easily be extended to support further languages.

We used tailwindcss and a skeleton UI toolkit, so the CMS can be quickly optimized.

Data is provided via yoga graphql, to build extremely fast frontend

## :rocket: Setup

### Clone the repository

To clone our [repository](https://github.com/Rar9/SimpleCMS.git) you need to be able to use [Git](https://git-scm.com/downloads).

```bash
git clone https://github.com/Rar9/SimpleCMS.git

cd SimpleCMS
```

### Install all dependencies

Your need [Node.js](https://nodejs.org/en) to get started which ships with npm.
We recommend the faster [pnpm](https://pnpm.io) package manager.
[Yarn](https://yarnpkg.com) and the [bun.sh](https://bun.sh) can also be used.

```bash
pnpm install  # installs all required package dependencies
```

### Setup Environment File

rename the `.env.example` to `.env`.

- Enter fill in your access data to connect to a [MongoDB or MongoDB Atlas database](https://www.mongodb.com)
- Extend database Languages if other are required
- Setup your Email `SMTP` & `HOST` to allow sending emails
- Add your required API Tokens for the Widgets you need use

### Start the application for development or production

See our `package.json` for more information like development, preview, build and testing.

```bash
pnpm dev     # run development on localhost:5173
pnpm build   # runs for production and can be previewed localhost:4173
```

## :lock: Authentication & Security

We want to keep your data Private and Secure.

[Lucia Auth](https://lucia-auth.com/) Authentication allows us to stay flexible for the future and adapt to changing security needs.

You can sign by email, github oauth and also enable 2FA for an extra layer of protection.

Field-based content access enables the allocation of varying levels of access to users according to their roles and permissions. This way, you can control who can view, edit, or delete your data.

## :art: Easy Theme Adaptions to your needs

If you require a different look, use the [skeleton theme generator](https://www.skeleton.dev/docs/generator) and modify the `SimpleCMSTheme.ts` to your needs

## :earth_africa: Great System Localization i18n infrastructure

We use [Paraglide JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJs), the best i18n library together with [inlang](https://inlang.com/) ecosystem for first class System Translations with full typescript support.

Our System Translations are available at: [inlang](https://inlang.com/editor/github.com/Rar9/SimpleCMS) and can easily be extended.

If a language has not yet been defined, reach out to us, so that you can help extend the System Localization.

## :clipboard: Easily create Data Collections

Great Experience to designing user-friendly and intuitive interfaces for managing content.
Full Typescript support to display all available widgets, options to create fully custom data structures.

## :incoming_envelope: Flexible Email Templating System

Build and send emails using [Svelte Email](https://svelte-email.vercel.app/) and TypeScript.

## :question: Need help

Reach out to us if you're struggling with something - [GitHub Discussions](https://github.com/Rar9/SvelteCMS/discussions)

## :rocket: Semantic Versioning

We use [semantic versioning](https://semver.org/) to manage our releases. This means that our version numbers follow a specific format: `MAJOR.MINOR.PATCH`.

- `MAJOR` version changes when we make incompatible API changes,
- `MINOR` version changes when we add functionality in a backwards-compatible manner, and
- `PATCH` version changes when we make backwards-compatible bug fixes.

When submitting pull requests, please make sure your commit messages follow the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification. This will help us automatically generate changelogs and release notes.

Please also read our [Code of Conduct](https://github.com/Rar9/SvelteCMS/blob/main/CODE-OF-CONDUCT.md) before submitting Pull Requests.

Thank you for helping us maintain a consistent and predictable release process! :heart:

## :moneybag: Sponsoring

If you find our project useful and would like to support its development, you can become a sponsor! Your sponsorship will help us cover the costs of maintaining the project and allow us to dedicate more time to its development.

There are several ways you can sponsor us:

- [Become a GitHub sponsor](https://github.com/sponsors/Rar9)
- [Donate via PayPal](https://www.paypal.com/donate/?hosted_button_id=5VA28AG6MW2H2)

Thank you for your support!

## :clap: Thanks

to all our contributors without this would never have been possible

# :star: Give us a star

if you like what we're doing, give us a star and share our SimpleCMS project with others
