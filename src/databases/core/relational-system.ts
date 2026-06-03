/**
 * @file src/databases/core/relational-system.ts
 * @description Consolidated System module for all SQL-based database adapters.
 * Merges preferences, jobs, tenants, themes, widgets, and virtual folders.
 */

import { isoDateStringToDate, nowISODateString } from "@src/utils/date";
import { logger } from "@src/utils/logger";
import { and, asc, desc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import type {
  BaseQueryOptions,
  DatabaseId,
  DatabaseResult,
  EntityCreate,
  ISystemAdapter,
  Job,
  PaginationOption,
  SystemVirtualFolder,
  Theme,
  Widget,
  Tenant,
  MediaItem,
  ISqlAdapter,
} from "../db-interface";
import * as utils from "./relational-utils";

export class RelationalSystemModule implements ISystemAdapter {
  protected readonly adapter: ISqlAdapter;
  protected readonly schema: any;

  constructor(adapter: ISqlAdapter, schema: any) {
    this.adapter = adapter;
    this.schema = schema;
  }

  protected get db() {
    return (this.adapter as any).db;
  }

  protected getDb(options?: BaseQueryOptions) {
    return options?.transaction?.db || this.db;
  }

  // ============================================================
  // PREFERENCES
  // ============================================================
  public readonly preferences = {
    get: async <T>(
      key: string,
      options?: {
        scope?: "user" | "system";
        userId?: DatabaseId;
        tenantId?: DatabaseId | null;
      },
    ): Promise<DatabaseResult<T | null>> => {
      const scope = options?.scope || "system";
      const userId = options?.userId;
      const tenantId = options?.tenantId;

      return this.adapter.wrap(async () => {
        const conditions: any[] = [eq(this.schema.systemPreferences.key, key)];
        if (scope === "system") {
          if (tenantId)
            conditions.push(eq(this.schema.systemPreferences.tenantId, tenantId as string));
          else conditions.push(isNull(this.schema.systemPreferences.tenantId));
        } else if (userId) {
          conditions.push(eq(this.schema.systemPreferences.userId, userId.toString()));
        }

        const [result] = await this.getDb(options as any)
          .select(this.adapter.getPhysicalSelection(this.schema.systemPreferences))
          .from(this.schema.systemPreferences)
          .where(and(...conditions))
          .limit(1);

        if (!result) return null;
        try {
          return JSON.parse(result.value) as T;
        } catch {
          return result.value as T;
        }
      }, "GET_PREFERENCE_FAILED");
    },

    getMany: async <T>(
      keys: string[],
      options?: {
        scope?: "user" | "system";
        userId?: DatabaseId;
        tenantId?: DatabaseId | null;
      },
    ): Promise<DatabaseResult<Record<string, T>>> => {
      const scope = options?.scope || "system";
      const userId = options?.userId;
      const tenantId = options?.tenantId;

      return this.adapter.wrap(async () => {
        if (!keys || keys.length === 0) return {};
        const conditions: any[] = [inArray(this.schema.systemPreferences.key, keys)];
        if (scope === "system") {
          if (tenantId)
            conditions.push(eq(this.schema.systemPreferences.tenantId, tenantId as string));
          else conditions.push(isNull(this.schema.systemPreferences.tenantId));
        } else if (userId) {
          conditions.push(eq(this.schema.systemPreferences.userId, userId.toString()));
        }

        const results = await this.getDb(options as any)
          .select(this.adapter.getPhysicalSelection(this.schema.systemPreferences))
          .from(this.schema.systemPreferences)
          .where(and(...conditions));

        const prefs: Record<string, T> = {};
        for (const result of results) {
          try {
            prefs[result.key] = JSON.parse(result.value) as T;
          } catch {
            prefs[result.key] = result.value as T;
          }
        }
        return prefs;
      }, "GET_PREFERENCES_FAILED");
    },

    getByCategory: async <T>(
      category: string,
      options?: {
        scope?: "user" | "system";
        userId?: DatabaseId;
        tenantId?: DatabaseId | null;
      },
    ): Promise<DatabaseResult<Record<string, T>>> => {
      const scope = options?.scope || "system";
      const userId = options?.userId;
      const tenantId = options?.tenantId;

      return this.adapter.wrap(async () => {
        const conditions: any[] = [eq(this.schema.systemPreferences.visibility, category)];
        if (scope === "system") {
          if (tenantId)
            conditions.push(eq(this.schema.systemPreferences.tenantId, tenantId as string));
          else conditions.push(isNull(this.schema.systemPreferences.tenantId));
        } else if (userId) {
          conditions.push(eq(this.schema.systemPreferences.userId, userId.toString()));
        }

        const results = await this.getDb(options as any)
          .select(this.adapter.getPhysicalSelection(this.schema.systemPreferences))
          .from(this.schema.systemPreferences)
          .where(and(...conditions));

        const prefs: Record<string, T> = {};
        for (const result of results) {
          try {
            prefs[result.key] = JSON.parse(result.value) as T;
          } catch {
            prefs[result.key] = result.value as T;
          }
        }
        return prefs;
      }, "GET_BY_CATEGORY_FAILED");
    },

    set: async <T>(
      key: string,
      value: T,
      options?: {
        scope?: "user" | "system";
        userId?: DatabaseId;
        category?: string;
        tenantId?: DatabaseId | null;
      },
    ): Promise<DatabaseResult<void>> => {
      const scope = options?.scope || "system";
      const userId = options?.userId;
      const category = options?.category;
      const tenantId = options?.tenantId;

      return this.adapter.wrap(async () => {
        const now = new Date();
        const tid = scope === "system" ? (tenantId as string) || null : null;
        const uid = scope === "user" ? (userId as string) || null : null;

        // 🚀 HARDENING: Use primitives for all values to avoid driver binding errors
        const data = {
          key: String(key),
          value: typeof value === "object" ? JSON.stringify(value) : String(value),
          scope: String(scope),
          userId: uid ? String(uid) : null,
          visibility: String(category || "private"),
          tenantId: tid ? String(tid) : null,
          updatedAt: now,
        };

        const conditions = [eq(this.schema.systemPreferences.key, String(key))];
        if (tid) conditions.push(eq(this.schema.systemPreferences.tenantId, tid));
        else conditions.push(isNull(this.schema.systemPreferences.tenantId));

        const exists = await this.getDb(options as any)
          .select({ _id: this.schema.systemPreferences._id })
          .from(this.schema.systemPreferences)
          .where(and(...conditions))
          .limit(1);

        if (exists[0]) {
          await this.getDb(options as any)
            .update(this.schema.systemPreferences)
            .set({
              value: data.value,
              scope: data.scope,
              userId: data.userId,
              visibility: data.visibility,
              updatedAt: now,
            })
            .where(eq(this.schema.systemPreferences._id, exists[0]._id));
        } else {
          await this.getDb(options as any)
            .insert(this.schema.systemPreferences)
            .values({ ...data, _id: String(utils.generateId()), createdAt: now });
        }
      }, "SET_PREFERENCE_FAILED");
    },

    setMany: async <T>(
      preferences: Array<{
        key: string;
        value: T;
        scope?: "user" | "system";
        userId?: DatabaseId;
        category?: string;
      }>,
      options?: BaseQueryOptions,
    ): Promise<DatabaseResult<void>> => {
      return this.adapter.wrap(async () => {
        for (const pref of preferences) {
          await this.preferences.set(pref.key, pref.value, {
            scope: pref.scope,
            userId: pref.userId,
            category: pref.category,
            tenantId: (options as any)?.tenantId,
          });
        }
      }, "SET_PREFERENCES_FAILED");
    },

    delete: async (
      key: string,
      options?: {
        scope?: "user" | "system";
        userId?: DatabaseId;
        tenantId?: DatabaseId | null;
      },
    ): Promise<DatabaseResult<void>> => {
      const scope = options?.scope || "system";
      const userId = options?.userId;
      const tenantId = options?.tenantId;

      return this.adapter.wrap(async () => {
        const conditions: any[] = [eq(this.schema.systemPreferences.key, key)];
        if (scope === "system") {
          if (tenantId)
            conditions.push(eq(this.schema.systemPreferences.tenantId, tenantId as string));
          else conditions.push(isNull(this.schema.systemPreferences.tenantId));
        } else if (userId) {
          conditions.push(eq(this.schema.systemPreferences.userId, userId.toString()));
        }
        await this.getDb(options as any)
          .delete(this.schema.systemPreferences)
          .where(and(...conditions));
      }, "DELETE_PREFERENCE_FAILED");
    },

    deleteMany: async (
      keys: string[],
      options?: {
        scope?: "user" | "system";
        userId?: DatabaseId;
        tenantId?: DatabaseId | null;
      },
    ): Promise<DatabaseResult<void>> => {
      const scope = options?.scope || "system";
      const userId = options?.userId;
      const tenantId = options?.tenantId;

      return this.adapter.wrap(async () => {
        if (!keys || keys.length === 0) return;
        const conditions: any[] = [inArray(this.schema.systemPreferences.key, keys)];
        if (scope === "system") {
          if (tenantId)
            conditions.push(eq(this.schema.systemPreferences.tenantId, tenantId as string));
          else conditions.push(isNull(this.schema.systemPreferences.tenantId));
        } else if (userId) {
          conditions.push(eq(this.schema.systemPreferences.userId, userId.toString()));
        }
        await this.getDb(options as any)
          .delete(this.schema.systemPreferences)
          .where(and(...conditions));
      }, "DELETE_PREFERENCES_FAILED");
    },

    clear: async (options?: {
      scope?: "user" | "system";
      userId?: DatabaseId;
      tenantId?: DatabaseId | null;
    }): Promise<DatabaseResult<void>> => {
      const scope = options?.scope || "system";
      const userId = options?.userId;
      const tenantId = options?.tenantId;

      return this.adapter.wrap(async () => {
        const conditions: any[] = [];
        if (scope === "system") {
          if (tenantId)
            conditions.push(eq(this.schema.systemPreferences.tenantId, tenantId as string));
          else conditions.push(isNull(this.schema.systemPreferences.tenantId));
        } else if (userId) {
          conditions.push(eq(this.schema.systemPreferences.userId, userId.toString()));
        }
        await this.getDb(options as any)
          .delete(this.schema.systemPreferences)
          .where(and(...conditions));
      }, "CLEAR_PREFERENCES_FAILED");
    },
  };

  // ============================================================
  // JOBS
  // ============================================================
  public readonly jobs = {
    create: async (
      job: EntityCreate<Job>,
      options?: BaseQueryOptions,
    ): Promise<DatabaseResult<Job>> => {
      return this.adapter.wrap(
        async () => {
          const id = utils.generateId();
          const now = new Date();
          const nextRunAt = job.nextRunAt
            ? job.nextRunAt instanceof Date
              ? new Date(job.nextRunAt.getTime())
              : new Date(job.nextRunAt)
            : now;
          const values = {
            ...(job as any),
            _id: id,
            nextRunAt,
            createdAt: now,
            updatedAt: now,
          };
          const db = this.getDb(options);
          await db.insert(this.schema.sveltyJobs).values(utils.convertISOToDates(values));
          const [result] = await db
            .select(this.adapter.getPhysicalSelection(this.schema.sveltyJobs))
            .from(this.schema.sveltyJobs)
            .where(eq(this.schema.sveltyJobs._id, id));
          return result as unknown as Job;
        },
        "JOB_CREATE_FAILED",
        undefined,
        { transaction: options?.transaction },
      );
    },

    getById: async (
      jobId: DatabaseId,
      options?: BaseQueryOptions,
    ): Promise<DatabaseResult<Job | null>> => {
      return this.adapter.wrap(
        async () => {
          const [result] = await this.getDb(options)
            .select(this.adapter.getPhysicalSelection(this.schema.sveltyJobs))
            .from(this.schema.sveltyJobs)
            .where(eq(this.schema.sveltyJobs._id, jobId as string));
          return (result as unknown as Job) || null;
        },
        "JOB_GET_FAILED",
        undefined,
        { transaction: options?.transaction },
      );
    },

    getNextReady: async (limit = 10, tenantId?: string | null): Promise<DatabaseResult<Job[]>> => {
      return this.adapter.wrap(async () => {
        // 🚀 CROSS-CONTEXT FIX: Always use a clean Date instance
        // instantiated in the current context to ensure Drizzle checks pass.
        const cleanNow = new Date();
        const conditions = [
          eq(this.schema.sveltyJobs.status, "pending"),
          lte(this.schema.sveltyJobs.nextRunAt, cleanNow),
        ];
        if (tenantId) conditions.push(eq(this.schema.sveltyJobs.tenantId, tenantId));

        const results = await this.db
          .select(this.adapter.getPhysicalSelection(this.schema.sveltyJobs))
          .from(this.schema.sveltyJobs)
          .where(and(...conditions))
          .orderBy(this.schema.sveltyJobs.nextRunAt)
          .limit(limit);
        return results as unknown as Job[];
      }, "JOB_FETCH_READY_FAILED");
    },

    list: async (
      options?: PaginationOption & { status?: string; taskType?: string },
    ): Promise<DatabaseResult<Job[]>> => {
      return this.adapter.wrap(async () => {
        let q = this.db
          .select(this.adapter.getPhysicalSelection(this.schema.sveltyJobs))
          .from(this.schema.sveltyJobs)
          .$dynamic();
        const conditions = [];
        if (options?.status) conditions.push(eq(this.schema.sveltyJobs.status, options.status));
        if (options?.taskType)
          conditions.push(eq(this.schema.sveltyJobs.taskType, options.taskType));

        if (conditions.length > 0) q = q.where(and(...conditions));
        q = q.orderBy(desc(this.schema.sveltyJobs.createdAt));

        if (options?.limit) q = q.limit(options.limit);
        if (options?.offset) q = q.offset(options.offset);

        const results = await q;
        return results as unknown as Job[];
      }, "JOB_LIST_FAILED");
    },

    count: async (filter?: Record<string, unknown>): Promise<DatabaseResult<number>> => {
      return this.adapter.wrap(async () => {
        let q = this.db
          .select({ count: sql<number>`count(*)` })
          .from(this.schema.sveltyJobs)
          .$dynamic();
        const conditions = [];
        if (filter?.status)
          conditions.push(eq(this.schema.sveltyJobs.status, filter.status as any));
        if (filter?.taskType)
          conditions.push(eq(this.schema.sveltyJobs.taskType, filter.taskType as any));

        if (conditions.length > 0) q = q.where(and(...conditions));
        const [result] = await q;
        return Number(result?.count) || 0;
      }, "JOB_COUNT_FAILED");
    },

    update: async (
      jobId: DatabaseId,
      data: Partial<EntityCreate<Job>>,
    ): Promise<DatabaseResult<Job>> => {
      return this.adapter.wrap(async () => {
        const now = new Date();
        const updateValues = { ...data, updatedAt: now } as any;
        if (updateValues.nextRunAt) {
          updateValues.nextRunAt =
            updateValues.nextRunAt instanceof Date
              ? new Date(updateValues.nextRunAt.getTime())
              : new Date(updateValues.nextRunAt);
        }
        await this.db
          .update(this.schema.sveltyJobs)
          .set(utils.convertISOToDates(updateValues) as any)
          .where(eq(this.schema.sveltyJobs._id, jobId as string));

        const [result] = await this.db
          .select(this.adapter.getPhysicalSelection(this.schema.sveltyJobs))
          .from(this.schema.sveltyJobs)
          .where(eq(this.schema.sveltyJobs._id, jobId as string));
        return result as unknown as Job;
      }, "JOB_UPDATE_FAILED");
    },

    delete: async (jobId: DatabaseId): Promise<DatabaseResult<void>> => {
      return this.adapter.wrap(async () => {
        await this.db
          .delete(this.schema.sveltyJobs)
          .where(eq(this.schema.sveltyJobs._id, jobId as string));
      }, "JOB_DELETE_FAILED");
    },

    cleanup: async (olderThan: Date): Promise<DatabaseResult<number>> => {
      return this.adapter.wrap(async () => {
        const cleanOlder =
          olderThan instanceof Date ? new Date(olderThan.getTime()) : new Date(olderThan);
        const result = await this.db
          .delete(this.schema.sveltyJobs)
          .where(lte(this.schema.sveltyJobs.createdAt, cleanOlder));
        return (result as any).changes || (result as any).count || 0;
      }, "JOB_CLEANUP_FAILED");
    },
  };

  // ============================================================
  // TENANTS
  // ============================================================
  public readonly tenants = {
    create: async (
      tenant: EntityCreate<Tenant> & { _id?: DatabaseId },
    ): Promise<DatabaseResult<Tenant>> => {
      return this.adapter.wrap(async () => {
        const id = tenant._id || utils.generateId();
        const now = isoDateStringToDate(nowISODateString());

        const values = {
          ...tenant,
          _id: id,
          createdAt: now,
          updatedAt: now,
        };
        await this.db.insert(this.schema.tenants).values(utils.convertISOToDates(values) as any);
        const [created] = await this.db
          .select(this.adapter.getPhysicalSelection(this.schema.tenants))
          .from(this.schema.tenants)
          .where(eq(this.schema.tenants._id, id));
        return utils.convertDatesToISO(created) as unknown as Tenant;
      }, "CREATE_TENANT_FAILED");
    },

    getById: async (tenantId: DatabaseId): Promise<DatabaseResult<Tenant | null>> => {
      return this.adapter.wrap(async () => {
        const [tenant] = await this.db
          .select(this.adapter.getPhysicalSelection(this.schema.tenants))
          .from(this.schema.tenants)
          .where(eq(this.schema.tenants._id, tenantId))
          .limit(1);
        return tenant ? (utils.convertDatesToISO(tenant) as unknown as Tenant) : null;
      }, "GET_TENANT_FAILED");
    },

    update: async (
      tenantId: DatabaseId,
      data: Partial<EntityCreate<Tenant>>,
    ): Promise<DatabaseResult<Tenant>> => {
      return this.adapter.wrap(async () => {
        await this.db
          .update(this.schema.tenants)
          .set(
            utils.convertISOToDates({
              ...data,
              updatedAt: isoDateStringToDate(nowISODateString()),
            }) as any,
          )
          .where(eq(this.schema.tenants._id, tenantId));
        const [updated] = await this.db
          .select(this.adapter.getPhysicalSelection(this.schema.tenants))
          .from(this.schema.tenants)
          .where(eq(this.schema.tenants._id, tenantId))
          .limit(1);
        return utils.convertDatesToISO(updated) as unknown as Tenant;
      }, "UPDATE_TENANT_FAILED");
    },

    delete: async (tenantId: DatabaseId): Promise<DatabaseResult<void>> => {
      return this.adapter.wrap(async () => {
        await this.db.delete(this.schema.tenants).where(eq(this.schema.tenants._id, tenantId));
      }, "DELETE_TENANT_FAILED");
    },

    list: async (options: any = {}): Promise<DatabaseResult<Tenant[]>> => {
      return this.adapter.wrap(async () => {
        let q = this.db
          .select(this.adapter.getPhysicalSelection(this.schema.tenants))
          .from(this.schema.tenants)
          .$dynamic();
        if (options.limit) q = q.limit(options.limit);
        if (options.offset) q = q.offset(options.offset);

        const results = await q;
        return utils.convertArrayDatesToISO(results) as unknown as Tenant[];
      }, "LIST_TENANTS_FAILED");
    },
  };

  // ============================================================
  // THEMES
  // ============================================================
  public readonly themes = {
    setupThemeModels: async (): Promise<void> => {
      logger.debug("Theme models setup (no-op for SQL)");
    },

    getActive: async (): Promise<DatabaseResult<Theme | null>> => {
      return this.adapter.wrap(async () => {
        const [theme] = await this.db
          .select(this.adapter.getPhysicalSelection(this.schema.themes))
          .from(this.schema.themes)
          .where(eq(this.schema.themes.isActive, true))
          .limit(1);
        return theme ? (utils.convertDatesToISO(theme) as unknown as Theme) : null;
      }, "GET_ACTIVE_THEME_FAILED");
    },

    setDefault: async (themeId: DatabaseId): Promise<DatabaseResult<void>> => {
      return this.adapter.wrap(async () => {
        await this.db.update(this.schema.themes).set({ isDefault: false });
        await this.db
          .update(this.schema.themes)
          .set({ isDefault: true, isActive: true })
          .where(eq(this.schema.themes._id, themeId));
      }, "SET_DEFAULT_THEME_FAILED");
    },

    install: async (theme: EntityCreate<Theme>): Promise<DatabaseResult<Theme>> => {
      return this.adapter.wrap(async () => {
        const id = utils.generateId();
        const now = isoDateStringToDate(nowISODateString());
        const values = {
          ...theme,
          _id: id,
          createdAt: now,
          updatedAt: now,
        };
        await this.db.insert(this.schema.themes).values(utils.convertISOToDates(values) as any);
        const [inserted] = await this.db
          .select(this.adapter.getPhysicalSelection(this.schema.themes))
          .from(this.schema.themes)
          .where(eq(this.schema.themes._id, id));
        return utils.convertDatesToISO(inserted) as unknown as Theme;
      }, "INSTALL_THEME_FAILED");
    },

    uninstall: async (themeId: DatabaseId): Promise<DatabaseResult<void>> => {
      return this.adapter.wrap(async () => {
        await this.db.delete(this.schema.themes).where(eq(this.schema.themes._id, themeId));
      }, "UNINSTALL_THEME_FAILED");
    },

    update: async (
      themeId: DatabaseId,
      theme: Partial<EntityCreate<Theme>>,
    ): Promise<DatabaseResult<Theme>> => {
      return this.adapter.wrap(async () => {
        await this.db
          .update(this.schema.themes)
          .set(
            utils.convertISOToDates({
              ...theme,
              updatedAt: isoDateStringToDate(nowISODateString()),
            }) as any,
          )
          .where(eq(this.schema.themes._id, themeId));
        const [updated] = await this.db
          .select(this.adapter.getPhysicalSelection(this.schema.themes))
          .from(this.schema.themes)
          .where(eq(this.schema.themes._id, themeId));
        return utils.convertDatesToISO(updated) as unknown as Theme;
      }, "UPDATE_THEME_FAILED");
    },

    getAllThemes: async (options?: BaseQueryOptions): Promise<Theme[]> => {
      try {
        const results = await this.getDb(options)
          .select(this.adapter.getPhysicalSelection(this.schema.themes))
          .from(this.schema.themes);
        return utils.convertArrayDatesToISO(results) as unknown as Theme[];
      } catch {
        return [];
      }
    },

    storeThemes: async (themes: Theme[], options?: BaseQueryOptions): Promise<void> => {
      const now = isoDateStringToDate(nowISODateString());
      for (const theme of themes) {
        const values = utils.convertISOToDates({
          ...theme,
          updatedAt: now,
        }) as any;

        const tid = theme.tenantId || null;
        const conditions = [eq(this.schema.themes.name, theme.name)];
        if (tid) conditions.push(eq(this.schema.themes.tenantId, tid as string));
        else conditions.push(isNull(this.schema.themes.tenantId));

        const exists = await this.getDb(options as any)
          .select({ _id: this.schema.themes._id })
          .from(this.schema.themes)
          .where(and(...conditions))
          .limit(1);

        if (exists[0]) {
          await this.getDb(options as any)
            .update(this.schema.themes)
            .set(values)
            .where(eq(this.schema.themes._id, exists[0]._id));
        } else {
          await this.getDb(options as any)
            .insert(this.schema.themes)
            .values({ ...values, _id: theme._id || utils.generateId(), createdAt: now });
        }
      }
    },

    ensure: async (theme: EntityCreate<Theme>): Promise<Theme> => {
      const [existing] = await this.db
        .select()
        .from(this.schema.themes)
        .where(eq(this.schema.themes.name, theme.name))
        .limit(1);
      if (existing) return utils.convertDatesToISO(existing) as unknown as Theme;
      const res = await this.themes.install(theme);
      if (!res.success) throw res.error;
      return res.data;
    },

    getDefaultTheme: async (
      tenantId?: DatabaseId | null,
    ): Promise<DatabaseResult<Theme | null>> => {
      return this.adapter.wrap(async () => {
        const conditions = [eq(this.schema.themes.isDefault, true)];
        if (tenantId !== undefined) {
          conditions.push(
            tenantId === null
              ? isNull(this.schema.themes.tenantId)
              : eq(this.schema.themes.tenantId, tenantId as string),
          );
        }
        const [theme] = await this.db
          .select(this.adapter.getPhysicalSelection(this.schema.themes))
          .from(this.schema.themes)
          .where(and(...conditions))
          .limit(1);
        return theme ? (utils.convertDatesToISO(theme) as unknown as Theme) : null;
      }, "GET_DEFAULT_THEME_FAILED");
    },
  };

  // ============================================================
  // WIDGETS
  // ============================================================
  public readonly widgets = {
    setupWidgetModels: async (): Promise<void> => {
      logger.debug("Widget models setup (no-op for SQL)");
    },

    register: async (widget: EntityCreate<Widget>): Promise<DatabaseResult<Widget>> => {
      return this.adapter.wrap(async () => {
        const now = isoDateStringToDate(nowISODateString());
        const values = utils.convertISOToDates({
          ...widget,
          updatedAt: now,
        }) as any;

        const exists = await this.db
          .select({ _id: this.schema.widgets._id })
          .from(this.schema.widgets)
          .where(eq(this.schema.widgets.name, widget.name))
          .limit(1);

        if (exists[0]) {
          await this.db
            .update(this.schema.widgets)
            .set(values)
            .where(eq(this.schema.widgets._id, exists[0]._id));
        } else {
          await this.db
            .insert(this.schema.widgets)
            .values({ ...values, _id: utils.generateId(), createdAt: now });
        }

        const [result] = await this.db
          .select(this.adapter.getPhysicalSelection(this.schema.widgets))
          .from(this.schema.widgets)
          .where(eq(this.schema.widgets.name, widget.name))
          .limit(1);
        return utils.convertDatesToISO(result) as unknown as Widget;
      }, "REGISTER_WIDGET_FAILED");
    },

    findAll: async (): Promise<DatabaseResult<Widget[]>> => {
      return this.adapter.wrap(async () => {
        const results = await this.db
          .select(this.adapter.getPhysicalSelection(this.schema.widgets))
          .from(this.schema.widgets);
        return utils.convertArrayDatesToISO(results) as unknown as Widget[];
      }, "FIND_ALL_WIDGETS_FAILED");
    },

    getActiveWidgets: async (): Promise<DatabaseResult<Widget[]>> => {
      return this.adapter.wrap(async () => {
        const results = await this.db
          .select(this.adapter.getPhysicalSelection(this.schema.widgets))
          .from(this.schema.widgets)
          .where(eq(this.schema.widgets.isActive, true));
        return utils.convertArrayDatesToISO(results) as unknown as Widget[];
      }, "GET_ACTIVE_WIDGETS_FAILED");
    },

    activate: async (widgetId: DatabaseId): Promise<DatabaseResult<void>> => {
      return this.adapter.wrap(async () => {
        await this.db
          .update(this.schema.widgets)
          .set({ isActive: true, updatedAt: isoDateStringToDate(nowISODateString()) })
          .where(eq(this.schema.widgets._id, widgetId));
      }, "ACTIVATE_WIDGET_FAILED");
    },

    deactivate: async (widgetId: DatabaseId): Promise<DatabaseResult<void>> => {
      return this.adapter.wrap(async () => {
        await this.db
          .update(this.schema.widgets)
          .set({ isActive: false, updatedAt: isoDateStringToDate(nowISODateString()) })
          .where(eq(this.schema.widgets._id, widgetId));
      }, "DEACTIVATE_WIDGET_FAILED");
    },

    update: async (
      widgetId: DatabaseId,
      widget: Partial<EntityCreate<Widget>>,
    ): Promise<DatabaseResult<Widget>> => {
      return this.adapter.wrap(async () => {
        await this.db
          .update(this.schema.widgets)
          .set(
            utils.convertISOToDates({
              ...widget,
              updatedAt: isoDateStringToDate(nowISODateString()),
            }) as any,
          )
          .where(eq(this.schema.widgets._id, widgetId));
        const [updated] = await this.db
          .select(this.adapter.getPhysicalSelection(this.schema.widgets))
          .from(this.schema.widgets)
          .where(eq(this.schema.widgets._id, widgetId));
        return utils.convertDatesToISO(updated) as unknown as Widget;
      }, "UPDATE_WIDGET_FAILED");
    },

    delete: async (widgetId: DatabaseId): Promise<DatabaseResult<void>> => {
      return this.adapter.wrap(async () => {
        await this.db.delete(this.schema.widgets).where(eq(this.schema.widgets._id, widgetId));
      }, "DELETE_WIDGET_FAILED");
    },
  };

  // ============================================================
  // WEBSITE TOKENS
  // ============================================================
  public readonly websiteTokens = {
    create: async (
      token: Omit<import("../db-interface").WebsiteToken, "_id" | "createdAt">,
    ): Promise<DatabaseResult<import("../db-interface").WebsiteToken>> => {
      return this.adapter.wrap(async () => {
        const id = utils.generateId();
        const now = new Date();
        const values = {
          ...token,
          _id: id,
          createdAt: now,
          updatedAt: now,
        };
        await this.db
          .insert(this.schema.websiteTokens)
          .values(utils.convertISOToDates(values) as any);
        const [result] = await this.db
          .select(this.adapter.getPhysicalSelection(this.schema.websiteTokens))
          .from(this.schema.websiteTokens)
          .where(eq(this.schema.websiteTokens._id, id));
        return utils.convertDatesToISO(result) as unknown as import("../db-interface").WebsiteToken;
      }, "CREATE_WEBSITE_TOKEN_FAILED");
    },

    getAll: async (options: {
      limit?: number;
      skip?: number;
      sort?: string;
      order?: string;
    }): Promise<
      DatabaseResult<{ data: import("../db-interface").WebsiteToken[]; total: number }>
    > => {
      return this.adapter.wrap(async () => {
        let q = this.db
          .select(this.adapter.getPhysicalSelection(this.schema.websiteTokens))
          .from(this.schema.websiteTokens)
          .$dynamic();
        if (options.sort) {
          const orderFn = options.order === "desc" ? desc : asc;
          const column = (this.schema.websiteTokens as any)[options.sort];
          if (column) q = q.orderBy(orderFn(column));
        }
        if (options.limit) q = q.limit(options.limit);
        if (options.skip) q = q.offset(options.skip);

        const results = await q;
        const [totalResult] = await this.db
          .select({ count: sql<number>`count(*)` })
          .from(this.schema.websiteTokens);
        return {
          data: utils.convertArrayDatesToISO(
            results,
          ) as unknown as import("../db-interface").WebsiteToken[],
          total: Number(totalResult?.count || 0),
        };
      }, "GET_WEBSITE_TOKENS_FAILED");
    },

    getByName: async (
      name: string,
    ): Promise<DatabaseResult<import("../db-interface").WebsiteToken | null>> => {
      return this.adapter.wrap(async () => {
        const [result] = await this.db
          .select(this.adapter.getPhysicalSelection(this.schema.websiteTokens))
          .from(this.schema.websiteTokens)
          .where(eq(this.schema.websiteTokens.name, name))
          .limit(1);
        return result
          ? (utils.convertDatesToISO(result) as unknown as import("../db-interface").WebsiteToken)
          : null;
      }, "GET_WEBSITE_TOKEN_BY_NAME_FAILED");
    },

    getByToken: async (
      token: string,
    ): Promise<DatabaseResult<import("../db-interface").WebsiteToken | null>> => {
      return this.adapter.wrap(async () => {
        const [result] = await this.db
          .select(this.adapter.getPhysicalSelection(this.schema.websiteTokens))
          .from(this.schema.websiteTokens)
          .where(eq(this.schema.websiteTokens.token, token))
          .limit(1);
        return result
          ? (utils.convertDatesToISO(result) as unknown as import("../db-interface").WebsiteToken)
          : null;
      }, "GET_WEBSITE_TOKEN_BY_TOKEN_FAILED");
    },

    delete: async (tokenId: DatabaseId): Promise<DatabaseResult<void>> => {
      return this.adapter.wrap(async () => {
        await this.db
          .delete(this.schema.websiteTokens)
          .where(eq(this.schema.websiteTokens._id, tokenId));
      }, "DELETE_WEBSITE_TOKEN_FAILED");
    },
  };

  // ============================================================
  // VIRTUAL FOLDERS
  // ============================================================
  public readonly virtualFolder = {
    create: async (
      folder: EntityCreate<SystemVirtualFolder>,
      tenantId?: DatabaseId | null,
    ): Promise<DatabaseResult<SystemVirtualFolder>> => {
      return this.adapter.wrap(async () => {
        const id = utils.generateId();
        const now = isoDateStringToDate(nowISODateString());
        await this.db.insert(this.schema.systemVirtualFolders).values(
          utils.convertISOToDates({
            ...folder,
            _id: id,
            tenantId: tenantId || folder.tenantId || null,
            createdAt: now,
            updatedAt: now,
          }) as any,
        );
        const [created] = await this.db
          .select(this.adapter.getPhysicalSelection(this.schema.systemVirtualFolders))
          .from(this.schema.systemVirtualFolders)
          .where(eq(this.schema.systemVirtualFolders._id, id));
        return utils.convertDatesToISO(created) as unknown as SystemVirtualFolder;
      }, "CREATE_VIRTUAL_FOLDER_FAILED");
    },

    getById: async (
      folderId: DatabaseId,
      tenantId?: DatabaseId | null,
    ): Promise<DatabaseResult<SystemVirtualFolder | null>> => {
      return this.adapter.wrap(async () => {
        const conditions = [eq(this.schema.systemVirtualFolders._id, folderId)];
        if (tenantId)
          conditions.push(eq(this.schema.systemVirtualFolders.tenantId, tenantId as string));
        const [folder] = await this.db
          .select(this.adapter.getPhysicalSelection(this.schema.systemVirtualFolders))
          .from(this.schema.systemVirtualFolders)
          .where(and(...conditions))
          .limit(1);
        return folder ? (utils.convertDatesToISO(folder) as unknown as SystemVirtualFolder) : null;
      }, "GET_VIRTUAL_FOLDER_FAILED");
    },

    getByParentId: async (
      parentId: DatabaseId | null,
      tenantId?: DatabaseId | null,
    ): Promise<DatabaseResult<SystemVirtualFolder[]>> => {
      return this.adapter.wrap(async () => {
        const conditions = parentId
          ? [eq(this.schema.systemVirtualFolders.parentId, parentId as string)]
          : [isNull(this.schema.systemVirtualFolders.parentId)];
        if (tenantId)
          conditions.push(eq(this.schema.systemVirtualFolders.tenantId, tenantId as string));
        const results = await this.db
          .select(this.adapter.getPhysicalSelection(this.schema.systemVirtualFolders))
          .from(this.schema.systemVirtualFolders)
          .where(and(...conditions));
        return utils.convertArrayDatesToISO(results) as unknown as SystemVirtualFolder[];
      }, "GET_VIRTUAL_FOLDERS_BY_PARENT_FAILED");
    },

    getAll: async (
      tenantId?: DatabaseId | null,
    ): Promise<DatabaseResult<SystemVirtualFolder[]>> => {
      return this.adapter.wrap(async () => {
        let q = this.db
          .select(this.adapter.getPhysicalSelection(this.schema.systemVirtualFolders))
          .from(this.schema.systemVirtualFolders)
          .$dynamic();
        if (tenantId)
          q = q.where(eq(this.schema.systemVirtualFolders.tenantId, tenantId as string));
        const results = await q;
        return utils.convertArrayDatesToISO(results) as unknown as SystemVirtualFolder[];
      }, "GET_ALL_VIRTUAL_FOLDERS_FAILED");
    },

    update: async (
      folderId: DatabaseId,
      updateData: Partial<SystemVirtualFolder>,
      tenantId?: DatabaseId | null,
    ): Promise<DatabaseResult<SystemVirtualFolder>> => {
      return this.adapter.wrap(async () => {
        const conditions = [eq(this.schema.systemVirtualFolders._id, folderId)];
        if (tenantId)
          conditions.push(eq(this.schema.systemVirtualFolders.tenantId, tenantId as string));
        await this.db
          .update(this.schema.systemVirtualFolders)
          .set(
            utils.convertISOToDates({
              ...updateData,
              updatedAt: isoDateStringToDate(nowISODateString()),
            }) as any,
          )
          .where(and(...conditions));
        const [updated] = await this.db
          .select(this.adapter.getPhysicalSelection(this.schema.systemVirtualFolders))
          .from(this.schema.systemVirtualFolders)
          .where(eq(this.schema.systemVirtualFolders._id, folderId as string));
        return utils.convertDatesToISO(updated) as unknown as SystemVirtualFolder;
      }, "UPDATE_VIRTUAL_FOLDER_FAILED");
    },

    delete: async (
      folderId: DatabaseId,
      tenantId?: DatabaseId | null,
    ): Promise<DatabaseResult<void>> => {
      return this.adapter.wrap(async () => {
        const conditions = [eq(this.schema.systemVirtualFolders._id, folderId)];
        if (tenantId)
          conditions.push(eq(this.schema.systemVirtualFolders.tenantId, tenantId as string));
        await this.db.delete(this.schema.systemVirtualFolders).where(and(...conditions));
      }, "DELETE_VIRTUAL_FOLDER_FAILED");
    },

    exists: async (
      path: string,
      tenantId?: DatabaseId | null,
    ): Promise<DatabaseResult<boolean>> => {
      return this.adapter.wrap(async () => {
        const conditions = [eq(this.schema.systemVirtualFolders.path, path)];
        if (tenantId)
          conditions.push(eq(this.schema.systemVirtualFolders.tenantId, tenantId as string));
        const [folder] = await this.db
          .select(this.adapter.getPhysicalSelection(this.schema.systemVirtualFolders))
          .from(this.schema.systemVirtualFolders)
          .where(and(...conditions))
          .limit(1);
        return !!folder;
      }, "CHECK_VIRTUAL_FOLDER_EXISTS_FAILED");
    },

    getContents: async (
      folderPath: string,
      tenantId?: DatabaseId | null,
    ): Promise<DatabaseResult<{ folders: SystemVirtualFolder[]; files: MediaItem[] }>> => {
      return this.adapter.wrap(async () => {
        const conditions = [eq(this.schema.systemVirtualFolders.path, folderPath)];
        if (tenantId)
          conditions.push(eq(this.schema.systemVirtualFolders.tenantId, tenantId as string));
        const [folder] = await this.db
          .select(this.adapter.getPhysicalSelection(this.schema.systemVirtualFolders))
          .from(this.schema.systemVirtualFolders)
          .where(and(...conditions))
          .limit(1);
        if (!folder) throw new Error("Folder not found");

        const subQuery = this.db
          .select(this.adapter.getPhysicalSelection(this.schema.systemVirtualFolders))
          .from(this.schema.systemVirtualFolders)
          .where(eq(this.schema.systemVirtualFolders.parentId, folder._id));
        const fileQuery = this.db
          .select(this.adapter.getPhysicalSelection(this.schema.mediaItems))
          .from(this.schema.mediaItems)
          .where(eq(this.schema.mediaItems.folderId, folder._id));
        const [subfolders, files] = await Promise.all([subQuery, fileQuery]);
        return {
          folders: utils.convertArrayDatesToISO(subfolders) as unknown as SystemVirtualFolder[],
          files: utils.convertArrayDatesToISO(files) as unknown as MediaItem[],
        };
      }, "GET_VIRTUAL_FOLDER_CONTENTS_FAILED");
    },

    addToFolder: async (
      _contentId: DatabaseId,
      _folderPath: string,
      _tenantId?: DatabaseId | null,
    ): Promise<DatabaseResult<void>> => {
      return this.adapter.notImplemented("virtualFolder.addToFolder");
    },

    ensure: async (
      folder: EntityCreate<SystemVirtualFolder>,
      tenantId?: DatabaseId | null,
    ): Promise<DatabaseResult<SystemVirtualFolder>> => {
      const res = await this.virtualFolder.exists(folder.path, tenantId);
      if (res.success && res.data) {
        const conditions = [eq(this.schema.systemVirtualFolders.path, folder.path)];
        if (tenantId)
          conditions.push(eq(this.schema.systemVirtualFolders.tenantId, tenantId as string));
        const [f] = await this.db
          .select(this.adapter.getPhysicalSelection(this.schema.systemVirtualFolders))
          .from(this.schema.systemVirtualFolders)
          .where(and(...conditions))
          .limit(1);
        return {
          success: true,
          data: utils.convertDatesToISO(f) as unknown as SystemVirtualFolder,
        };
      }
      return this.virtualFolder.create(folder, tenantId);
    },
  };

  public readonly health = {
    getUpdateStatus: async (): Promise<
      DatabaseResult<{ updateAvailable: boolean; latestVersion?: string }>
    > => {
      return {
        success: true,
        data: {
          updateAvailable: false,
        },
      };
    },
  };
}
