# Documentation and Testing Strategy for AI/LLM Support

This document explains how SveltyCMS structures documentation and tests to optimize for AI/LLM understanding and coding assistance.

## Why Documentation and Tests Are Not Workspaces

Unlike applications and shared libraries, **documentation** and **tests** are intentionally kept as regular directories, not Nx workspaces. This design decision provides several benefits:

### Benefits of Non-Workspace Structure

1. **Simplicity**: No build step required to view or edit documentation
2. **Accessibility**: Direct file access without workspace configuration
3. **AI-Friendly**: LLMs can easily navigate and understand flat structures
4. **Version Control**: Clear diff views for documentation changes
5. **Flexibility**: Support for multiple documentation formats (MD, MDX, HTML)
6. **Universal Tools**: Works with any markdown viewer or editor

## Documentation Structure (docs/)

```
docs/
├── README.mdx                      # Main documentation index
├── getting-started.mdx             # Quick start guide
├── architecture/                   # Architecture documentation
│   ├── overview.md                # System overview
│   ├── monorepo.md                # Nx monorepo structure
│   ├── database-loading.md        # Conditional database loading
│   └── security.md                # Security architecture
├── api/                           # API documentation
│   ├── rest-api.md                # REST API reference
│   ├── graphql.md                 # GraphQL schema
│   └── webhooks.md                # Webhook events
├── guides/                        # How-to guides
│   ├── installation.md
│   ├── configuration.md
│   ├── database-setup.md
│   ├── deployment.md
│   └── custom-widgets.md
├── database/                      # Database documentation
│   ├── mongodb.md                 # MongoDB setup
│   ├── mariadb.md                 # MariaDB setup
│   ├── postgresql.md              # PostgreSQL setup
│   └── migrations.md              # Migration guides
├── security/                      # Security documentation
│   ├── authentication.md
│   ├── authorization.md
│   ├── rate-limiting.md
│   └── best-practices.md
├── contributing/                  # Contribution guides
│   ├── code-style.md
│   ├── pull-requests.md
│   └── testing.md
├── widgets/                       # Widget development
│   ├── creating-widgets.md
│   └── widget-api.md
└── troubleshooting.mdx            # Common issues and solutions
```

## AI/LLM Optimization Strategies

### 1. Clear Hierarchical Structure

Organize documentation in a logical hierarchy that mirrors the codebase:

```
docs/
├── architecture/          # High-level concepts
├── guides/               # Practical tutorials
├── api/                  # Technical reference
└── troubleshooting/      # Problem solving
```

This mirrors how developers think and how AI models navigate information.

### 2. Consistent Naming Conventions

Use descriptive, predictable filenames:

✅ **Good**:
- `database-setup.md`
- `authentication.md`
- `creating-widgets.md`

❌ **Bad**:
- `db.md`
- `auth.md`
- `widgets.md`

### 3. Comprehensive Code Examples

Every documentation page should include:

```markdown
## Feature Name

Brief description of the feature.

### Basic Usage

\`\`\`typescript
// Simple, minimal example
import { feature } from '@shared/library';

const result = feature.doSomething();
\`\`\`

### Advanced Usage

\`\`\`typescript
// More complex example with all options
import { feature } from '@shared/library';

const result = feature.doSomething({
  option1: true,
  option2: 'value',
  callback: (data) => console.log(data)
});
\`\`\`

### Common Patterns

\`\`\`typescript
// Real-world usage pattern
// Pattern explanation
\`\`\`
```

### 4. Inline Context

Add context directly in code examples:

```typescript
// ✅ Good: Context included
export async function loadDatabaseAdapter() {
  const config = await getConfig();
  
  // Only load MongoDB driver if configured
  if (config.database.type === 'mongodb') {
    const { MongoDBAdapter } = await import('./mongodb/adapter');
    return new MongoDBAdapter(config);
  }
  
  // Only load Drizzle driver if configured
  if (config.database.type === 'sql') {
    const { DrizzleAdapter } = await import('./drizzle/adapter');
    return new DrizzleAdapter(config);
  }
}

// ❌ Bad: No context
export async function loadDatabaseAdapter() {
  const config = await getConfig();
  if (config.database.type === 'mongodb') {
    const { MongoDBAdapter } = await import('./mongodb/adapter');
    return new MongoDBAdapter(config);
  }
  if (config.database.type === 'sql') {
    const { DrizzleAdapter } = await import('./drizzle/adapter');
    return new DrizzleAdapter(config);
  }
}
```

### 5. JSDoc Comments

Use comprehensive JSDoc comments for all public APIs:

```typescript
/**
 * Loads the appropriate database adapter based on configuration.
 * 
 * This function uses dynamic imports to ensure only the configured
 * database driver is bundled in production builds.
 * 
 * @returns {Promise<DatabaseAdapter>} The configured database adapter
 * @throws {Error} If database type is invalid or driver fails to load
 * 
 * @example
 * // Load MongoDB adapter
 * const db = await loadDatabaseAdapter();
 * await db.connect();
 * 
 * @example
 * // Load Drizzle adapter
 * const db = await loadDatabaseAdapter();
 * await db.connect();
 */
export async function loadDatabaseAdapter(): Promise<DatabaseAdapter> {
  // Implementation
}
```

### 6. Type Definitions as Documentation

Use descriptive type names and comments:

```typescript
/**
 * Configuration for database connection
 */
export interface DatabaseConfig {
  /** Type of database: 'mongodb' or 'sql' */
  type: 'mongodb' | 'sql';
  
  /** Database connection URL */
  url: string;
  
  /** SQL driver (only required when type is 'sql') */
  driver?: 'mariadb' | 'postgres' | 'mysql';
  
  /** Additional database-specific options */
  options?: {
    /** Maximum number of connections in pool */
    poolSize?: number;
    
    /** Connection timeout in milliseconds */
    timeout?: number;
  };
}
```

### 7. README-Driven Development

Each directory should have a README:

```
shared/database/
├── README.md          # Overview, usage, API reference
├── src/
│   ├── mongodb/
│   │   └── README.md  # MongoDB-specific documentation
│   └── drizzle/
│       └── README.md  # Drizzle-specific documentation
```

## Testing Structure (tests/)

```
tests/
├── unit/                          # Unit tests
│   ├── shared/
│   │   ├── utils/                # Utils library tests
│   │   ├── components/           # Components library tests
│   │   ├── stores/               # Stores library tests
│   │   └── database/             # Database library tests
│   └── apps/
│       ├── setup/                # Setup app tests
│       └── cms/                  # CMS app tests
├── integration/                   # Integration tests
│   ├── api/                      # API endpoint tests
│   ├── auth/                     # Authentication flow tests
│   ├── database/                 # Database integration tests
│   └── workflows/                # Multi-step workflows
├── e2e/                          # End-to-end tests
│   ├── setup/                    # Setup wizard E2E
│   ├── cms/                      # CMS application E2E
│   └── scenarios/                # User scenarios
├── fixtures/                      # Test data and fixtures
│   ├── users.json
│   ├── collections.json
│   └── media.json
└── helpers/                       # Test utilities
    ├── setup.ts                  # Test environment setup
    ├── mocks.ts                  # Mock factories
    └── assertions.ts             # Custom assertions
```

### Test Naming Convention

```typescript
// ✅ Good: Descriptive test names
describe('loadDatabaseAdapter', () => {
  it('should load MongoDB adapter when database type is mongodb', async () => {
    // Test implementation
  });
  
  it('should load Drizzle adapter when database type is sql', async () => {
    // Test implementation
  });
  
  it('should throw error when database type is invalid', async () => {
    // Test implementation
  });
});

// ❌ Bad: Unclear test names
describe('database', () => {
  it('works', () => {
    // What works?
  });
});
```

### Test Structure Pattern

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { loadDatabaseAdapter } from '@shared/database';
import { mockConfig } from '../helpers/mocks';

describe('Database Adapter Loading', () => {
  // Setup
  beforeEach(() => {
    // Prepare test environment
  });
  
  // Cleanup
  afterEach(() => {
    // Clean up after tests
  });
  
  // Grouped related tests
  describe('MongoDB Driver', () => {
    it('should load MongoDB adapter when configured', async () => {
      // Arrange
      const config = mockConfig({ database: { type: 'mongodb' } });
      
      // Act
      const adapter = await loadDatabaseAdapter();
      
      // Assert
      expect(adapter).toBeInstanceOf(MongoDBAdapter);
    });
    
    it('should not bundle Drizzle code when using MongoDB', async () => {
      // Test that Drizzle code is tree-shaken
    });
  });
  
  describe('Drizzle Driver', () => {
    it('should load Drizzle adapter when configured', async () => {
      // Similar pattern
    });
  });
  
  describe('Error Handling', () => {
    it('should throw error for invalid database type', async () => {
      // Error case testing
    });
  });
});
```

## How Other CMS Projects Handle This

### 1. Strapi

**Approach**: Monorepo with extensive inline documentation

```typescript
// packages/core/database/src/index.ts
/**
 * Database manager handles database connections and lifecycle
 * 
 * @example
 * const db = createDatabase(config);
 * await db.connect();
 */
export function createDatabase(config: DatabaseConfig) {
  // Implementation with inline comments
}
```

**Tests**: Organized by package, mirrors source structure

```
packages/
├── core/
│   ├── database/
│   │   ├── src/
│   │   └── __tests__/     # Tests next to source
```

### 2. Payload CMS

**Approach**: README-driven with extensive examples

```markdown
# Database Configuration

Payload supports MongoDB and Postgres.

## MongoDB Setup

\`\`\`typescript
import { buildConfig } from 'payload/config';
import { mongooseAdapter } from '@payloadcms/db-mongodb';

export default buildConfig({
  db: mongooseAdapter({
    url: process.env.DATABASE_URI
  })
});
\`\`\`
```

**Tests**: Grouped by feature

```
test/
├── auth/
├── fields/
├── uploads/
└── collections/
```

### 3. KeystoneJS

**Approach**: TypeScript-first with comprehensive types

```typescript
/**
 * Creates a Keystone database adapter
 * 
 * @typeParam PrismaClient - Generated Prisma client type
 */
export function createDatabase<PrismaClient>(
  config: DatabaseConfig
): DatabaseAdapter<PrismaClient> {
  // Well-typed implementation
}
```

**Tests**: Integration-focused

```
tests/
├── examples/          # Test actual examples from docs
├── integration/       # Full stack tests
└── benchmarks/        # Performance tests
```

## Best Practices for AI/LLM Support

### 1. Self-Documenting Code

```typescript
// ✅ Good: Self-documenting
export async function loadDatabaseAdapter(): Promise<DatabaseAdapter> {
  const config = await loadConfig();
  return createAdapterForDatabaseType(config.database.type);
}

// ❌ Bad: Unclear
export async function load(): Promise<any> {
  const c = await lc();
  return ca(c.db.t);
}
```

### 2. Consistent Patterns

Use the same patterns throughout:

```typescript
// Pattern: All adapters implement the same interface
export interface DatabaseAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  find(collection: string, query: object): Promise<any[]>;
}

// MongoDB implements pattern
export class MongoDBAdapter implements DatabaseAdapter {
  // Implementation
}

// Drizzle implements pattern
export class DrizzleAdapter implements DatabaseAdapter {
  // Implementation
}
```

### 3. Error Messages with Context

```typescript
// ✅ Good: Helpful error message
throw new Error(
  `Invalid database type: ${config.database.type}. ` +
  `Supported types: 'mongodb', 'sql'. ` +
  `Check your configuration in config/database.ts`
);

// ❌ Bad: Unhelpful
throw new Error('Invalid type');
```

### 4. Change Documentation

Keep a CHANGELOG.md with clear, categorized changes:

```markdown
# Changelog

## [0.0.6] - 2026-01-10

### Added
- Nx monorepo structure for better code organization
- Conditional database driver loading for smaller bundles
- Shared theme library with Skeleton UI v4

### Changed
- Migrated to flat Nx monorepo structure
- Updated paraglide configuration for workspace-specific messages

### Breaking Changes
- Import paths changed from `@databases` to `@shared/database`
```

### 5. Migration Guides

When making breaking changes, provide clear migration guides:

```markdown
# Migration Guide: v0.0.5 → v0.0.6

## Import Path Changes

### Before
\`\`\`typescript
import { db } from '@databases';
\`\`\`

### After
\`\`\`typescript
import { loadDatabaseAdapter } from '@shared/database';
const db = await loadDatabaseAdapter();
\`\`\`

## Why This Change?
The new structure enables conditional loading...
```

## Validation

To verify documentation quality:

1. **Automated Linting**: 
```bash
nx run docs:lint
```

2. **Link Checking**:
```bash
npx markdown-link-check docs/**/*.md
```

3. **Code Example Testing**:
Extract and test code examples from documentation

4. **AI Review**:
Ask LLM to explain the feature based solely on documentation

## Summary

The key principles for AI/LLM-friendly documentation:

1. ✅ Clear, hierarchical structure
2. ✅ Comprehensive code examples
3. ✅ Inline context and comments
4. ✅ Type-safe with JSDoc
5. ✅ Self-documenting code
6. ✅ Consistent patterns
7. ✅ Tests mirror code structure
8. ✅ Migration guides for breaking changes

By following these principles, we ensure that:
- Human developers can understand the code quickly
- AI/LLM tools can provide accurate assistance
- Documentation stays synchronized with code
- Tests serve as living documentation
