/**
 * @file src/databases/postgresql/modules/auth/auth-module.ts
 * @description Authentication and authorization module for PostgreSQL, inheriting from RelationalAuthModule.
 */

import { RelationalAuthModule } from "../../../relational/modules/relational-auth-module";
import type { AdapterCore } from "../../adapter/adapter-core";
import * as schema from "../../schema";

export class AuthModule extends RelationalAuthModule {
  constructor(core: AdapterCore) {
    super(core as any, schema);
  }

  // PostgreSQL specific overrides (e.g. specialized rotateToken using RETURNING)
}
