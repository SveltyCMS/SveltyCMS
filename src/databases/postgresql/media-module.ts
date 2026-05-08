/**
 * @file src/databases/postgresql/modules/media/media-module.ts
 * @description Media management module for PostgreSQL, inheriting from RelationalMediaModule.
 */

import { RelationalMediaModule } from "../agnostic/relational-media-module";
import type { AdapterCore } from "./adapter-core";
import { schema } from "./schema";

export class MediaModule extends RelationalMediaModule {
  constructor(core: AdapterCore) {
    super(core as any, schema);
  }

  // PostgreSQL specific overrides (e.g. specialized search using ILIKE or GIN indexes)
}
