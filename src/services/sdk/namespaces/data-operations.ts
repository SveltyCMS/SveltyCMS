/**
 * @file src/services/sdk/namespaces/data-operations.ts
 * @description Data operation namespaces for LocalCMS SDK.
 *
 * Provides zero-latency server-side wrappers around core data operation services:
 * config promotion, content transfer (import/export), schema migrations,
 * external importers, disaster-recovery backups, and cross-environment content sync.
 *
 * Each namespace follows the BaseNamespace + LocalApiOptions pattern for
 * multi-tenant isolation and consistent option passing.
 */

import { BaseNamespace } from "./misc-namespaces";
import type { IDBAdapter } from "@src/databases/db-interface";
import type { LocalApiOptions } from "./types";

// ---------------------------------------------------------------------------
// Configuration Namespace
// ---------------------------------------------------------------------------

/**
 * Wraps ConfigService for zero-latency config promotion operations.
 *
 * Methods: getStatus, performExport, performImport
 */
export class ConfigurationNamespace extends BaseNamespace {
  constructor(_dbAdapter: IDBAdapter) {
    super(_dbAdapter);
  }

  async getStatus(options: LocalApiOptions = {}) {
    const { configService } = await import("@src/services/core/config-service");
    return configService.getStatus(options.tenantId as string | undefined);
  }

  async performExport(params: { uuids?: string[] }, options: LocalApiOptions = {}) {
    const { configService } = await import("@src/services/core/config-service");
    return configService.performExport({
      uuids: params.uuids,
      tenantId: options.tenantId as string | undefined,
    });
  }

  async performImport(options: LocalApiOptions = {}) {
    const { configService } = await import("@src/services/core/config-service");
    return configService.performImport({
      tenantId: options.tenantId as string | undefined,
    });
  }
}

// ---------------------------------------------------------------------------
// Content Transfer Namespace (Export + Import)
// ---------------------------------------------------------------------------

/**
 * Wraps ContentPackageService for zero-latency content import/export.
 *
 * Export flow:  validateExport → planExport → runExport
 * Import flow:  validateImport → planImport → applyImport
 */
export class ContentTransferNamespace extends BaseNamespace {
  constructor(_dbAdapter: IDBAdapter) {
    super(_dbAdapter);
  }

  async validateExport(
    params: {
      collections?: string[];
      filter?: Record<string, unknown>;
      locale?: string;
      relationDepth?: number;
      includeMedia?: boolean;
      userId?: string;
    },
    options: LocalApiOptions = {},
  ) {
    const { contentPackageService } = await import("@src/services/core/content-package-service");
    return contentPackageService.validateExport({
      collections: params.collections,
      filter: params.filter,
      locale: params.locale,
      relationDepth: params.relationDepth,
      includeMedia: params.includeMedia,
      tenantId: options.tenantId as string,
      userId: params.userId ?? "system",
    });
  }

  async planExport(
    params: {
      collections?: string[];
      filter?: Record<string, unknown>;
      locale?: string;
      relationDepth?: number;
      includeMedia?: boolean;
      userId?: string;
    },
    options: LocalApiOptions = {},
  ) {
    const { contentPackageService } = await import("@src/services/core/content-package-service");
    return contentPackageService.planExport({
      collections: params.collections,
      filter: params.filter,
      locale: params.locale,
      relationDepth: params.relationDepth,
      includeMedia: params.includeMedia,
      tenantId: options.tenantId as string,
      userId: params.userId ?? "system",
    });
  }

  async runExport(
    params: {
      collections?: string[];
      filter?: Record<string, unknown>;
      locale?: string;
      relationDepth?: number;
      includeMedia?: boolean;
      userId?: string;
    },
    options: LocalApiOptions = {},
  ) {
    const { contentPackageService } = await import("@src/services/core/content-package-service");
    return contentPackageService.runExport({
      collections: params.collections,
      filter: params.filter,
      locale: params.locale,
      relationDepth: params.relationDepth,
      includeMedia: params.includeMedia,
      tenantId: options.tenantId as string,
      userId: params.userId ?? "system",
    });
  }

  async validateImport(pkg: Record<string, unknown>, options: LocalApiOptions = {}) {
    const { contentPackageService } = await import("@src/services/core/content-package-service");
    return contentPackageService.validateImport(pkg as any, {
      tenantId: options.tenantId as string,
      userId: (options as any).userId ?? "system",
    });
  }

  async planImport(
    pkg: Record<string, unknown>,
    params: {
      duplicateStrategy?: string;
      userId?: string;
    } = {},
    options: LocalApiOptions = {},
  ) {
    const { contentPackageService } = await import("@src/services/core/content-package-service");
    return contentPackageService.planImport(pkg as any, {
      duplicateStrategy: params.duplicateStrategy as any,
      tenantId: options.tenantId as string,
      userId: params.userId ?? "system",
    });
  }

  async applyImport(planId: string, options: LocalApiOptions & { userId?: string } = {}) {
    const { contentPackageService } = await import("@src/services/core/content-package-service");
    return contentPackageService.applyImport(planId, {
      tenantId: options.tenantId as string,
      userId: options.userId,
    });
  }

  async getJobStatus(jobId: string) {
    const { contentPackageService } = await import("@src/services/core/content-package-service");
    return contentPackageService.getJobStatus(jobId);
  }
}

// ---------------------------------------------------------------------------
// Migration Namespace
// ---------------------------------------------------------------------------

/**
 * Wraps MigrationEngine for zero-latency schema migration operations.
 *
 * Methods: createPlan, applyMigration, verifyMigration, getStatus, getHistory
 */
export class MigrationNamespace extends BaseNamespace {
  constructor(_dbAdapter: IDBAdapter) {
    super(_dbAdapter);
  }

  async createPlan(codeSchema: any) {
    const { MigrationEngine } = await import("@src/services/core/migration-engine");
    return MigrationEngine.createPlan(codeSchema);
  }

  async applyMigration(
    plan: any,
    codeSchema: any,
    params: { confirmed?: boolean; appliedBy?: string } = {},
  ) {
    const { MigrationEngine } = await import("@src/services/core/migration-engine");
    return MigrationEngine.applyMigration(plan, codeSchema, {
      confirmed: params.confirmed,
      appliedBy: params.appliedBy,
    });
  }

  async verifyMigration(codeSchema: any, planId: string) {
    const { MigrationEngine } = await import("@src/services/core/migration-engine");
    return MigrationEngine.verifyMigration(codeSchema, planId);
  }

  async getStatus(collectionId?: string) {
    const { MigrationEngine } = await import("@src/services/core/migration-engine");
    return MigrationEngine.getStatus(collectionId);
  }

  async getHistory(collectionId?: string) {
    const { MigrationEngine } = await import("@src/services/core/migration-engine");
    return MigrationEngine.getHistory(collectionId);
  }
}

// ---------------------------------------------------------------------------
// Importers Namespace
// ---------------------------------------------------------------------------

/**
 * Wraps external importer source listing.
 * Actual import operations delegate to the Smart Importer plugin.
 */
export class ImportersNamespace extends BaseNamespace {
  constructor(_dbAdapter: IDBAdapter) {
    super(_dbAdapter);
  }

  /**
   * Lists supported external import sources and their format capabilities.
   */
  listSources() {
    return {
      sources: [
        {
          id: "wordpress",
          name: "WordPress",
          formats: ["wxr", "xml"],
          description: "WordPress WXR export files",
        },
        { id: "drupal", name: "Drupal", formats: ["json"], description: "Drupal JSON:API exports" },
        {
          id: "directus",
          name: "Directus",
          formats: ["json"],
          description: "Directus JSON exports",
        },
        { id: "strapi", name: "Strapi", formats: ["json"], description: "Strapi JSON exports" },
        {
          id: "payload",
          name: "Payload CMS",
          formats: ["json"],
          description: "Payload CMS JSON exports",
        },
        {
          id: "sveltycms",
          name: "SveltyCMS",
          formats: ["ndjson"],
          description: "SveltyCMS content packages",
        },
        { id: "csv", name: "CSV", formats: ["csv"], description: "Comma-separated values" },
        {
          id: "json",
          name: "Generic JSON",
          formats: ["json"],
          description: "Flat or nested JSON arrays",
        },
      ],
    };
  }
}

// ---------------------------------------------------------------------------
// Backup Namespace
// ---------------------------------------------------------------------------

/**
 * Wraps BackupService for zero-latency disaster recovery operations.
 *
 * Methods: createBackup, validateBackup, createRestorePlan, restoreBackup, listBackups
 */
export class BackupNamespace extends BaseNamespace {
  constructor(_dbAdapter: IDBAdapter) {
    super(_dbAdapter);
  }

  async createBackup(
    params: {
      userId?: string;
      includeMedia?: boolean;
      encrypt?: boolean;
      encryptionKey?: string;
      label?: string;
      background?: boolean;
    },
    options: LocalApiOptions = {},
  ) {
    const { backupService } = await import("@src/services/core/backup-service");
    return backupService.createBackup({
      tenantId: options.tenantId as string,
      userId: params.userId ?? "system",
      includeMedia: params.includeMedia ?? false,
      encryptionKey: params.encrypt ? params.encryptionKey : undefined,
      label: params.label,
      background: params.background,
    });
  }

  async validateBackup(backupPath: string) {
    const { backupService } = await import("@src/services/core/backup-service");
    return backupService.validateBackup(backupPath);
  }

  async createRestorePlan(
    backupPath: string,
    params: {
      collections?: string[];
      decryptionKey?: string;
    } = {},
    options: LocalApiOptions = {},
  ) {
    const { backupService } = await import("@src/services/core/backup-service");
    return backupService.createRestorePlan(backupPath, {
      tenantId: options.tenantId as string,
      collections: params.collections,
      decryptionKey: params.decryptionKey,
    });
  }

  async restoreBackup(
    backupPath: string,
    params: {
      confirmed: boolean;
      userId?: string;
      superAdminOverride?: boolean;
      decryptionKey?: string;
      collections?: string[];
      background?: boolean;
    },
    options: LocalApiOptions = {},
  ) {
    const { backupService } = await import("@src/services/core/backup-service");
    return backupService.restoreBackup(backupPath, {
      confirmed: params.confirmed,
      tenantId: options.tenantId as string,
      userId: params.userId ?? "system",
      superAdminOverride: params.superAdminOverride ?? false,
      decryptionKey: params.decryptionKey,
      collections: params.collections,
      background: params.background,
    });
  }

  async listBackups(options: LocalApiOptions = {}) {
    const { backupService } = await import("@src/services/core/backup-service");
    return backupService.listBackups(options.tenantId as string | undefined);
  }

  async getJobStatus(jobId: string) {
    const { backupService } = await import("@src/services/core/backup-service");
    return backupService.getJobStatus(jobId);
  }
}

// ---------------------------------------------------------------------------
// Content Sync Namespace
// ---------------------------------------------------------------------------

/**
 * Wraps ContentSyncService for zero-latency cross-environment content sync.
 *
 * Methods: listChannels, createChannel, updateChannel, deleteChannel,
 *          createSyncPlan, pushContent, pullContent, getJobStatus
 */
// ---------------------------------------------------------------------------
// Content Structure Namespace (Collection Builder organizational tree)
// ---------------------------------------------------------------------------

/**
 * Zero-latency wrappers for GUI structure saves (DB + manifest + SSE).
 * Used by Collection Builder remotes and form actions.
 */
export class ContentStructureNamespace extends BaseNamespace {
  constructor(_dbAdapter: IDBAdapter) {
    super(_dbAdapter);
  }

  async saveGuiStructure(
    operations: import("@src/content/types").ContentNodeOperation[],
    options: LocalApiOptions = {},
  ) {
    const { syncContentState } = await import("@src/content/index.server");
    return syncContentState({
      reason: "gui-save",
      tenantId: options.tenantId ?? null,
      adapter: this._dbAdapter,
      operations,
    });
  }

  async getFlatStructure(options: LocalApiOptions = {}) {
    const { contentService } = await import("@src/content/engine.server");
    return contentService.getContentStructureFromDatabase(
      "flat",
      options.tenantId ?? null,
      this._dbAdapter,
    );
  }

  async deleteByIds(ids: string[], options: LocalApiOptions = {}) {
    const current = await this.getFlatStructure(options);
    const paths = current
      .filter((n) => ids.includes(n._id?.toString()))
      .map((n) => n.path)
      .filter((p): p is string => !!p);

    if (paths.length === 0) {
      return { found: false as const, paths: [] as string[] };
    }

    const operations: import("@src/content/types").ContentNodeOperation[] = paths.map((p) => ({
      type: "delete",
      node: { path: p },
    }));

    const result = await this.saveGuiStructure(operations, options);
    return { found: true as const, paths, result };
  }
}

export class ContentSyncNamespace extends BaseNamespace {
  constructor(_dbAdapter: IDBAdapter) {
    super(_dbAdapter);
  }

  async listChannels(options: LocalApiOptions = {}) {
    const { contentSyncService } = await import("@src/services/core/content-sync-service");
    return contentSyncService.listChannels(options.tenantId as string | undefined);
  }

  async createChannel(config: {
    label: string;
    source: any;
    target: any;
    collections: string[];
    direction?: string;
    enabled?: boolean;
    anonymizeOnPull?: boolean;
    conflictStrategy?: string;
  }) {
    const { contentSyncService } = await import("@src/services/core/content-sync-service");
    return contentSyncService.createChannel(config as any);
  }

  async updateChannel(channelId: string, updates: Record<string, unknown>) {
    const { contentSyncService } = await import("@src/services/core/content-sync-service");
    return contentSyncService.updateChannel(channelId, updates as any);
  }

  async deleteChannel(channelId: string) {
    const { contentSyncService } = await import("@src/services/core/content-sync-service");
    return contentSyncService.deleteChannel(channelId);
  }

  async createSyncPlan(
    channelId: string,
    params: {
      locale?: string;
      relationDepth?: number;
      includeMedia?: boolean;
      userId?: string;
    } = {},
  ) {
    const { contentSyncService } = await import("@src/services/core/content-sync-service");
    return contentSyncService.createSyncPlan(channelId, params as any);
  }

  async pushContent(
    channelId: string,
    params: {
      adminConfirmation?: boolean;
      confirmed?: boolean;
      userId?: string;
      locale?: string;
      relationDepth?: number;
      includeMedia?: boolean;
    } = {},
  ) {
    const { contentSyncService } = await import("@src/services/core/content-sync-service");
    return contentSyncService.pushContent(channelId, params as any);
  }

  async pullContent(
    channelId: string,
    params: {
      anonymize?: boolean;
      userId?: string;
      locale?: string;
      relationDepth?: number;
      includeMedia?: boolean;
    } = {},
  ) {
    const { contentSyncService } = await import("@src/services/core/content-sync-service");
    return contentSyncService.pullContent(channelId, params as any);
  }

  async getJobStatus(jobId: string) {
    const { contentSyncService } = await import("@src/services/core/content-sync-service");
    return contentSyncService.getJobStatus(jobId);
  }
}
