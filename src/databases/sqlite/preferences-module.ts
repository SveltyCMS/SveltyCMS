/**
 * @file src/databases/sqlite/modules/system/preferences-module.ts
 * @description System preferences module for SQLite with telemetry.
 */

import { isoDateStringToDate, nowISODateString } from "@src/utils/date";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { DatabaseId, DatabaseResult } from "../db-interface";
import type { AdapterCore } from "./adapter-core";
import * as schema from "./schema";
import * as utils from "./utils";

import { DatabaseModule } from "../core/base-adapter";

export class PreferencesModule extends DatabaseModule<AdapterCore> {
  constructor(core: AdapterCore) {
    super(core);
  }

  protected get core() {
    return this.adapter;
  }

  async get<T>(
    key: string,
    scope?: "user" | "system",
    userId?: DatabaseId,
  ): Promise<DatabaseResult<T | null>> {
    const startTime = performance.now();
    return this.core
      .wrap(async () => {
        if (!key) throw new Error("Key is required");
        const conditions: import("drizzle-orm").SQL[] = [eq(schema.systemPreferences.key, key)];
        if (scope === undefined || scope === null) {
          conditions.push(isNull(schema.systemPreferences.scope));
        } else {
          conditions.push(eq(schema.systemPreferences.scope, scope));
        }

        if (userId === undefined || userId === null) {
          conditions.push(isNull(schema.systemPreferences.userId));
        } else {
          conditions.push(eq(schema.systemPreferences.userId, userId));
        }

        const [result] = await this.db
          .select()
          .from(schema.systemPreferences)
          .where(conditions.length > 1 ? and(...conditions) : conditions[0])
          .limit(1);

        if (!result) return null;
        return result.value as T;
      }, "GET_PREFERENCE_FAILED")
      .then((res) => {
        if (res.success) res.meta = { executionTime: performance.now() - startTime };
        return res;
      });
  }

  async getMany<T>(
    keys: string[],
    scope?: "user" | "system",
    userId?: DatabaseId,
  ): Promise<DatabaseResult<Record<string, T>>> {
    const startTime = performance.now();
    return this.core
      .wrap(async () => {
        if (!keys || keys.length === 0) return {};
        const conditions: import("drizzle-orm").SQL[] = [
          inArray(schema.systemPreferences.key, keys),
        ];

        if (scope === undefined || scope === null) {
          conditions.push(isNull(schema.systemPreferences.scope));
        } else {
          conditions.push(eq(schema.systemPreferences.scope, scope));
        }

        if (userId === undefined || userId === null) {
          conditions.push(isNull(schema.systemPreferences.userId));
        } else {
          conditions.push(eq(schema.systemPreferences.userId, userId));
        }

        const results = await this.db
          .select()
          .from(schema.systemPreferences)
          .where(conditions.length > 1 ? and(...conditions) : conditions[0] || undefined);

        const prefs: Record<string, T> = {};
        for (const result of results) {
          prefs[result.key] = result.value as T;
        }

        return prefs;
      }, "GET_PREFERENCES_FAILED")
      .then((res) => {
        if (res.success) res.meta = { executionTime: performance.now() - startTime };
        return res;
      });
  }

  async getByCategory<T>(
    category: string,
    scope?: "user" | "system",
    userId?: DatabaseId,
  ): Promise<DatabaseResult<Record<string, T>>> {
    const startTime = performance.now();
    return this.core
      .wrap(async () => {
        const conditions: import("drizzle-orm").SQL[] = [
          eq(schema.systemPreferences.visibility, category),
        ];
        if (scope === undefined || scope === null) {
          conditions.push(isNull(schema.systemPreferences.scope));
        } else {
          conditions.push(eq(schema.systemPreferences.scope, scope));
        }

        if (userId === undefined || userId === null) {
          conditions.push(isNull(schema.systemPreferences.userId));
        } else {
          conditions.push(eq(schema.systemPreferences.userId, userId));
        }

        const results = await this.db
          .select()
          .from(schema.systemPreferences)
          .where(conditions.length > 1 ? and(...conditions) : conditions[0] || undefined);

        const prefs: Record<string, T> = {};
        for (const result of results) {
          prefs[result.key] = result.value as T;
        }

        return prefs;
      }, "GET_BY_CATEGORY_FAILED")
      .then((res) => {
        if (res.success) res.meta = { executionTime: performance.now() - startTime };
        return res;
      });
  }

  async set<T>(
    key: string,
    value: T,
    scope?: "user" | "system",
    userId?: DatabaseId,
    category?: string,
  ): Promise<DatabaseResult<void>> {
    const startTime = performance.now();
    return this.core
      .wrap(async () => {
        const exists = await this.db
          .select()
          .from(schema.systemPreferences)
          .where(eq(schema.systemPreferences.key, key))
          .limit(1);

        if (exists.length > 0) {
          await this.db
            .update(schema.systemPreferences)
            .set({
              value: value as unknown as Record<string, unknown>,
              updatedAt: isoDateStringToDate(nowISODateString()),
              visibility: category || exists[0].visibility,
            })
            .where(eq(schema.systemPreferences.key, key));
        } else {
          await this.db.insert(schema.systemPreferences).values({
            _id: utils.generateId(),
            key,
            value: value as unknown as Record<string, unknown>,
            scope: scope || "system",
            userId: userId || null,
            visibility: category || "private",
            createdAt: isoDateStringToDate(nowISODateString()),
            updatedAt: isoDateStringToDate(nowISODateString()),
          });
        }
      }, "SET_PREFERENCE_FAILED")
      .then((res) => {
        if (res.success) res.meta = { executionTime: performance.now() - startTime };
        return res;
      });
  }

  async setMany<T>(
    preferences: Array<{
      key: string;
      value: T;
      scope?: "user" | "system";
      userId?: DatabaseId;
      category?: string;
    }>,
  ): Promise<DatabaseResult<void>> {
    const startTime = performance.now();
    return this.core
      .wrap(async () => {
        for (const pref of preferences) {
          const result = await this.set(
            pref.key,
            pref.value,
            pref.scope,
            pref.userId,
            pref.category,
          );
          if (!result.success) {
            throw new Error(`Failed to set preference ${pref.key}: ${result.message}`);
          }
        }
      }, "SET_PREFERENCES_FAILED")
      .then((res) => {
        if (res.success) res.meta = { executionTime: performance.now() - startTime };
        return res;
      });
  }

  async delete(
    key: string,
    scope?: "user" | "system",
    userId?: DatabaseId,
  ): Promise<DatabaseResult<void>> {
    const startTime = performance.now();
    return this.core
      .wrap(async () => {
        const conditions: import("drizzle-orm").SQL[] = [eq(schema.systemPreferences.key, key)];
        if (scope === undefined || scope === null) {
          conditions.push(isNull(schema.systemPreferences.scope));
        } else {
          conditions.push(eq(schema.systemPreferences.scope, scope));
        }

        if (userId === undefined || userId === null) {
          conditions.push(isNull(schema.systemPreferences.userId));
        } else {
          conditions.push(eq(schema.systemPreferences.userId, userId));
        }

        await this.db
          .delete(schema.systemPreferences)
          .where(conditions.length > 1 ? and(...conditions) : conditions[0] || undefined);
      }, "DELETE_PREFERENCE_FAILED")
      .then((res) => {
        if (res.success) res.meta = { executionTime: performance.now() - startTime };
        return res;
      });
  }

  async deleteMany(
    keys: string[],
    scope?: "user" | "system",
    userId?: DatabaseId,
  ): Promise<DatabaseResult<void>> {
    const startTime = performance.now();
    return this.core
      .wrap(async () => {
        const conditions: import("drizzle-orm").SQL[] = [];
        if (keys.length > 0) {
          conditions.push(inArray(schema.systemPreferences.key, keys));
        }
        if (scope === undefined || scope === null) {
          conditions.push(isNull(schema.systemPreferences.scope));
        } else {
          conditions.push(eq(schema.systemPreferences.scope, scope));
        }

        if (userId === undefined || userId === null) {
          conditions.push(isNull(schema.systemPreferences.userId));
        } else {
          conditions.push(eq(schema.systemPreferences.userId, userId));
        }

        const q = this.db.delete(schema.systemPreferences);
        if (conditions.length > 0) {
          await q.where(conditions.length > 1 ? and(...conditions) : conditions[0] || undefined);
        } else {
          await q;
        }
      }, "DELETE_PREFERENCES_FAILED")
      .then((res) => {
        if (res.success) res.meta = { executionTime: performance.now() - startTime };
        return res;
      });
  }

  async clear(scope?: "user" | "system", userId?: DatabaseId): Promise<DatabaseResult<void>> {
    const startTime = performance.now();
    return this.core
      .wrap(async () => {
        const conditions: import("drizzle-orm").SQL[] = [];
        if (scope === undefined || scope === null) {
          conditions.push(isNull(schema.systemPreferences.scope));
        } else {
          conditions.push(eq(schema.systemPreferences.scope, scope));
        }

        if (userId === undefined || userId === null) {
          conditions.push(isNull(schema.systemPreferences.userId));
        } else {
          conditions.push(eq(schema.systemPreferences.userId, userId));
        }

        const q = this.db.delete(schema.systemPreferences);
        if (conditions.length > 0) {
          await q.where(conditions.length > 1 ? and(...conditions) : conditions[0] || undefined);
        } else {
          await q;
        }
      }, "CLEAR_PREFERENCES_FAILED")
      .then((res) => {
        if (res.success) res.meta = { executionTime: performance.now() - startTime };
        return res;
      });
  }
}
