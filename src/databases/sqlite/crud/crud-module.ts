/**
 * @file src/databases/sqlite/crud/crud-module.ts
 * @description CRUD operations module for SQLite, inheriting from RelationalCrudModule.
 */

import { RelationalCrudModule } from "../../relational/modules/relational-crud-module";
import type { AdapterCore } from "../adapter/adapter-core";

export class CrudModule extends RelationalCrudModule {
  constructor(core: AdapterCore) {
    super(core as any);
  }

  // SQLite-specific overrides can be added here.
  // We use the base findOne from RelationalCrudModule to ensure correct tenant handling and security logic.
}
