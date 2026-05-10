/**
 * @file src/databases/sqlite/modules/auth/auth-module.ts
 * @description Authentication and authorization module for SQLite, inheriting from RelationalAuthModule.
 */

import { RelationalAuthModule } from "../core/relational-auth";
import type { SQLiteAdapterCore } from "./adapter-core";
import { schema } from "./schema";

export class AuthModule extends RelationalAuthModule {
  constructor(core: SQLiteAdapterCore) {
    super(core as any, schema);
  }

  // SQLite specific overrides if any (e.g. specialized rotateToken or cleanup)
}
