# 🔧 SveltyCMS Codemods

> **Automatic code migrations** that run during `bun run upgrade`

## How It Works

When you run `bun run upgrade`, the system automatically executes **every** `.ts` file in this directory in alphabetical order, **excluding** any files that start with an underscore (`_`).

## Adding a New Codemod

1. Create a new file with naming: `NN-description.ts` (e.g., `04-add-new-field.ts`)
2. Import utilities from `./_utils.ts`
3. Implement your migration logic
4. **Always create backups** before modifying files using `await backupFile(filePath)`

## Best Practices

### ✅ DO:

- Use shared utilities from `./_utils.ts`.
- Create backups with `await backupFile(filePath)`.
- Make migrations **idempotent** (safe to run multiple times).
- Log what you're changing clearly.
- Exit with code 0 if nothing to migrate.

### ❌ DON'T:

- Modify files without backups.
- Assume the migration runs only once.
- Delete user data without explicit instruction.
- Create breaking changes without warning.

## File Naming Convention

| Prefix           | Purpose                           | Example                  |
| ---------------- | --------------------------------- | ------------------------ |
| `NN-`            | Execution order (01, 02, 03...)   | `01-migrate-fields.ts`   |
| `migrate-`       | Data structure migrations         | `migrate-collections.ts` |
| `update-`        | Configuration updates             | `update-permissions.ts`  |
| `fix-`           | Bug fixes in schema               | `fix-role-names.ts`      |
| `_` (underscore) | Internal utilities (NOT executed) | `_utils.ts`              |

## Current Codemods

| File                                 | Description               | Status      | Safe to Re-run |
| ------------------------------------ | ------------------------- | ----------- | -------------- |
| `01-migrate-collection-schema-v2.ts` | v1 → v2 collection schema | ✅ Active   | ✅ Yes         |
| `_utils.ts`                          | Shared utilities          | 📦 Internal | N/A            |

## Testing a Codemod

```bash
# Test on a single file first
bun scripts/codemods/01-migrate-collection-schema-v2.ts src/collections/test-collection.ts

# Dry run (if supported)
bun run upgrade --dry-run

# Full upgrade with all codemods
bun run upgrade
```
