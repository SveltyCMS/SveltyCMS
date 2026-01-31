# Collection Builder Enterprise Architecture

**Version:** 1.0  
**Last Updated:** 2024-01-31  
**Status:** Foundation Complete

## Overview

The Collection Builder has been transformed into an enterprise-grade system with atomic reconciliation, schema drift detection, and bulletproof data integrity. This document describes the new architecture and implementation patterns.

## Core Features

### 1. Type-Safe Validation (Valibot)

All data boundaries are validated using Valibot schemas for runtime type safety:

```typescript
import { ContentNodeOperationSchema } from '$lib/schemas/collectionBuilder';
import { safeParse } from 'valibot';

// Validate user input
const result = safeParse(ContentNodeOperationSchema, rawData);
if (!result.success) {
  return fail(400, { errors: result.issues });
}

// Type-safe operation
const operation = result.output; // Fully typed
```

**Key Schemas:**
- `ContentNodeOperationSchema` - Validates create/move/update/delete operations
- `BreakingChangeSchema` - Schema drift analysis
- `DatabaseIdSchema` - Branded ID type transformation

### 2. Tree Integrity Validation

Prevents data corruption with multiple validation layers:

```typescript
import { validateTreeIntegrity, detectCycle } from '$lib/utils/treeOperations';

// Before saving tree structure
const error = validateTreeIntegrity(nodes);
if (error) {
  toaster.error({ description: error.message });
  return; // Abort save
}

// Prevent cycles when dragging
if (detectCycle(treeNodes, movingId, targetParentId)) {
  return; // Prevent drop
}
```

**Validation Checks:**
- ✅ Duplicate ID detection
- ✅ Path collision prevention
- ✅ Cycle detection (parent → child → parent)
- ✅ Orphaned node identification

### 3. Schema Drift Detection

Automatically detects breaking changes between code and database:

```typescript
import { compareSchemaVersions } from '$lib/utils/schemaComparison';

const comparison = compareSchemaVersions(
  currentSchema,  // From database
  newSchema,      // From code/GUI
  sampleData      // For impact analysis
);

if (comparison.breakingChanges.length > 0) {
  // Show migration banner
  // Block deployment if severity = 'blocking'
}
```

**Detected Changes:**
- `field_removed` - Field deleted from schema
- `type_changed` - Widget type changed (e.g., text → number)
- `required_added` - Field became mandatory
- `unique_added` - Unique constraint added
- `constraint_tightened` - Validation rules stricter

**Severity Levels:**
- **Blocking**: Data loss risk, deployment prevented
- **Warning**: Migration needed but safe

### 4. Migration Engine

Handles schema changes with backup and rollback:

```typescript
import { migrationEngine } from '$lib/services/MigrationEngine';

// Preview migration
const preview = await migrationEngine.previewMigration(
  collectionId,
  currentSchema,
  newSchema,
  documentCount
);

console.log(`Can auto-migrate: ${preview.canAutoMigrate}`);
console.log(`Affected docs: ${preview.affectedDocuments}`);

// Execute migration
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
```

**Migration Features:**
- Preview mode (dry-run)
- Automatic backup creation
- Batch processing
- Progress tracking
- Error reporting with document IDs
- Rollback capability

### 5. Secure ID Generation

Replaced insecure `Math.random()` with cryptographically secure UUIDs:

```typescript
import { generateStableId } from '$lib/utils/serialization';

// ❌ OLD - Insecure
const id = Math.random().toString(36) as DatabaseId;

// ✅ NEW - Secure
const id = generateStableId(); // Uses crypto.randomUUID()
```

## File Structure

```
src/lib/
├── schemas/
│   └── collectionBuilder.ts       # Valibot validation schemas
├── utils/
│   ├── serialization.ts           # DatabaseId generation, node serialization
│   ├── treeOperations.ts          # Tree integrity, cycle detection
│   └── schemaComparison.ts        # Schema diff analysis
├── services/
│   └── MigrationEngine.ts         # Migration preview & execution
└── components/
    └── collection-builder/
        └── MigrationBanner.svelte # Drift warning UI

tests/bun/utils/
├── treeOperations.test.ts         # 18 test cases
├── serialization.test.ts          # 11 test cases
└── schemaComparison.test.ts       # 11 test cases
```

## Usage Patterns

### Pattern 1: TreeViewBoard Save with Validation

```typescript
// src/routes/(app)/config/collectionbuilder/NestedContent/TreeViewBoard.svelte
import { validateTreeIntegrity } from '$lib/utils/treeOperations';
import { serializeNode } from '$lib/utils/serialization';

function saveTreeData() {
  const flatItems = flattenTree(treeRoots);
  
  // Convert to serializable format
  const serializableNodes = flatItems.map(serializeNode);
  
  // Validate integrity
  const error = validateTreeIntegrity(serializableNodes);
  if (error) {
    toaster.error({ description: `Cannot save: ${error.message}` });
    return;
  }
  
  // Safe to save
  onNodeUpdate(nodes);
}
```

### Pattern 2: Schema Change Detection

```typescript
// When collection is saved/compiled
import { compareSchemaVersions } from '$lib/utils/schemaComparison';

const existingSchema = await contentManager.getCollection(collectionId);
const newSchema = extractSchemaFromCode(filePath);

const comparison = compareSchemaVersions(
  existingSchema.collectionDef,
  newSchema,
  [] // Optional: sample documents for impact analysis
);

if (comparison.breakingChanges.length > 0) {
  // Store drift result for display
  await storeDriftResult({
    collection: collectionId,
    changes: comparison.breakingChanges,
    requiresMigration: comparison.breakingChanges.some(c => c.dataLoss),
    severity: comparison.breakingChanges.some(c => c.dataLoss) ? 'blocking' : 'warning'
  });
}
```

### Pattern 3: Migration Banner Display

```svelte
<!-- In layout or collection builder page -->
<script>
  import MigrationBanner from '$lib/components/collection-builder/MigrationBanner.svelte';
  import type { SchemaDriftResult } from '$lib/schemas/collectionBuilder';
  
  let { data } = $props();
  let drifts: SchemaDriftResult[] = data.schemaDrift || [];
</script>

<MigrationBanner {drifts} />
```

## Integration Points

### ContentManager Integration

The MigrationEngine requires integration with ContentManager for:

1. **Schema Retrieval**
   ```typescript
   const schema = await contentManager.getCollection(collectionId);
   ```

2. **Document Access** (for migrations)
   ```typescript
   const db = contentManager.getDatabase();
   const cursor = db.collection(name).find({});
   ```

3. **Backup Creation**
   ```typescript
   await db.collection(backupName).insertMany(documents);
   ```

### Compilation Integration

Add to `src/utils/compilation/compile.ts`:

```typescript
async function detectDriftForFile(
  filePath: string,
  extractedSchema: Schema
): Promise<DriftResult | null> {
  const existing = await contentManager.getCollectionByPath(filePath);
  if (!existing) return null;
  
  const comparison = compareSchemaVersions(
    existing.collectionDef,
    extractedSchema,
    []
  );
  
  if (comparison.breakingChanges.length === 0) return null;
  
  return {
    collection: extractedSchema.name,
    changes: comparison.breakingChanges,
    requiresMigration: comparison.breakingChanges.some(c => c.dataLoss),
    severity: comparison.breakingChanges.some(c => c.dataLoss) ? 'blocking' : 'warning'
  };
}
```

## API Endpoints (Deferred)

The following API endpoints should be created for migration workflows:

### GET `/api/collections/[id]/drift`

Check for schema drift:
```json
{
  "hasDrift": true,
  "changes": [
    {
      "type": "field_removed",
      "field": "oldField",
      "severity": "blocking",
      "dataLoss": true,
      "affectedCount": 42
    }
  ],
  "severity": "blocking"
}
```

### POST `/api/collections/[id]/migrate/preview`

Preview migration:
```json
{
  "canAutoMigrate": true,
  "affectedDocuments": 150,
  "estimatedDuration": 15000,
  "backupCollection": "backup_posts_1706726400000"
}
```

### POST `/api/collections/[id]/migrate/execute`

Execute migration:
```json
{
  "dryRun": false,
  "createBackup": true,
  "batchSize": 100
}
```

Response:
```json
{
  "success": true,
  "processed": 150,
  "failed": 0,
  "duration": 14500,
  "backup": "backup_posts_1706726400000"
}
```

## Security Considerations

### 1. ID Generation

**Issue:** `Math.random()` is not cryptographically secure and can be predicted.

**Solution:** Use `crypto.randomUUID()` for all ID generation:
```typescript
// ✅ Secure
const id = generateStableId(); // Uses crypto.randomUUID()

// ❌ Insecure (removed)
const id = Math.random().toString(36);
```

### 2. Validation at Boundaries

**Issue:** Unvalidated user input can corrupt data structures.

**Solution:** Valibot validation at all entry points:
```typescript
const result = safeParse(ContentNodeOperationSchema, rawInput);
if (!result.success) {
  return fail(400, { errors: result.issues });
}
```

### 3. Cycle Prevention

**Issue:** Allowing cycles in tree structures causes infinite loops.

**Solution:** Pre-save validation with cycle detection:
```typescript
if (detectCycle(nodes, movingId, targetParentId)) {
  return; // Prevent operation
}
```

## Performance Considerations

### Tree Operations

- Build tree: O(n) where n = number of nodes
- Detect cycle: O(h) where h = tree height
- Validate integrity: O(n)

### Schema Comparison

- Field comparison: O(m + n) where m, n = field counts
- Sample data analysis: O(d × f) where d = documents, f = fields

### Migration

- Batch processing: Configurable batch size (default 100)
- Progress callbacks: Per-batch updates
- Memory efficient: Cursor-based iteration

## Testing

### Unit Tests

**Tree Operations** (18 tests):
- Tree building and sorting
- Cycle detection (deep cycles, self-references)
- Integrity validation (duplicates, collisions)
- Tree flattening and traversal

**Serialization** (11 tests):
- Node serialization (with/without optional fields)
- ID validation and generation
- DatabaseId type guards

**Schema Comparison** (11 tests):
- Field changes (add/remove/modify)
- Constraint changes (required/unique)
- Type changes with migration assessment
- Severity classification

### Running Tests

```bash
# All unit tests
bun run test:unit

# Specific test file
bun test tests/bun/utils/treeOperations.test.ts
```

## Future Enhancements

1. **Transaction Support**: Add MongoDB/MariaDB transaction wrappers to ContentManager
2. **Audit Logging**: Track all schema changes with user attribution
3. **CLI Tools**: Command-line interface for schema status and migration
4. **Git Hooks**: Pre-commit validation for schema integrity
5. **Migration History**: Track and version all migrations
6. **Rollback UI**: Browser-based rollback interface

## Troubleshooting

### Issue: "Duplicate ID" error when saving

**Cause:** Two nodes have the same `_id`

**Solution:** Check for copy/paste operations that didn't regenerate IDs:
```typescript
// When duplicating, always generate new ID
const newNode = { ...original, _id: generateStableId() };
```

### Issue: "Path collision" error

**Cause:** Two nodes have identical paths

**Solution:** Ensure path recalculation runs before save:
```typescript
const withPaths = recalculatePaths(flatItems);
const validated = validateTreeIntegrity(withPaths);
```

### Issue: Schema drift not detected

**Cause:** Comparison not running or sample data missing

**Solution:** Enable drift detection in compilation:
```typescript
const drifts = await detectDriftForFile(filePath, newSchema);
```

## References

- [Valibot Documentation](https://valibot.dev/)
- [SvelteKit Form Actions](https://kit.svelte.dev/docs/form-actions)
- [MongoDB Transactions](https://www.mongodb.com/docs/manual/core/transactions/)
- Original Implementation Plan: `/docs/ENTERPRISE_COLLECTION_BUILDER_PLAN.md`

## Contributors

- Implementation: GitHub Copilot
- Architecture: Based on enterprise CMS patterns
- Testing: Comprehensive unit test coverage

---

**Last Updated:** 2024-01-31  
**Status:** Foundation complete, integration deferred for follow-up PRs
