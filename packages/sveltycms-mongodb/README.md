# sveltycms-mongodb

MongoDB adapter for [SveltyCMS](https://sveltycms.com). Re-exports the in-tree adapter (`src/databases/mongodb`). The CMS loads adapters through `src/databases/db-init.ts`; this package is the versioned public surface for `DB_TYPE=mongodb`.

```ts
import { MongoDBAdapter } from "sveltycms-mongodb";
```
