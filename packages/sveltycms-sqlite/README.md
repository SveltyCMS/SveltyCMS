# sveltycms-sqlite

SQLite adapter for [SveltyCMS](https://sveltycms.com). This package re-exports the in-tree adapter from the SveltyCMS repository (`src/databases/sqlite`). The CMS still loads adapters through `src/databases/db-init.ts`; the npm package is the versioned public surface for `DB_TYPE=sqlite`.

```ts
import { SQLiteAdapter } from "sveltycms-sqlite";
```

Published from the SveltyCMS monorepo on release tags (`v*`). See [Standalone Adapter Packages](../../docs/project/roadmap-2026.mdx).
