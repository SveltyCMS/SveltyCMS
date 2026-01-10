# Setup Wizard Application

The first-time installation wizard for SveltyCMS.

## Purpose

This standalone application handles:
- Database driver selection (MongoDB or Drizzle)
- Database connection configuration
- Initial admin user creation
- System preferences setup

## Key Features

- **Minimal Bundle**: Only includes setup-related code
- **Driver Selection**: Dynamically loads only the selected database driver
- **Step-by-step**: Guided wizard interface
- **Validation**: Real-time connection testing

## Structure

```
apps/setup/
├── src/
│   ├── routes/
│   │   └── setup/       # Setup wizard pages
│   ├── components/      # Setup-specific components
│   └── lib/             # Setup utilities
├── static/              # Static assets
├── project.json         # Nx project configuration
├── vite.config.ts       # Vite configuration
├── svelte.config.js     # Svelte configuration
└── tsconfig.json        # TypeScript configuration
```

## Development

```bash
# Run development server
nx dev setup

# Build for production
nx build setup

# Preview production build
nx preview setup
```

## Environment Variables

Required environment variables for setup:
- Database connection strings (set during wizard)
- Email configuration (optional)
- Security settings (optional)

## Conditional Loading

The setup wizard uses dynamic imports to load only the selected database driver:

```typescript
// MongoDB driver loaded only if selected
if (selectedDriver === 'mongodb') {
  const { testMongoDBConnection } = await import('@shared/database/mongodb');
  await testMongoDBConnection(config);
}

// Drizzle driver loaded only if selected
if (selectedDriver === 'sql') {
  const { testDrizzleConnection } = await import('@shared/database/drizzle');
  await testDrizzleConnection(config);
}
```

## Deployment

The setup wizard can be deployed independently:

```bash
# Build
nx build setup

# Deploy the dist/apps/setup directory
```

## Dependencies

- **Required**: @shared/theme, @shared/utils
- **Conditional**: @shared/database (driver-specific parts)
- **Not Included**: CMS-specific components

## Bundle Size Target

Target bundle size: < 200KB (gzipped)
- Minimal dependencies
- Code splitting
- Tree-shaking enabled
