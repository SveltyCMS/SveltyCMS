<p style="border: none; margin-bottom:0; padding-bottom: 0;" align="center">
      <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://github.com/Rar9/SimpleCMS/blob/main/static/SimpleCMS_Logo_Round.png">
      <img width="200" alt="SimpleCMC logo" src="https://github.com/Rar9/SimpleCMS/blob/main/static/SimpleCMS_Logo_Round.png">
    </picture>
 </p>

<h1 align="center"><strong>SimpleCMS</strong></h1>
<p align="center"><strong>(Still in Development - Support always Appriciated!!)</strong></>

<p align="center">
  <img alt="GitHub package.json version" src="https://img.shields.io/github/package-json/v/Rar9/SimpleCMS">

  <img alt="GitHub issues" src="https://img.shields.io/github/issues/Rar9/SimpleCMS" >

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

<h2 align="center">A powerful Headless CMS with sveltekit power</h2>

<h3 align="center"><strong>It's fast, flexible and an easy to use modern content mangement system to provide a headless backend </strong></h3>

This CMS provides a backend based on a modern sveltekit framework with a fast MongoDB for document database scalability and flexibility.

New Collections can easily be implemented, due to full typescript support with already many support available widgets.

All fields offer full translations, and customisation as well as access restiction handeled by Lucia auth.

The System langauge uses typesave-i18n for :gb: English and :de: German out of the box, and can easily be extended to suport further languages.

We used tailwindcss and a skeleton UI tookit, so the CMS can be quickly optimised.

Data is provided via yoga graphql, to build extremely fast frontends

## :rocket: Setup

### Clone the repository

```bash
git clone https://github.com/Rar9/SimpleCMS.git
```

### Install all dependencies

```bash
pnpm i
```

### Setup Environment File

rename the `.env.example` to `.env`.

- Extend Languages if other are required
- Enter the access data to connect to your mongodb or mongo atlas
- Setup your Email SMTP & HOST
- Add your API Tokes for the individual Widget you need to use

### Run the application

```bash
pnpm dev
```

## :lock: Authentication & Security

Simple and clean Authentication using [Lucai Auth](https://lucia-auth.com/)
We want to keep your data Private and Secure.

## :art: Easy Theme Adaptions to your needs

If you require a different look, use the [skeleton theme generator](https://www.skeleton.dev/docs/generator) and modify the `theme.postcss` to your needs

## :earth_africa: Greate System Localization infrastructure

We use [Typesafe-i18n ](https://github.com/ivanhofer/typesafe-i18n) and [inlang](https://inlang.com/) for System Translations.

Current System Translations are available at: [inLang](https://inlang.com/editor/github.com/Rar9/SimpleCMS)

If a language has not yet been defined, reach out to us, so that you can help to extend the System Localization.

## :clipboard: Easily create Data Collections

Greate Experience to designing user-friendly and intuitive interfaces for managing content.
Full Typescript support to display all available widgets, options to create fully custom data structures.
High security from granular individual widget access to role-based collection access control

## :incoming_envelope: Flexible Email Templating System

Build and send emails using [Svelte Email](https://svelte-email.vercel.app/) and TypeScript.

## :question: Need help

Reach out to us if you're struggling with something - [GitHub Discussions](https://github.com/Rar9/SvelteCMS/discussions)

## :heart: Contributing & Sponsoring

Please read our [Code of Conduct](https://github.com/Rar9/SvelteCMS/blob/main/CODE-OF-CONDUCT.md) before submitting Pull Requests.

Sponsors are always welcome to contribute to get a custom CMS experience.

## :clap: Thanks

to all our contributors without this would never have been possible

# :star: Give us a star

if you like what we're doing, give us a star and share our SimpleCMS project with others
