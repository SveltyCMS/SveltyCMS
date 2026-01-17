# Setup Wizard Application

SveltyCMS setup wizard for initial configuration. This is a standalone app that only bundles the necessary code for setup.

## Purpose

- Database configuration and driver selection
- Initial admin user creation
- System settings configuration
- Only loads the selected database driver (conditional loading)

## Structure

```
apps/setup/
├── src/
│   ├── app.html
│   ├── app.css
│   ├── app.d.ts
│   ├── hooks.server.ts
│   ├── messages/         # Setup-specific translations
│   │   ├── en.json
│   │   └── de.json
│   └── routes/
│       └── setup/        # Setup wizard routes
├── project.json          # NX project config
├── project.inlang/       # Paraglide config
├── svelte.config.js
├── vite.config.ts
└── tsconfig.json
```

## Commands

```bash
nx dev setup      # Development server
nx build setup    # Production build
nx check setup    # TypeScript check
```

## Dependencies

Uses shared libraries:

- `@shared/database` - Conditional database loading
- `@shared/theme` - UI theming
- `@shared/utils` - Utility functions
- `@shared/components` - Shared UI components
