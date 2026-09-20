# sveltycms-mariadb

MariaDB adapter for [SveltyCMS](https://sveltycms.com). Re-exports the in-tree adapter (`src/databases/mariadb`). The CMS loads adapters through `src/databases/db-init.ts`; this package is the versioned public surface for `DB_TYPE=mariadb`.

```ts
import { MariaDBAdapter } from "sveltycms-mariadb";
```
