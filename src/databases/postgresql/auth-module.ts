/**
 * @file src/databases/postgresql/modules/auth/auth-module.ts
 * @description Authentication and authorization module for PostgreSQL, inheriting from RelationalAuthModule.
 */

import { RelationalAuthModule } from "../core/relational-auth";
import type { PostgresAdapterCore } from "./adapter-core";
import * as schema from "./schema";

export class AuthModule extends RelationalAuthModule {
  constructor(core: PostgresAdapterCore) {
    super(core as any, schema);
  }

  // PostgreSQL specific overrides (e.g. specialized rotateToken using RETURNING)
}
