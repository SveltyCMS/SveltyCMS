# @sveltycms/shared-config

Shared configuration schemas and utilities for SveltyCMS monorepo.

## Purpose

This library eliminates the circular dependency between `setup-wizard` and `cms` apps by providing shared configuration types and utilities.

## What's Included

- **schemas.ts**: Valibot schemas for private/public configuration
- **writePrivateConfig.ts**: Utility to write `config/private.ts` during setup
- **Types**: TypeScript types for `DatabaseConfig`, `PrivateConfig`, `PublicConfig`

## Usage

### In setup-wizard

```typescript
import { writePrivateConfig, type DatabaseConfig } from '@sveltycms/shared-config';

const dbConfig: DatabaseConfig = {
	type: 'mongodb',
	host: 'localhost',
	port: 27017,
	name: 'mydb',
	user: 'admin',
	password: 'secret'
};

await writePrivateConfig(dbConfig, logger);
```

### In cms

```typescript
import { privateConfigSchema, type PrivateConfig } from '@sveltycms/shared-config/schemas';
import { safeParse } from 'valibot';

// Validate config
const result = safeParse(privateConfigSchema, config);
```

### In config/private.ts

```typescript
import { createPrivateConfig } from '@sveltycms/shared-config/schemas';

export const privateEnv = createPrivateConfig({
	DB_TYPE: 'mongodb'
	// ... other config
});
```

## Benefits

1. **No Circular Dependencies**: Both apps can import from this shared library
2. **Single Source of Truth**: Configuration schemas defined once
3. **Type Safety**: Shared TypeScript types across apps
4. **Maintainability**: Update schemas in one place

## Architecture

```
apps/
├── shared-config/          ← This library
│   ├── schemas.ts          ← Config schemas & types
│   ├── writePrivateConfig.ts ← Setup utility
│   └── index.ts            ← Exports
├── setup-wizard/           ← Uses shared-config
│   └── src/routes/api/setup/
└── cms/                    ← Uses shared-config
    └── src/databases/
```
