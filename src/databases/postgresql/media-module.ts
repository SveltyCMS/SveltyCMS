/**
 * @file src/databases/postgresql/modules/media/media-module.ts
 * @description Media management module for PostgreSQL, inheriting from RelationalMediaModule.
 */

import { RelationalMediaModule } from "../core/relational-media";
import type { PostgresAdapterCore } from "./adapter-core";
import { schema } from "./schema";

export class MediaModule extends RelationalMediaModule {
  constructor(core: PostgresAdapterCore) {
    super(core as any, schema);
  }

  // PostgreSQL specific overrides (e.g. specialized search using ILIKE or GIN indexes)
}
