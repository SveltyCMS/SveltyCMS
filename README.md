<p style="border: none; margin-bottom:0; padding-bottom: 0;" align="center">
      <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://github.com/Rar9/SimpleCMS/blob/main/static/SimpleCMS_Logo_Round.png">
      <img width="200" alt="SimpleCMC logo" src="https://github.com/Rar9/SimpleCMS/blob/main/static/SimpleCMS_Logo_Round.png">
    </picture>
 </p>

<h1 align="center"><strong>SimpleCMS</strong></h1>

<p align="center">
<img alt="GitHub package.json version" src="https://img.shields.io/github/package-json/v/Rar9/SimpleCMS?style=flat-square">
</p>

<p align="center">
 <a href="https://kit.svelte.dev/">
  <img src="https://img.shields.io/badge/Svelte-FF3E00?logo=svelte&amp;logoColor=fff&amp;style=plastic" alt="Sveltekit Badge"/>
 </a> 
<a href="https://www.typescriptlang.org/">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&amp;logoColor=fff&amp;style=plastic" alt="TypeScript Badge"/>
</a> 
<a href="https://www.mongodb.com/"><img src="https://img.shields.io/badge/MongoDB-47A248?logo=mongodb&amp;logoColor=fff&amp;style=plastic" alt="Mongodb Badge" /> </a><a href="https://tailwindcss.com/"> 
   <img src="https://img.shields.io/badge/Tailwind%20CSS-06B6D4?logo=tailwindcss&logoColor=fff&style=plastic" alt="Tailwindcss Badge" /> 
 </a> 
</p>

<h2 align="center">
A powerful Headless CMS with sveltekit power
</h2>
<h3 align="center"><strong>It's fast, flexible and an easy to use modern content mangement system to provide a headless backend </strong></h3>

This CMS provides a backend based on a modern sveltekit framework with a fast MongoDB for document database scalability and flexibility.

New Collections can easily be implemented, due to full typescript support with already many support available widgets.

All fields offer full translations, and customisation as well as access restiction handeled by Lucia auth.

The System langauge uses typesave-i18n for :gb: English and :de: German out of the box, and can easily be extended to suport further languages.

We used tailwindcss and a skeleton UI tookit, so the CMS can be quickly optimised.

Data is provided via yoga graphql, to build extremely fast frontends

## :rocket: Setup

### Install all dependencies

```bash
pnpm i
```

### Environment File

rename the `.env.example` to `.env`.

Enter the access data to connect to your mongodb or mongo atlas

### :lock: Github OAuth (optional)

Create a Github OAuth app and copy-paste client id and secret into `.env`.

## :running: Run the application

```bash
pnpm run dev
```

## :art: Easy Theme Change

If you require a different look, use the skeleton theme generator to modify the `theme.postcss`

## :earth_africa: Extend System Language

To add more language just create a new language folder under `src/lib/i18n`. Best to copy de folder with the index.ts file and translate the available content to your needs.

## :clipboard: Easily create Data Collections

Greate Experience to designing user-friendly and intuitive interfaces for managing content.
Full Typescript support to display all available widgets, options to create fully custom data structures.
High security from granular individual widget access to role-based collection access control

## :question: Need help - Reach out to us if you're struggling with something

[GitHub Discussions](https://github.com/Rar9/SvelteCMS/discussions)

## :heart: Contributing & :euro: Sponsoring

Please read our [Code of Conduct](https://github.com/Rar9/SvelteCMS/blob/main/CODE-OF-CONDUCT.md) before submitting Pull Requests.

## :clap: Thanks to all our contributors without this would never have been possible

## Give us a star :star: if you like what we're doing.
