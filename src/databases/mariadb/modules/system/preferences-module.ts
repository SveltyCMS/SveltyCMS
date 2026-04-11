/**
 * @file src/databases/mariadb/modules/system/preferences-module.ts
 * @description System preferences module for MariaDB
 *
 * Features:
 * - Get preference
 * - Get preferences
 * - Set preference
 * - Set preferences
 * - Delete preference
 * - Delete preferences
 * - Clear preferences
 */

import { and, eq, inArray, isNull } from "drizzle-orm";
import type { DatabaseId, DatabaseResult } from "../../../db-interface";
import type { AdapterCore } from "../../adapter/adapter-core";
import * as schema from "../../schema";
import * as utils from "../../utils";

export class PreferencesModule {
  private readonly core: AdapterCore;

  constructor(core: AdapterCore) {
    this.core = core;
  }

  private get db() {
    return this.core.db!;
  }

  async get<T>(
    key: string,
    scope: "user" | "system" = "system",
    userId?: DatabaseId,
  ): Promise<DatabaseResult<T | null>> {
    return this.core.wrap(async () => {
      const conditions: import("drizzle-orm").SQL[] = [eq(schema.systemPreferences.key, key)];
      if (scope === "system") {
        // In system scope, userId is used as tenantId
        if (userId) {
          conditions.push(eq(schema.systemPreferences.tenantId, userId as string));
        } else {
          conditions.push(isNull(schema.systemPreferences.tenantId));
        }
      } else if (userId) {
        conditions.push(eq(schema.systemPreferences.userId, userId.toString()));
      }

      const [result] = await this.db
        .select()
        .from(schema.systemPreferences)
        .where(and(...conditions))
        .limit(1);

      if (!result) {
        return null;
      }
      return utils.parseJsonField<T>(result.value, null as T);
    }, "GET_PREFERENCE_FAILED");
  }

  async getMany<T>(
    keys: string[],
    scope: "user" | "system" = "system",
    userId?: DatabaseId,
  ): Promise<DatabaseResult<Record<string, T>>> {
    return this.core.wrap(async () => {
      const conditions: import("drizzle-orm").SQL[] = [inArray(schema.systemPreferences.key, keys)];
      if (scope === "system") {
        if (userId) {
          conditions.push(eq(schema.systemPreferences.tenantId, userId as string));
        } else {
          conditions.push(isNull(schema.systemPreferences.tenantId));
        }
      } else if (userId) {
        conditions.push(eq(schema.systemPreferences.userId, userId.toString()));
      }

      const results = await this.db
        .select()
        .from(schema.systemPreferences)
        .where(and(...conditions));

      const prefs: Record<string, T> = {};
      for (const result of results) {
        prefs[result.key] = utils.parseJsonField<T>(result.value, null as T);
      }

      return prefs;
    }, "GET_PREFERENCES_FAILED");
  }

  async getByCategory<T>(
    category: string,
    scope: "user" | "system" = "system",
    userId?: DatabaseId,
  ): Promise<DatabaseResult<Record<string, T>>> {
    return this.core.wrap(async () => {
      const conditions: import("drizzle-orm").SQL[] = [
        eq(schema.systemPreferences.visibility, category),
      ];
      if (scope === "system") {
        if (userId) {
          conditions.push(eq(schema.systemPreferences.tenantId, userId as string));
        } else {
          conditions.push(isNull(schema.systemPreferences.tenantId));
        }
      } else if (userId) {
        conditions.push(eq(schema.systemPreferences.userId, userId.toString()));
      }

      const results = await this.db
        .select()
        .from(schema.systemPreferences)
        .where(and(...conditions));

      const prefs: Record<string, T> = {};
      for (const result of results) {
        prefs[result.key] = utils.parseJsonField<T>(result.value, null as T);
      }

      return prefs;
    }, "GET_BY_CATEGORY_FAILED");
  }

  async set<T>(
    key: string,
    value: T,
    scope: "user" | "system" = "system",
    userId?: DatabaseId,
  ): Promise<DatabaseResult<void>> {
    return this.core.wrap(async () => {
      const tenantId = scope === "system" ? (userId as string) || null : null;
      const user_id = scope === "user" ? (userId as string) || null : null;

      const conditions = [eq(schema.systemPreferences.key, key)];
      if (tenantId) {
        conditions.push(eq(schema.systemPreferences.tenantId, tenantId));
      } else {
        conditions.push(isNull(schema.systemPreferences.tenantId));
      }

      const exists = await this.db
        .select()
        .from(schema.systemPreferences)
        .where(and(...conditions))
        .limit(1);

      if (exists.length > 0) {
        await this.db
          .update(schema.systemPreferences)
          .set({
            value: value as unknown as Record<string, unknown>,
            updatedAt: new Date(),
          })
          .where(and(...conditions));
      } else {
        await this.db.insert(schema.systemPreferences).values({
          _id: utils.generateId() as string,
          key,
          value: value as unknown as Record<string, unknown>,
          scope: scope || "system",
          userId: user_id,
          tenantId,
          visibility: "private",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }, "SET_PREFERENCE_FAILED");
  }

  async setMany<T>(
    preferences: Array<{
      key: string;
      value: T;
      scope?: "user" | "system";
      userId?: DatabaseId;
    }>,
  ): Promise<DatabaseResult<void>> {
    return this.core.wrap(async () => {
      for (const pref of preferences) {
        const result = await this.set(pref.key, pref.value, pref.scope, pref.userId);
        if (!result.success) {
          throw new Error(`Failed to set preference ${pref.key}: ${result.message}`);
        }
      }
    }, "SET_PREFERENCES_FAILED");
  }

  async delete(
    key: string,
    scope?: "user" | "system",
    userId?: DatabaseId,
  ): Promise<DatabaseResult<void>> {
    return this.core.wrap(async () => {
      const conditions: import("drizzle-orm").SQL[] = [eq(schema.systemPreferences.key, key)];
      if (scope) {
        conditions.push(eq(schema.systemPreferences.scope, scope));
      }
      if (userId) {
        conditions.push(eq(schema.systemPreferences.userId, userId));
      }

      await this.db.delete(schema.systemPreferences).where(and(...conditions));
    }, "DELETE_PREFERENCE_FAILED");
  }

  async deleteMany(
    keys: string[],
    scope?: "user" | "system",
    userId?: DatabaseId,
  ): Promise<DatabaseResult<void>> {
    return this.core.wrap(async () => {
      const conditions: import("drizzle-orm").SQL[] = [];
      if (keys.length > 0) {
        conditions.push(inArray(schema.systemPreferences.key, keys));
      }
      if (scope) {
        conditions.push(eq(schema.systemPreferences.scope, scope));
      }
      if (userId) {
        conditions.push(eq(schema.systemPreferences.userId, userId));
      }

      const q = this.db.delete(schema.systemPreferences);
      if (conditions.length > 0) {
        await q.where(and(...conditions));
      } else {
        await q;
      }
    }, "DELETE_PREFERENCES_FAILED");
  }

  async clear(scope?: "user" | "system", userId?: DatabaseId): Promise<DatabaseResult<void>> {
    return this.core.wrap(async () => {
      const conditions: import("drizzle-orm").SQL[] = [];
      if (scope) {
        conditions.push(eq(schema.systemPreferences.scope, scope));
      }
      if (userId) {
        conditions.push(eq(schema.systemPreferences.userId, userId));
      }

      const q = this.db.delete(schema.systemPreferences);
      if (conditions.length > 0) {
        await q.where(and(...conditions));
      } else {
        await q;
      }
    }, "CLEAR_PREFERENCES_FAILED");
  }
}
