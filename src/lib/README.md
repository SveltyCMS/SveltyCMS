# SveltyCMS Library (`src/lib`)

Shared libraries and utilities for the SveltyCMS Collection Builder enterprise features.

## Directory Structure

```
src/lib/
├── components/           # Reusable Svelte components
│   └── collection-builder/
│       └── MigrationBanner.svelte
├── schemas/              # Valibot validation schemas
│   └── collectionBuilder.ts
├── services/             # Business logic services
│   └── MigrationEngine.ts
└── utils/                # Pure utility functions
    ├── serialization.ts
    ├── treeOperations.ts
    └── schemaComparison.ts
```

## Import Path Alias

Use the `$lib` alias to import from this directory:

```typescript
import { generateStableId } from '$lib/utils/serialization';
import { MigrationEngine } from '$lib/services/MigrationEngine';
import type { BreakingChange } from '$lib/schemas/collectionBuilder';
```

## Core Modules

### Schemas (`$lib/schemas/collectionBuilder.ts`)

Valibot validation schemas for type-safe operations:

- **ContentNodeOperationSchema** - Validates create/move/update/delete ops
- **BreakingChangeSchema** - Schema drift analysis
- **DatabaseIdSchema** - Branded type transformation

**Usage:**
```typescript
import { ContentNodeOperationSchema } from '$lib/schemas/collectionBuilder';
import { safeParse } from 'valibot';

const result = safeParse(ContentNodeOperationSchema, rawData);
if (result.success) {
  // Type-safe operation
}
```

### Utils

#### `serialization.ts`

Safe serialization and ID generation:

- `serializeNode()` - Convert ContentNode to wire format
- `generateStableId()` - Secure UUID generation
- `toDatabaseId()` - String to DatabaseId conversion
- `isValidDatabaseId()` - Type guard

**Usage:**
```typescript
import { generateStableId, serializeNode } from '$lib/utils/serialization';

const id = generateStableId(); // crypto.randomUUID()
const serialized = serializeNode(contentNode); // Removes heavy fields
```

#### `treeOperations.ts`

Tree structure validation and manipulation:

- `buildTree()` - Flat array → nested tree
- `flattenTree()` - Nested tree → flat array
- `detectCycle()` - Prevent parent/child cycles
- `validateTreeIntegrity()` - Duplicate/collision checks
- `findNodeById()` - Tree search
- `getAncestors()` - Ancestry path

**Usage:**
```typescript
import { validateTreeIntegrity, detectCycle } from '$lib/utils/treeOperations';

// Before saving
const error = validateTreeIntegrity(nodes);
if (error) {
  console.error(error.code); // 'DUPLICATE_ID' | 'PATH_COLLISION'
}

// Before drag-drop
if (detectCycle(tree, movingId, targetParentId)) {
  return; // Prevent drop
}
```

#### `schemaComparison.ts`

Schema diff analysis for migration detection:

- `compareSchemaVersions()` - Detect breaking changes
- Field removal, type changes, constraint changes
- Severity classification (blocking vs warning)
- Migration possibility assessment

**Usage:**
```typescript
import { compareSchemaVersions } from '$lib/utils/schemaComparison';

const result = compareSchemaVersions(oldSchema, newSchema, sampleData);

result.breakingChanges.forEach(change => {
  console.log(`${change.type}: ${change.field}`);
  console.log(`Severity: ${change.severity}`);
  console.log(`Data loss: ${change.dataLoss}`);
  console.log(`Can migrate: ${change.migrationPossible}`);
});
```

### Services

#### `MigrationEngine.ts`

Handles schema migrations with backup/rollback:

- `previewMigration()` - Analyze impact before execution
- `executeMigration()` - Run migration with batching
- `rollbackMigration()` - Restore from backup

**Usage:**
```typescript
import { migrationEngine } from '$lib/services/MigrationEngine';

// Preview first
const preview = await migrationEngine.previewMigration(
  collectionId,
  currentSchema,
  newSchema,
  documentCount
);

if (preview.canAutoMigrate) {
  // Execute
  const result = await migrationEngine.executeMigration(
    collectionId,
    currentSchema,
    newSchema,
    {
      dryRun: false,
      createBackup: true,
      batchSize: 100
    }
  );
}
```

### Components

#### `MigrationBanner.svelte`

Warning banner for schema drift:

- Color-coded severity (blocking = red, warning = yellow)
- Quick links to migration pages
- Dismissible with session storage
- ARIA accessible

**Usage:**
```svelte
<script>
  import MigrationBanner from '$lib/components/collection-builder/MigrationBanner.svelte';
  
  let drifts = [
    {
      collection: 'Posts',
      severity: 'blocking',
      changes: [...],
      requiresMigration: true,
      documentCount: 150
    }
  ];
</script>

<MigrationBanner {drifts} />
```

## Testing

All utilities have comprehensive unit tests:

```bash
# Run all lib tests
bun test tests/bun/utils/

# Specific test file
bun test tests/bun/utils/treeOperations.test.ts
```

**Test Coverage:**
- `treeOperations.test.ts` - 18 test cases
- `serialization.test.ts` - 11 test cases
- `schemaComparison.test.ts` - 11 test cases

## Type Safety

All modules export TypeScript types:

```typescript
import type { 
  SerializableContentNode,
  TreeNode,
  TreeIntegrityError
} from '$lib/utils/treeOperations';

import type {
  BreakingChange,
  SchemaDriftResult,
  MigrationResult
} from '$lib/schemas/collectionBuilder';

import type {
  MigrationOptions,
  MigrationPreview
} from '$lib/services/MigrationEngine';
```

## Best Practices

### 1. Always Validate User Input

```typescript
import { safeParse } from 'valibot';
import { ContentNodeOperationSchema } from '$lib/schemas/collectionBuilder';

const result = safeParse(ContentNodeOperationSchema, formData);
if (!result.success) {
  return fail(400, { errors: result.issues });
}
```

### 2. Use Secure ID Generation

```typescript
// ✅ Good
import { generateStableId } from '$lib/utils/serialization';
const id = generateStableId();

// ❌ Bad
const id = Math.random().toString(36);
```

### 3. Validate Before Save

```typescript
import { validateTreeIntegrity } from '$lib/utils/treeOperations';

const error = validateTreeIntegrity(nodes);
if (error) {
  // Show error, abort save
  return;
}
// Safe to proceed
```

### 4. Preview Migrations

```typescript
// Always preview before executing
const preview = await migrationEngine.previewMigration(...);

if (!preview.canAutoMigrate) {
  // Manual intervention needed
  console.warn('Cannot auto-migrate:', preview.changes);
}
```

## Contributing

When adding new utilities to `src/lib`:

1. Create the utility file in appropriate directory
2. Write comprehensive unit tests
3. Export TypeScript types
4. Add JSDoc comments
5. Update this README
6. Add usage examples to documentation

## Related Documentation

- [Collection Builder Enterprise Architecture](../docs/COLLECTION_BUILDER_ENTERPRISE.md)
- [AGENTS.md](../AGENTS.md) - Development guidelines
- [Testing Guide](../tests/bun/README.md) - Test patterns

---

**Path Alias:** `$lib` → `./src/lib`  
**Configured in:** `svelte.config.js`
