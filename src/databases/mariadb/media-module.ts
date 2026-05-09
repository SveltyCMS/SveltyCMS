/**
 * @file src/databases/mariadb/modules/media/media-module.ts
 * @description Media management module for MariaDB, inheriting from RelationalMediaModule.
 */

import { RelationalMediaModule } from "../sqlite/relational-media";
import type { AdapterCore } from "./adapter-core";
import { schema } from "./schema";

export class MediaModule extends RelationalMediaModule {
  constructor(core: AdapterCore) {
    super(core as any, schema);
  }

  // MariaDB specific overrides if any
}
