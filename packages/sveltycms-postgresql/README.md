# sveltycms-postgresql

PostgreSQL adapter for [SveltyCMS](https://sveltycms.com). Re-exports the in-tree adapter (`src/databases/postgresql`). The CMS loads adapters through `src/databases/db-init.ts`; this package is the versioned public surface for `DB_TYPE=postgresql`.

```ts
import { PostgreSQLAdapter } from "sveltycms-postgresql";
```
