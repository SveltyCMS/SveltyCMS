# CMS Application

Main SveltyCMS content management application with full admin functionality.

## Purpose

- Content management with collections
- Media gallery and file management
- User management and authentication
- Dashboard with system monitoring
- Configuration and settings
- GraphQL API

## Structure

```
apps/cms/
├── src/
│   ├── app.html
│   ├── app.css
│   ├── app.d.ts
│   ├── hooks.server.ts
│   ├── content/              # Content management
│   ├── lib/hooks/            # CMS-specific hooks
│   ├── messages/             # CMS-specific translations
│   │   ├── en.json
│   │   └── de.json
│   ├── routes/
│   │   ├── (app)/            # Protected CMS routes
│   │   ├── api/              # REST/GraphQL endpoints
│   │   ├── login/            # Authentication
│   │   ├── files/            # Static file serving
│   │   └── email-previews/   # Email templates
│   └── widgets/              # CMS widgets
│       ├── core/             # Built-in widgets
│       └── custom/           # Extended widgets
├── project.json
├── project.inlang/
├── svelte.config.js
├── vite.config.ts
└── tsconfig.json
```

## Commands

```bash
nx dev cms      # Development server
nx build cms    # Production build
nx check cms    # TypeScript check
```

## Dependencies

Uses shared libraries:

- `@shared/database` - Database adapters
- `@shared/theme` - UI theming
- `@shared/utils` - Utility functions
- `@shared/components` - Shared UI components
- `@shared/hooks` - Security hooks
- `@shared/stores` - State management
- `@shared/paraglide` - i18n
