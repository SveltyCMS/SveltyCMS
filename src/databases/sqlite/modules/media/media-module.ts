/**
 * @file src/databases/sqlite/modules/media/media-module.ts
 * @description Media management module for SQLite, inheriting from RelationalMediaModule.
 */

import { RelationalMediaModule } from "../../../relational/modules/relational-media-module";
import type { AdapterCore } from "../../adapter/adapter-core";
import { schema } from "../../schema";

export class MediaModule extends RelationalMediaModule {
  constructor(core: AdapterCore) {
    super(core as any, schema);
  }

  // SQLite specific overrides if any
}
