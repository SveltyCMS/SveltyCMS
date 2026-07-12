/**
 * @file src/routes/api/graphql/resolvers/data-operations.ts
 * @description
 * GraphQL mutations and queries for CMS data operations: config promotion,
 * content packages, backups, schema migrations, and content sync.
 *
 * ### Features:
 * - Config promotion: export plan → preview plan → apply
 * - Content packages: validate → export / validate → import
 * - Backups: create, restore (plan-first pattern)
 * - Schema migrations: plan → apply (idempotent with ledger)
 * - Content sync: push / pull between environments
 *
 * ### Query resolvers:
 * - configStatus, backupList, channelList, migrationStatus
 */

import { GraphQLScalarType, Kind } from "graphql";
import type { IDBAdapter } from "@databases/db-interface";

// ---------------------------------------------------------------------------
// JSON Scalar
// ---------------------------------------------------------------------------

export const JSONScalar = new GraphQLScalarType({
  name: "JSON",
  description: "Arbitrary JSON value",
  serialize(value: unknown): unknown {
    return value;
  },
  parseValue(value: unknown): unknown {
    return value;
  },
  parseLiteral(ast): unknown {
    if (ast.kind === Kind.STRING) {
      try {
        return JSON.parse(ast.value);
      } catch {
        return ast.value;
      }
    }
    if (ast.kind === Kind.OBJECT) {
      return parseObjectLiteral(ast);
    }
    if (ast.kind === Kind.LIST) {
      return ast.values.map((v: any) =>
        v.kind === Kind.OBJECT ? parseObjectLiteral(v) : (v as any).value,
      );
    }
    return (ast as any).value;
  },
});

function parseObjectLiteral(ast: any): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of ast.fields) {
    const value = field.value;
    if (value.kind === Kind.OBJECT) {
      result[field.name.value] = parseObjectLiteral(value);
    } else if (value.kind === Kind.LIST) {
      result[field.name.value] = value.values.map((v: any) =>
        v.kind === Kind.OBJECT ? parseObjectLiteral(v) : v.value,
      );
    } else {
      result[field.name.value] = value.value;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

export const dataOperationsTypeDefs = `
  scalar JSON

  # ── Config Promotion ──

  type ConfigStatus {
    status: String!
    changes: ConfigChanges!
    unmetRequirements: [UnmetRequirement!]!
  }

  type ConfigChanges {
    new: [ConfigEntity!]!
    updated: [ConfigEntity!]!
    deleted: [ConfigEntity!]!
  }

  type ConfigEntity {
    uuid: String!
    name: String!
    type: String!
    hash: String!
  }

  type UnmetRequirement {
    key: String!
    value: String
  }

  type ConfigExportResult {
    dirPath: String!
    message: String!
  }

  type ConfigPlan {
    planId: String!
    status: String!
    operationType: String!
    mode: String!
    risk: String!
    operations: [PlanOperation!]!
    warnings: [String!]!
    blockedReasons: [String!]!
    requiresConfirmation: Boolean!
  }

  type PlanOperation {
    action: String!
    type: String!
    name: String!
    uuid: String!
  }

  type ApplyResult {
    success: Boolean!
    message: String!
  }

  # ── Content Packages ──

  type ValidationResult {
    valid: Boolean!
    errors: [String!]!
    warnings: [String!]!
  }

  type ContentExportResult {
    jobId: String
    manifest: JSON
    collections: [String!]!
    message: String!
  }

  # ── Backups ──

  type BackupResult {
    success: Boolean!
    jobId: String
    backupPath: String
    message: String!
  }

  type BackupArtifact {
    path: String!
    label: String!
    createdAt: String!
    tenantId: String!
    adapter: String!
    cmsVersion: String!
    numCollections: Int!
    numEntries: Int!
    includesMedia: Boolean!
    sizeBytes: Int!
    encrypted: Boolean!
  }

  # ── Migrations ──

  type MigrationPlanResult {
    planId: String!
    collectionId: String!
    risk: String!
    requiresConfirmation: Boolean!
    requiresMigration: Boolean!
    impact: MigrationPlanImpact!
    preconditions: [String!]!
    postconditions: [String!]!
  }

  type MigrationPlanImpact {
    documentsAffected: Int!
    dataLossPotential: Boolean!
  }

  type MigrationStatusResult {
    collectionId: String!
    pending: Int!
    applied: Int!
    failed: Int!
    rolledBack: Int!
  }

  # ── Content Sync ──

  type SyncResult {
    success: Boolean!
    channelId: String!
    direction: String!
    jobId: String
    message: String!
  }

  type ContentSyncChannel {
    channelId: String!
    label: String!
    source: SyncEndpoint!
    target: SyncEndpoint!
    collections: [String!]!
    direction: String!
    enabled: Boolean!
    anonymizeOnPull: Boolean!
    conflictStrategy: String!
    createdAt: String!
    updatedAt: String!
    lastSyncAt: String
  }

  type SyncEndpoint {
    tenantId: String!
    label: String!
  }
`;

// ---------------------------------------------------------------------------
// Query Fields
// ---------------------------------------------------------------------------

export const dataOperationsQueryFields = `
  configStatus(tenantId: String): ConfigStatus
  backupList(tenantId: String): [BackupArtifact!]!
  channelList(tenantId: String): [ContentSyncChannel!]!
  migrationStatus(collectionName: String): [MigrationStatusResult!]!
`;

// ---------------------------------------------------------------------------
// Mutation Fields
// ---------------------------------------------------------------------------

export const dataOperationsMutationFields = `
  # Config promotion
  configExport(tenantId: String): ConfigExportResult!
  configPlan(mode: String, tenantId: String): ConfigPlan!
  configApply(confirmed: Boolean, tenantId: String): ApplyResult!

  # Content packages
  contentExportValidate(collections: [String!]!, tenantId: String): ValidationResult!
  contentExportRun(collections: [String!]!, tenantId: String): ContentExportResult!
  contentImportValidate(package: JSON!, tenantId: String): ValidationResult!

  # Backups
  backupCreate(includeMedia: Boolean, tenantId: String): BackupResult!
  backupRestore(backupPath: String!, confirmed: Boolean!, tenantId: String): BackupResult!

  # Migrations
  migrationPlan(collectionName: String!, tenantId: String): MigrationPlanResult!
  migrationApply(planId: String!, confirmed: Boolean, tenantId: String): ApplyResult!

  # Content sync
  contentSyncPush(channelId: String!, confirmed: Boolean, tenantId: String): SyncResult!
  contentSyncPull(channelId: String!, anonymize: Boolean, tenantId: String): SyncResult!
`;

// ---------------------------------------------------------------------------
// Context Interface
// ---------------------------------------------------------------------------

interface GraphQLContext {
  user?: { isAdmin?: boolean; _id?: string; role?: string };
  tenantId?: string | null;
}

// ---------------------------------------------------------------------------
// Query Resolvers
// ---------------------------------------------------------------------------

export function dataOperationsQueryResolvers(_dbAdapter: IDBAdapter, tenantId?: string | null) {
  const tid = tenantId ?? undefined;

  return {
    configStatus: async (_: unknown, args: { tenantId?: string }, ctx: GraphQLContext) => {
      if (!ctx.user) throw new Error("Authentication required");
      const { configService } = await import("@src/services/core/config-service");
      const status = await configService.getStatus(args.tenantId ?? tid);
      return {
        status: status.status,
        changes: {
          new: status.changes.new,
          updated: status.changes.updated,
          deleted: status.changes.deleted,
        },
        unmetRequirements: status.unmetRequirements.map((r) => ({
          key: r.key,
          value: r.value != null ? String(r.value) : null,
        })),
      };
    },

    backupList: async (_: unknown, args: { tenantId?: string }, ctx: GraphQLContext) => {
      if (!ctx.user?.isAdmin) throw new Error("Admin access required");
      const { backupService } = await import("@src/services/core/backup-service");
      const result = await backupService.listBackups(args.tenantId ?? tid);
      return result.backups.map((b) => ({
        path: b.path,
        label: b.label,
        createdAt: b.createdAt,
        tenantId: b.tenantId,
        adapter: b.adapter,
        cmsVersion: b.cmsVersion,
        numCollections: b.numCollections,
        numEntries: b.numEntries,
        includesMedia: b.includesMedia,
        sizeBytes: b.sizeBytes,
        encrypted: b.encrypted,
      }));
    },

    channelList: async (_: unknown, args: { tenantId?: string }, ctx: GraphQLContext) => {
      if (!ctx.user?.isAdmin) throw new Error("Admin access required");
      const { contentSyncService } = await import("@src/services/core/content-sync-service");
      const channels = await contentSyncService.listChannels(args.tenantId ?? tid);
      return channels.map((c) => ({
        channelId: c.channelId,
        label: c.label,
        source: c.source,
        target: c.target,
        collections: c.collections,
        direction: c.direction,
        enabled: c.enabled,
        anonymizeOnPull: c.anonymizeOnPull,
        conflictStrategy: c.conflictStrategy,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        lastSyncAt: c.lastSyncAt ?? null,
      }));
    },

    migrationStatus: async (_: unknown, args: { collectionName?: string }, ctx: GraphQLContext) => {
      if (!ctx.user?.isAdmin) throw new Error("Admin access required");
      const { MigrationEngine } = await import("@src/services/core/migration-engine");
      const results = await MigrationEngine.getStatus(args.collectionName);
      return results.map((r) => ({
        collectionId: r.collectionId,
        pending: r.pending,
        applied: r.applied,
        failed: r.failed,
        rolledBack: r.rolledBack,
      }));
    },
  };
}

// ---------------------------------------------------------------------------
// Mutation Resolvers
// ---------------------------------------------------------------------------

export function dataOperationsMutationResolvers(_dbAdapter: IDBAdapter, tenantId?: string | null) {
  const tid = tenantId ?? undefined;

  return {
    // ── Config Promotion ──

    configExport: async (_: unknown, args: { tenantId?: string }, ctx: GraphQLContext) => {
      if (!ctx.user?.isAdmin) throw new Error("Admin access required");
      const { configService } = await import("@src/services/core/config-service");
      const result = await configService.performExport({
        tenantId: args.tenantId ?? tid,
      });
      return {
        dirPath: result.dirPath,
        message: `Configuration exported to ${result.dirPath}`,
      };
    },

    configPlan: async (
      _: unknown,
      args: { mode?: string; tenantId?: string },
      ctx: GraphQLContext,
    ) => {
      if (!ctx.user?.isAdmin) throw new Error("Admin access required");
      const { configService } = await import("@src/services/core/config-service");
      const status = await configService.getStatus(args.tenantId ?? tid);

      const allChanges = [
        ...status.changes.new.map((e) => ({ ...e, action: "create" })),
        ...status.changes.updated.map((e) => ({ ...e, action: "update" })),
        ...status.changes.deleted.map((e) => ({ ...e, action: "delete" })),
      ];

      const mode = args.mode ?? "full";
      const hasDestructive = status.changes.deleted.length > 0;
      const risk = hasDestructive ? "destructive" : "warning";

      const warnings: string[] = [];
      if (hasDestructive) {
        warnings.push(`${status.changes.deleted.length} entities will be deleted`);
      }
      if (status.unmetRequirements.length > 0) {
        warnings.push(`${status.unmetRequirements.length} unmet requirements detected`);
      }

      return {
        planId: `config_${Date.now()}`,
        status: status.status,
        operationType: "config-promotion",
        mode,
        risk,
        operations: allChanges.map((e) => ({
          action: (e as any).action,
          type: e.type,
          name: e.name,
          uuid: e.uuid,
        })),
        warnings,
        blockedReasons: status.unmetRequirements.map((r) => r.key),
        requiresConfirmation: hasDestructive,
      };
    },

    configApply: async (
      _: unknown,
      args: { confirmed?: boolean; tenantId?: string },
      ctx: GraphQLContext,
    ) => {
      if (!ctx.user?.isAdmin) throw new Error("Admin access required");
      const { configService } = await import("@src/services/core/config-service");

      const status = await configService.getStatus(args.tenantId ?? tid);
      const hasDestructive = status.changes.deleted.length > 0;

      if (hasDestructive && !args.confirmed) {
        return {
          success: false,
          message: "Config apply has destructive changes. Set confirmed: true to proceed.",
        };
      }

      try {
        await configService.performImport({ tenantId: args.tenantId ?? tid });
        return {
          success: true,
          message: "Configuration applied successfully.",
        };
      } catch (err) {
        return {
          success: false,
          message: `Config apply failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },

    // ── Content Packages ──

    contentExportValidate: async (
      _: unknown,
      args: { collections: string[]; tenantId?: string },
      ctx: GraphQLContext,
    ) => {
      if (!ctx.user) throw new Error("Authentication required");
      const { contentPackageService } = await import("@src/services/core/content-package-service");
      const result = await contentPackageService.validateExport({
        collections: args.collections,
        tenantId: args.tenantId ?? tid,
        userId: (ctx.user as any)?._id ?? ctx.user,
      });
      return {
        valid: result.valid,
        errors: result.errors,
        warnings: result.warnings,
      };
    },

    contentExportRun: async (
      _: unknown,
      args: { collections: string[]; tenantId?: string },
      ctx: GraphQLContext,
    ) => {
      if (!ctx.user) throw new Error("Authentication required");
      const { contentPackageService } = await import("@src/services/core/content-package-service");
      try {
        const pkg = await contentPackageService.runExport({
          collections: args.collections,
          tenantId: args.tenantId ?? tid,
          userId: (ctx.user as any)?._id ?? ctx.user,
        });
        return {
          jobId: null,
          manifest: pkg.manifest,
          collections: Object.keys(pkg.collections ?? {}),
          message: `Exported ${Object.values(pkg.manifest.resources ?? {}).reduce((a, b) => (a as number) + (b as number), 0)} entries across ${Object.keys(pkg.collections ?? {}).length} collections.`,
        };
      } catch (err) {
        throw new Error(
          `Content export failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },

    contentImportValidate: async (
      _: unknown,
      args: { package: unknown; tenantId?: string },
      ctx: GraphQLContext,
    ) => {
      if (!ctx.user) throw new Error("Authentication required");
      const { contentPackageService } = await import("@src/services/core/content-package-service");
      const result = await contentPackageService.validateImport(args.package as any, {
        tenantId: args.tenantId ?? tid,
      });
      return {
        valid: result.valid,
        errors: result.errors,
        warnings: result.warnings,
      };
    },

    // ── Backups ──

    backupCreate: async (
      _: unknown,
      args: { includeMedia?: boolean; tenantId?: string },
      ctx: GraphQLContext,
    ) => {
      if (!ctx.user?.isAdmin) throw new Error("Admin access required");
      const { backupService } = await import("@src/services/core/backup-service");
      const result = await backupService.createBackup({
        tenantId: args.tenantId ?? tid,
        userId: (ctx.user as any)?._id ?? ctx.user,
        includeMedia: args.includeMedia ?? false,
      });
      return {
        success: result.success,
        jobId: result.jobId ?? null,
        backupPath: result.backupPath ?? null,
        message: result.message,
      };
    },

    backupRestore: async (
      _: unknown,
      args: { backupPath: string; confirmed: boolean; tenantId?: string },
      ctx: GraphQLContext,
    ) => {
      if (!ctx.user?.isAdmin) throw new Error("Admin access required");
      const { backupService } = await import("@src/services/core/backup-service");
      const result = await backupService.restoreBackup(args.backupPath, {
        confirmed: args.confirmed,
        tenantId: args.tenantId ?? tid,
        userId: (ctx.user as any)?._id ?? ctx.user,
      });
      return {
        success: result.success,
        jobId: result.jobId ?? null,
        backupPath: null,
        message: result.message,
      };
    },

    // ── Migrations ──

    migrationPlan: async (
      _: unknown,
      args: { collectionName: string; tenantId?: string },
      ctx: GraphQLContext,
    ) => {
      if (!ctx.user?.isAdmin) throw new Error("Admin access required");
      const { MigrationEngine } = await import("@src/services/core/migration-engine");
      const { contentStore } = await import("@stores/content-registry.svelte");

      const schema = contentStore.getCollection(args.collectionName, args.tenantId ?? tid ?? null);
      if (!schema) {
        throw new Error(`Collection not found: "${args.collectionName}"`);
      }

      const plan = await MigrationEngine.createPlan(schema as any);
      return {
        planId: plan.planId,
        collectionId: plan.collectionId,
        risk: plan.risk,
        requiresConfirmation: plan.requiresConfirmation,
        requiresMigration: plan.requiresMigration,
        impact: {
          documentsAffected: plan.impact.documentsAffected,
          dataLossPotential: plan.impact.dataLossPotential,
        },
        preconditions: plan.preconditions,
        postconditions: plan.postconditions,
      };
    },

    migrationApply: async (
      _: unknown,
      args: { planId: string; confirmed?: boolean; tenantId?: string },
      ctx: GraphQLContext,
    ) => {
      if (!ctx.user?.isAdmin) throw new Error("Admin access required");
      const { MigrationEngine } = await import("@src/services/core/migration-engine");
      const { contentStore } = await import("@stores/content-registry.svelte");
      const { dbAdapter } = await import("@src/databases/db");

      // Look up the migration record and collection from the planId
      let collectionId = "";
      let plan: any = null;

      if (dbAdapter) {
        const result = await dbAdapter.crud.findMany("migration_ledger", {
          planId: args.planId,
        } as any);
        if (result.success && result.data && result.data.length > 0) {
          const record = result.data[0] as any;
          collectionId = record.collectionId;
        }
      }

      // Try to infer collection from planId prefix patterns
      if (!collectionId) {
        // The planId was generated by createPlan; try looking up all collections
        const allCollections = contentStore.getCollections(args.tenantId ?? tid ?? null);
        for (const col of allCollections) {
          const freshPlan = await MigrationEngine.createPlan(col as any);
          if (freshPlan.planId === args.planId) {
            plan = freshPlan;
            collectionId = freshPlan.collectionId;
            break;
          }
        }
      }

      if (!collectionId && !plan) {
        throw new Error(
          `Migration plan not found: "${args.planId}". Create a fresh plan with migrationPlan first.`,
        );
      }

      const schema = contentStore.getCollection(collectionId, args.tenantId ?? tid ?? null);
      if (!schema) {
        throw new Error(`Collection not found: "${collectionId}"`);
      }

      if (!plan) {
        plan = await MigrationEngine.createPlan(schema as any);
      }

      const result = await MigrationEngine.applyMigration(plan, schema as any, {
        confirmed: args.confirmed,
        appliedBy: (ctx.user as any)?._id ?? ctx.user,
      });

      return {
        success: result.success,
        message: result.message,
      };
    },

    // ── Content Sync ──

    contentSyncPush: async (
      _: unknown,
      args: { channelId: string; confirmed?: boolean; tenantId?: string },
      ctx: GraphQLContext,
    ) => {
      if (!ctx.user?.isAdmin) throw new Error("Admin access required");
      const { contentSyncService } = await import("@src/services/core/content-sync-service");
      const result = await contentSyncService.pushContent(args.channelId, {
        adminConfirmation: args.confirmed,
        userId: (ctx.user as any)?._id ?? ctx.user,
      });
      return {
        success: result.success,
        channelId: result.channelId,
        direction: result.direction,
        jobId: result.jobId ?? null,
        message: result.message,
      };
    },

    contentSyncPull: async (
      _: unknown,
      args: { channelId: string; anonymize?: boolean; tenantId?: string },
      ctx: GraphQLContext,
    ) => {
      if (!ctx.user?.isAdmin) throw new Error("Admin access required");
      const { contentSyncService } = await import("@src/services/core/content-sync-service");
      const result = await contentSyncService.pullContent(args.channelId, {
        anonymize: args.anonymize,
        userId: (ctx.user as any)?._id ?? ctx.user,
      });
      return {
        success: result.success,
        channelId: result.channelId,
        direction: result.direction,
        jobId: result.jobId ?? null,
        message: result.message,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Combined Resolvers
// ---------------------------------------------------------------------------

export function dataOperationsResolvers(dbAdapter: IDBAdapter, tenantId?: string | null) {
  return {
    Query: dataOperationsQueryResolvers(dbAdapter, tenantId),
    Mutation: dataOperationsMutationResolvers(dbAdapter, tenantId),
  };
}
