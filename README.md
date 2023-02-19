# SimpleCMS

## is a flexible Content Manage System to provide a headless backend

This CMS provides a backend based on a modern sveltekit framework with a fast MongoDB for document database scalability and flexibility.

New Collections can easily be implemented, due to full typescript support with already many support available widgets.

All fields offer full translations, and customisation as well as access restiction handeled by Lucia auth.

The System langauge uses typesave-i18n for English and German out of the box, and can easily be extended to suport further languages.

We used tailwindcss and a skeleton UI tookit, so the CMS can be quickly optimised.

Data is provided via graphql, to build extremely fast frontends

## Setup

### Install all dependencies

```bash
pnpm i
```

### Environment File

rename the `.env.example` to `.env`.

Enter the access data to connect to your mongodb or mongo atlas

### Github OAuth (optional)

Create a Github OAuth app and copy-paste client id and secret into `.env`.

## Run the application

```bash
pnpm run dev
```

## Easy Theme Change

If you require a different look, use the skeleton theme generator to modify the `theme.postcss`

## Extend System Language

to add more language just create a new language folder under `src/lib/i18n`. Best to copy de folder with the index.ts file and translate the available content to your needs.

## Create a Data Collection

User Typescript to get all available widget options to create fully custom data structures.
