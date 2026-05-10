/**
 * @file src/databases/mariadb/modules/auth/auth-module.ts
 * @description Authentication and authorization module for MariaDB, inheriting from RelationalAuthModule.
 */

import { RelationalAuthModule } from "../core/relational-auth";
import type { AdapterCore } from "./adapter-core";
import * as schema from "./schema";

export class AuthModule extends RelationalAuthModule {
  constructor(core: AdapterCore) {
    super(core as any, schema);
  }

  // MariaDB specific overrides if any
}
