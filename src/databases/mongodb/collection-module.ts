/**
 * @file src/databases/mongodb/modules/collection-module.ts
 * @description Collection management module for MongoDB.
 */

import { DatabaseModule } from "../core/base-adapter";
import type { ICollectionAdapter, DatabaseId, Schema } from "../db-interface";
import type { MongoAdapterCore } from "./adapter-core";

export class MongoCollectionModule
  extends DatabaseModule<MongoAdapterCore>
  implements ICollectionAdapter
{
  private _methods: any = null;

  private async _getMethods() {
    if (this._methods) return this._methods;

    // 🛡️ Safety: If connection is not ready, wait up to 5s for the boot sequence to catch up
    // This resolves race conditions in benchmarks where ensureStableTestData is called immediately after server start
    if (!this.adapter.connection || this.adapter.connection.readyState !== 1) {
      let attempts = 0;
      while (
        (!this.adapter.connection || this.adapter.connection.readyState !== 1) &&
        attempts < 50
      ) {
        await new Promise((r) => setTimeout(r, 100));
        attempts++;
      }
    }

    if (!this.adapter.connection) {
      throw new Error(
        `[MongoCollectionModule] Database connection not found on adapter ${this.adapter.constructor.name}. Ensure connect() has completed.`,
      );
    }

    const { MongoCollectionMethods } = await import("./collection-methods");
    this._methods = new MongoCollectionMethods(this.adapter.connection);
    return this._methods;
  }

  async getModel(id: string) {
    return (await this._getMethods()).getModel(id);
  }

  async createModel(schema: Schema, force?: boolean) {
    return (await this._getMethods()).createModel(schema, force);
  }

  async updateModel(schema: Schema) {
    return (await this._getMethods()).updateModel(schema);
  }

  async deleteModel(id: string) {
    return (await this._getMethods()).deleteModel(id);
  }

  async getSchema(name: string, tenantId?: DatabaseId | null) {
    return (await this._getMethods())
      .getSchema(name, tenantId)
      .then((r: any) => ({ success: true, data: r }));
  }

  async getSchemaById(id: string, tenantId?: DatabaseId | null) {
    return (await this._getMethods())
      .getSchemaById(id, tenantId)
      .then((r: any) => ({ success: true, data: r }));
  }

  async listSchemas(tenantId?: DatabaseId | null) {
    return (await this._getMethods())
      .listSchemas(tenantId)
      .then((r: any) => ({ success: true, data: r }));
  }

  async getNativeDriverModel<TNative = any>(id: string) {
    return (await this._getMethods()).getMongooseModel(id) as unknown as TNative;
  }

  async createIndexes(id: string, schema: Schema) {
    const methods = await this._getMethods();
    const model = methods.getMongooseModel(id);
    if (!model)
      return {
        success: false,
        message: "Model not found",
        error: { code: "NOT_FOUND", message: "Model not found" },
      };
    return methods.createIndexes(model, schema).then(() => ({ success: true, data: undefined }));
  }
}
