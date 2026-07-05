# @sveltycms/core

Database-agnostic CMS engine for SveltyCMS — the core building block for custom integrations, DB adapters, and headless deployments.

## Install

```bash
npm install @sveltycms/core
# or
bun add @sveltycms/core
```

## Quick Start

```typescript
import { LocalCMS, type IDBAdapter } from "@sveltycms/core";

// Create a CMS instance with your database adapter
const cms = new LocalCMS(myDbAdapter);

// Query collections — zero HTTP overhead
const posts = await cms.collections.find("posts", { tenantId: "my-tenant" });

// Create entries with built-in validation
const entry = await cms.collections.create("posts", {
  data: { title: "Hello World", status: "draft" },
  tenantId: "my-tenant",
});
```

## Exports

| Path                           | Contents                                                            |
| ------------------------------ | ------------------------------------------------------------------- |
| `@sveltycms/core`              | LocalCMS, IDBAdapter, core types, error handling                    |
| `@sveltycms/core/types`        | DatabaseId, ISODateString, ContentNode, Schema, User, Session, etc. |
| `@sveltycms/core/db-interface` | IDBAdapter contract, DatabaseResult, PaginatedResult, QueryFilter   |
| `@sveltycms/core/errors`       | AppError, raise(), rethrow()                                        |
| `@sveltycms/core/local-cms`    | LocalCMS class only                                                 |

## Building a DB Adapter

Implement the `IDBAdapter` interface to add support for any database:

```typescript
import type { IDBAdapter, DatabaseResult } from "@sveltycms/core/db-interface";

class MyAdapter implements IDBAdapter {
  // Implement CRUD, Auth, Media, Settings, Widget methods...
}
```

## License

BUSL-1.1 — see [LICENSE](https://github.com/SveltyCMS/SveltyCMS/blob/next/LICENSE)
