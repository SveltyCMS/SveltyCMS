/**
 * @file src/databases/postgresql/modules/system/preferences-module.ts
 * @description System preferences module for PostgreSQL
 */

import { isoDateStringToDate, nowISODateString } from "@src/utils/date-utils";
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
      const conditions = [eq(schema.systemPreferences.key, key)];
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
      return (result?.value as T) ?? null;
    }, "GET_PREFERENCE_FAILED");
  }

  async getByCategory<T>(
    category: string,
    scope: "user" | "system" = "system",
    userId?: DatabaseId,
  ): Promise<DatabaseResult<Record<string, T>>> {
    return this.core.wrap(async () => {
      const conditions = [eq(schema.systemPreferences.category, category)];
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
      const map: Record<string, T> = {};
      results.forEach((r) => {
        map[r.key] = r.value as T;
      });
      return map;
    }, "GET_PREFERENCES_BY_CATEGORY_FAILED");
  }

  async set<T>(
    key: string,
    value: T,
    scope: "user" | "system" = "system",
    userId?: DatabaseId,
    category?: string,
  ): Promise<DatabaseResult<void>> {
    return this.core.wrap(async () => {
      const now = isoDateStringToDate(nowISODateString());
      const tenantId = scope === "system" ? (userId as string) || null : null;
      const user_id = scope === "user" ? (userId as string) || null : null;

      await this.db
        .insert(schema.systemPreferences)
        .values({
          _id: utils.generateId(),
          key,
          value,
          category: category || "general",
          scope,
          userId: user_id,
          tenantId,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [schema.systemPreferences.key, schema.systemPreferences.tenantId],
          set: { value, updatedAt: now },
        });
    }, "SET_PREFERENCE_FAILED");
  }

  async delete(
    key: string,
    scope: "user" | "system" = "system",
    userId?: DatabaseId,
  ): Promise<DatabaseResult<void>> {
    return this.core.wrap(async () => {
      const conditions = [eq(schema.systemPreferences.key, key)];
      if (scope === "system") {
        if (userId) {
          conditions.push(eq(schema.systemPreferences.tenantId, userId as string));
        } else {
          conditions.push(isNull(schema.systemPreferences.tenantId));
        }
      } else if (userId) {
        conditions.push(eq(schema.systemPreferences.userId, userId.toString()));
      }
      await this.db.delete(schema.systemPreferences).where(and(...conditions));
    }, "DELETE_PREFERENCE_FAILED");
  }

  async getMany<T>(
    keys: string[],
    scope: "user" | "system" = "system",
    userId?: DatabaseId,
  ): Promise<DatabaseResult<Record<string, T>>> {
    return this.core.wrap(async () => {
      if (!keys || keys.length === 0) {
        return {};
      }
      const conditions = [inArray(schema.systemPreferences.key, keys)];
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
      const map: Record<string, T> = {};
      results.forEach((r) => {
        map[r.key] = r.value as T;
      });
      return map;
    }, "GET_MANY_PREFERENCES_FAILED");
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
    return this.core.wrap(async () => {
      for (const pref of preferences) {
        await this.set(pref.key, pref.value, pref.scope, pref.userId, pref.category);
      }
    }, "SET_MANY_PREFERENCES_FAILED");
  }

  async deleteMany(
    keys: string[],
    _scope?: "user" | "system",
    _userId?: DatabaseId,
  ): Promise<DatabaseResult<void>> {
    return this.core.wrap(async () => {
      if (!keys || keys.length === 0) {
        return;
      }
      await this.db
        .delete(schema.systemPreferences)
        .where(inArray(schema.systemPreferences.key, keys));
    }, "DELETE_MANY_PREFERENCES_FAILED");
  }

  async clear(_scope?: "user" | "system", _userId?: DatabaseId): Promise<DatabaseResult<void>> {
    return this.core.wrap(async () => {
      await this.db.delete(schema.systemPreferences);
    }, "CLEAR_PREFERENCES_FAILED");
  }
}
