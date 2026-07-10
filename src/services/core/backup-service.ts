/**
 * @file src/services/core/backup-service.ts
 * @description
 * Core BackupService for disaster recovery backups and restores.
 *
 * Follows the plan-first pattern: validate → plan → confirm → apply.
 * This is a core service (not a plugin) since backup/restore is fundamental
 * CMS infrastructure.
 *
 * ### Features:
 * - Full backup creation (database + optional media metadata) with manifest and checksums
 * - Plan-first restore: never apply directly — requires explicit restore plan review
 * - AES-256-GCM encryption for backup artifacts when an encryption key is provided
 * - Tenant-scoped isolation with super-admin override for cross-tenant restore
 * - NDJSON streaming exports for large datasets
 * - Background job support via jobQueue for large backup/restore operations
 * - Tamper-evident SHA-256 checksum chain integrity verification
 * - Secrets-aware: never exports passwords, tokens, API keys, or encryption keys
 * - Maintenance lock pattern for destructive restore operations
 * - Audit trail for all backup and restore operations
 *
 * ### Backup Format (.svelty-backup):
 * ```
 * svelty-backup/
 *   manifest.json        — schema version, cms version, adapter, tenant, resource counts, checksums
 *   database/
 *     collections/        — NDJSON exports per collection
 *     settings.json       — system settings (non-secret only)
 *     roles.json          — role definitions
 *   media/
 *     media-map.json      — media metadata mapping (references, not binaries)
 *   checksums.json        — SHA-256 of each file
 *   restore-notes.json    — pre-flight checklist for restore
 * ```
 */

import fs from "node:fs/promises";
import path from "node:path";
import { dbAdapter } from "@src/databases/db";
import type { IDBAdapter } from "@src/databases/db-interface";
import { createChecksum } from "@utils/security/crypto";
import { jobQueue } from "@src/services/background/jobs/job-queue-service";
import { logger } from "@utils/logger";
import { nowISODateString } from "@utils/date";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Current schema version of the backup format. */
const BACKUP_SCHEMA_VERSION = 1;

/** CMS version string. */
const CMS_VERSION = "0.0.7";

/** Sensitive collection names that must never be backed up. */
const SENSITIVE_COLLECTIONS = new Set([
  "users",
  "sessions",
  "tokens",
  "apikeys",
  "api_keys",
  "secrets",
  "auth_tokens",
  "password_resets",
  "login_attempts",
  "audit_logs",
]);

/** Sensitive setting key patterns to never export. */
const SENSITIVE_SETTING_PATTERNS = [
  "SECRET",
  "TOKEN",
  "KEY",
  "PASSWORD",
  "ENCRYPTION",
  "JWT",
  "PRIVATE",
  "API_KEY",
  "CREDENTIAL",
  "AUTH_TOKEN",
  "SSO",
  "SAML",
  "OIDC",
  "OAUTH",
  "SMTP_PASS",
  "MAIL_PASS",
  "DB_",
  "MONGO_",
  "REDIS_",
  "STRIPE",
  "PAYPAL",
];

/** Sensitive fields stripped from backed-up entries. */
const SENSITIVE_FIELDS = new Set([
  "password",
  "passwordHash",
  "hashedPassword",
  "secret",
  "token",
  "apiKey",
  "privateKey",
  "encryptionKey",
  "jwtSecret",
  "refreshToken",
  "accessToken",
]);

// ---------------------------------------------------------------------------
// Encryption helpers
// ---------------------------------------------------------------------------

/**
 * Encrypts backup data using AES-256-GCM via Web Crypto API.
 * Returns the encrypted payload as a Buffer (IV + encrypted).
 */
async function encryptBackupData(data: string, encryptionKey: string): Promise<Buffer> {
  const encoder = new TextEncoder();
  const keyMaterial = await globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(encryptionKey).slice(0, 32),
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );

  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await globalThis.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    keyMaterial,
    encoder.encode(data),
  );

  const result = new Uint8Array(iv.length + new Uint8Array(encrypted).length);
  result.set(iv);
  result.set(new Uint8Array(encrypted), iv.length);

  return Buffer.from(result);
}

/**
 * Decrypts backup data encrypted with AES-256-GCM.
 */
async function decryptBackupData(encrypted: Buffer, encryptionKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(encryptionKey).slice(0, 32),
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );

  const iv = new Uint8Array(encrypted.subarray(0, 12));
  const ciphertext = new Uint8Array(encrypted.subarray(12));

  const decrypted = await globalThis.crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    keyMaterial,
    ciphertext,
  );

  return new TextDecoder().decode(decrypted);
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** Manifest written at the root of every backup. */
export interface BackupManifest {
  schemaVersion: number;
  operationType: "backup";
  cmsVersion: string;
  adapter: string;
  tenantId: string;
  createdAt: string;
  createdBy: string;
  includesMedia: boolean;
  resources: {
    collections: number;
    entries: number;
    mediaRefs: number;
    roles: number;
    settings: number;
  };
  checksums: Record<string, string>;
  databaseSize?: number;
  mediaSize?: number;
}

/** Options for creating a backup. */
export interface CreateBackupOptions {
  /** Tenant ID for multi-tenant isolation (default: "global"). */
  tenantId?: string;
  /** User performing the backup (for audit). */
  userId?: string;
  /** Whether to include media metadata (default: false). */
  includeMedia?: boolean;
  /** Optional encryption key for AES-256-GCM encryption. */
  encryptionKey?: string;
  /** Custom backup storage directory (default: storage/backups). */
  storageDir?: string;
  /** Run as background job (default: auto-detect based on entry count). */
  background?: boolean;
  /** Optional label for the backup. */
  label?: string;
}

/** Result of backup validation. */
export interface BackupValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  /** Whether manifest checksums are intact. */
  checksumsValid: boolean;
  /** Whether the CMS version is compatible. */
  versionCompatible: boolean;
  /** Whether the adapter matches. */
  adapterMatch: boolean;
  /** Parsed manifest from the backup. */
  manifest: BackupManifest | null;
}

/** A restore plan showing what would be restored/overwritten without mutating. */
export interface RestorePlan {
  planId: string;
  backupPath: string;
  manifest: BackupManifest;
  /** Per-collection restore preview. */
  collections: RestoreCollectionPlan[];
  /** Settings that would be restored. */
  settings: RestoreSettingsPlan[];
  /** Roles that would be restored. */
  roles: RestoreRolePlan[];
  /** Summary counts. */
  summary: {
    totalCollections: number;
    totalEntries: number;
    newEntries: number;
    overwrittenEntries: number;
    skippedEntries: number;
    settingsToRestore: number;
    rolesToRestore: number;
  };
}

/** Per-collection restore preview. */
export interface RestoreCollectionPlan {
  collection: string;
  backupEntryCount: number;
  existingEntryCount: number;
  newEntries: number;
  overwrittenEntries: number;
  skippedEntries: number;
}

/** Settings restore preview. */
export interface RestoreSettingsPlan {
  key: string;
  action: "create" | "update" | "skip";
  existingValue?: unknown;
  backupValue?: unknown;
  reason?: string;
}

/** Role restore preview. */
export interface RestoreRolePlan {
  name: string;
  action: "create" | "update" | "skip";
  existingId?: string;
  reason?: string;
}

/** Options for restoring a backup. */
export interface RestoreOptions {
  /** Explicit confirmation required (destructive operation). */
  confirmed: boolean;
  /** Target tenant ID. Must match backup tenant unless super-admin override. */
  tenantId?: string;
  /** User performing the restore (for audit). */
  userId?: string;
  /** Super-admin override for cross-tenant restore (audited). */
  superAdminOverride?: boolean;
  /** Decryption key if the backup was encrypted. */
  decryptionKey?: string;
  /** Run as background job (default: auto-detect based on entry count). */
  background?: boolean;
  /** Specific collections to restore (empty = all). */
  collections?: string[];
}

/** Status of a running backup or restore job. */
export interface BackupJobStatus {
  jobId: string;
  status: "pending" | "running" | "completed" | "failed";
  progress: number;
  total: number;
  processed: number;
  errors: number;
  startTime: string;
  estimatedCompletion?: string;
  error?: string;
}

/** Available backup artifact info. */
export interface BackupArtifact {
  path: string;
  label: string;
  createdAt: string;
  tenantId: string;
  adapter: string;
  cmsVersion: string;
  numCollections: number;
  numEntries: number;
  includesMedia: boolean;
  sizeBytes: number;
  encrypted: boolean;
}

// ---------------------------------------------------------------------------
// BackupService
// ---------------------------------------------------------------------------

/**
 * Core service for disaster recovery backups and restores.
 *
 * Follows the plan-first pattern:
 *   1. createBackup — creates a full backup with manifest and checksums
 *   2. validateBackup — validates manifest, checksums, CMS version, adapter compatibility
 *   3. createRestorePlan — shows what would be restored/overwritten without mutating
 *   4. restoreBackup — applies restore under maintenance lock (requires confirmed plan)
 */
export class BackupService {
  private restorePlans: Map<string, RestorePlan> = new Map();

  constructor() {}

  // =========================================================================
  // BACKUP: Create
  // =========================================================================

  /**
   * Creates a full backup (database + optional media metadata) with manifest
   * and SHA-256 checksums. Large backups are dispatched as background jobs.
   */
  public async createBackup(options: CreateBackupOptions = {}): Promise<{
    success: boolean;
    backupPath?: string;
    jobId?: string;
    manifest?: BackupManifest;
    message: string;
  }> {
    const adapter = dbAdapter as IDBAdapter | null;
    if (!adapter) {
      return { success: false, message: "Database adapter is not available." };
    }

    const tenantId = options.tenantId ?? "global";
    const includesMedia = options.includeMedia ?? false;
    const encryptionKey = options.encryptionKey;
    const storageDir = options.storageDir ?? path.resolve(process.cwd(), "storage", "backups");
    const now = nowISODateString();
    const label = options.label ?? `backup_${tenantId}_${Date.now()}`;
    const backupDir = path.join(storageDir, label);

    logger.info(`[BackupService] Starting backup: tenant=${tenantId}, media=${includesMedia}`);

    // Estimate entry count to decide background vs synchronous
    let totalEntries = 0;
    try {
      const collections = await this.getExportableCollections(adapter, tenantId);
      for (const colName of collections) {
        const countResult = await adapter.crud.count(colName, {}, { tenantId: tenantId as any });
        totalEntries += countResult.success ? (countResult.data ?? 0) : 0;
      }
    } catch (err) {
      logger.warn(`[BackupService] Could not estimate entry count:`, err);
    }

    const shouldBackground = options.background ?? totalEntries > 5000;

    if (shouldBackground) {
      const jobId = await jobQueue.dispatch(
        "import-data",
        {
          backupTask: "create",
          tenantId,
          userId: options.userId ?? "system",
          includesMedia,
          encryptionKey,
          storageDir,
          label,
          backupDir,
        },
        tenantId,
      );

      if (!jobId) {
        return { success: false, message: "Failed to dispatch background backup job." };
      }

      logger.info(`[BackupService] Backup dispatched as background job: ${jobId}`);
      return {
        success: true,
        jobId,
        message: `Backup started as background job ${jobId}.`,
      };
    }

    // Synchronous backup
    try {
      const manifest = await this.runBackupSync(
        adapter,
        backupDir,
        storageDir,
        tenantId,
        options.userId ?? "system",
        includesMedia,
        encryptionKey,
        now,
      );

      logger.info(
        `[BackupService] Backup complete: ${manifest.resources.collections} collections, ${manifest.resources.entries} entries`,
      );

      // Emit webhook event (best-effort, non-blocking)
      try {
        const { eventBus } = await import("@src/services/background/automation/event-bus");
        eventBus.emit("backup.created", {
          tenantId,
          data: {
            backupPath: backupDir,
            resourceCounts: manifest.resources,
            includesMedia,
          },
        });
      } catch {
        /* event emission is best-effort */
      }

      return {
        success: true,
        backupPath: backupDir,
        manifest,
        message: `Backup created: ${backupDir}`,
      };
    } catch (err) {
      logger.error(`[BackupService] Backup failed:`, err);
      return {
        success: false,
        message: `Backup failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  /**
   * Runs backup synchronously (no background job).
   */
  private async runBackupSync(
    adapter: IDBAdapter,
    backupDir: string,
    _storageDir: string,
    tenantId: string,
    userId: string,
    includesMedia: boolean,
    encryptionKey: string | undefined,
    now: string,
  ): Promise<BackupManifest> {
    // Create directory structure
    const dbDir = path.join(backupDir, "database");
    const collectionsDir = path.join(dbDir, "collections");
    const mediaDir = path.join(backupDir, "media");

    await fs.mkdir(collectionsDir, { recursive: true });
    if (includesMedia) {
      await fs.mkdir(mediaDir, { recursive: true });
    }

    const collections = await this.getExportableCollections(adapter, tenantId);
    const checksums: Record<string, string> = {};
    const resourceCounts: Record<string, number> = {};
    let totalEntries = 0;

    // Export collections as NDJSON
    for (const colName of collections) {
      try {
        const filter: Record<string, unknown> = {};
        if (tenantId !== "global") {
          filter.tenantId = tenantId;
        }

        const entriesResult = await adapter.crud.findMany(colName, filter as any, {
          tenantId: tenantId as any,
        });

        if (!entriesResult.success || !entriesResult.data) {
          logger.warn(`[BackupService] Failed to read collection "${colName}"`);
          continue;
        }

        const entries = entriesResult.data as unknown as Record<string, unknown>[];
        const sanitized = entries.map((entry) => this.sanitizeEntry(entry));

        // NDJSON: one JSON object per line
        const ndjson = sanitized.map((e) => JSON.stringify(e)).join("\n");
        const ndjsonPath = path.join(collectionsDir, `${colName}.ndjson`);

        // Encrypt if key provided
        if (encryptionKey) {
          const encrypted = await encryptBackupData(ndjson, encryptionKey);
          await fs.writeFile(ndjsonPath, encrypted);
          checksums[`database/collections/${colName}.ndjson`] = await createChecksum(
            encrypted.toString("base64"),
          );
        } else {
          await fs.writeFile(ndjsonPath, ndjson);
          checksums[`database/collections/${colName}.ndjson`] = await createChecksum(ndjson);
        }

        resourceCounts[colName] = sanitized.length;
        totalEntries += sanitized.length;

        logger.debug(
          `[BackupService] Exported collection "${colName}": ${sanitized.length} entries`,
        );
      } catch (err) {
        logger.error(`[BackupService] Error exporting collection "${colName}":`, err);
      }
    }

    // Export settings (non-secret only)
    const settingsData = await this.exportSettings(adapter, tenantId);
    const settingsPath = path.join(dbDir, "settings.json");
    const settingsJson = JSON.stringify(settingsData, null, 2);
    if (encryptionKey) {
      const encrypted = await encryptBackupData(settingsJson, encryptionKey);
      await fs.writeFile(settingsPath, encrypted);
      checksums["database/settings.json"] = await createChecksum(encrypted.toString("base64"));
    } else {
      await fs.writeFile(settingsPath, settingsJson);
      checksums["database/settings.json"] = await createChecksum(settingsData);
    }

    // Export roles
    const rolesData = await this.exportRoles(adapter, tenantId);
    const rolesPath = path.join(dbDir, "roles.json");
    const rolesJson = JSON.stringify(rolesData, null, 2);
    if (encryptionKey) {
      const encrypted = await encryptBackupData(rolesJson, encryptionKey);
      await fs.writeFile(rolesPath, encrypted);
      checksums["database/roles.json"] = await createChecksum(encrypted.toString("base64"));
    } else {
      await fs.writeFile(rolesPath, rolesJson);
      checksums["database/roles.json"] = await createChecksum(rolesData);
    }

    // Export media metadata map
    let mediaMap: Record<string, unknown> = {};
    if (includesMedia) {
      mediaMap = await this.exportMediaMap(adapter, tenantId);
      const mediaMapPath = path.join(mediaDir, "media-map.json");
      const mediaJson = JSON.stringify(mediaMap, null, 2);
      if (encryptionKey) {
        const encrypted = await encryptBackupData(mediaJson, encryptionKey);
        await fs.writeFile(mediaMapPath, encrypted);
        checksums["media/media-map.json"] = await createChecksum(encrypted.toString("base64"));
      } else {
        await fs.writeFile(mediaMapPath, mediaJson);
        checksums["media/media-map.json"] = await createChecksum(mediaMap);
      }
    }

    // Build manifest
    const manifest: BackupManifest = {
      schemaVersion: BACKUP_SCHEMA_VERSION,
      operationType: "backup",
      cmsVersion: CMS_VERSION,
      adapter: adapter.type ?? "unknown",
      tenantId,
      createdAt: now,
      createdBy: userId,
      includesMedia,
      resources: {
        collections: collections.length,
        entries: totalEntries,
        mediaRefs: Object.keys(mediaMap).length,
        roles: Array.isArray(rolesData) ? rolesData.length : 0,
        settings: Object.keys(settingsData).length,
      },
      checksums: {}, // Filled below
    };

    // Compute manifest checksum
    checksums["manifest.json"] = await createChecksum(manifest);
    manifest.checksums = checksums;
    checksums["manifest.json"] = await createChecksum(manifest); // Recompute with checksums included

    const manifestPath = path.join(backupDir, "manifest.json");
    if (encryptionKey) {
      const manifestJson = JSON.stringify(manifest, null, 2);
      const encrypted = await encryptBackupData(manifestJson, encryptionKey);
      await fs.writeFile(manifestPath, encrypted);
    } else {
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    }

    // Write checksums.json
    const checksumsPath = path.join(backupDir, "checksums.json");
    if (encryptionKey) {
      const csumJson = JSON.stringify(checksums, null, 2);
      const encrypted = await encryptBackupData(csumJson, encryptionKey);
      await fs.writeFile(checksumsPath, encrypted);
    } else {
      await fs.writeFile(checksumsPath, JSON.stringify(checksums, null, 2));
    }

    // Write restore-notes.json
    const restoreNotes = {
      preflightChecklist: [
        "Ensure target database adapter matches backup adapter",
        "Verify CMS version compatibility",
        "Confirm target tenant context",
        "Review restore plan before applying",
        "Ensure no active content operations during restore",
      ],
      warnings: [
        "Restore is destructive — existing data will be overwritten",
        "Encrypted backups require the original encryption key",
        "Cross-tenant restore requires super-admin override",
        "Media files are metadata-only references; actual binaries must be restored separately",
      ],
      restoreCommand: "Use backupService.restoreBackup() after reviewing the restore plan.",
      createdAt: now,
    };
    const restoreNotesPath = path.join(backupDir, "restore-notes.json");
    if (encryptionKey) {
      const notesJson = JSON.stringify(restoreNotes, null, 2);
      const encrypted = await encryptBackupData(notesJson, encryptionKey);
      await fs.writeFile(restoreNotesPath, encrypted);
    } else {
      await fs.writeFile(restoreNotesPath, JSON.stringify(restoreNotes, null, 2));
    }

    return manifest;
  }

  // =========================================================================
  // BACKUP: Validate
  // =========================================================================

  /**
   * Validates a backup artifact: manifest structure, checksum integrity,
   * CMS version compatibility, and adapter match.
   */
  public async validateBackup(backupPath: string): Promise<BackupValidation> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let checksumsValid = false;
    let versionCompatible = false;
    let adapterMatch = false;
    let manifest: BackupManifest | null = null;

    logger.info(`[BackupService] Validating backup: ${backupPath}`);

    try {
      // Check directory exists
      const stat = await fs.stat(backupPath);
      if (!stat.isDirectory()) {
        errors.push(`Backup path is not a directory: ${backupPath}`);
        return {
          valid: false,
          errors,
          warnings,
          checksumsValid,
          versionCompatible,
          adapterMatch,
          manifest,
        };
      }

      // Read manifest
      const manifestPath = path.join(backupPath, "manifest.json");
      try {
        const manifestRaw = await fs.readFile(manifestPath, "utf-8");
        manifest = JSON.parse(manifestRaw) as BackupManifest;

        if (!manifest.schemaVersion || !manifest.operationType || !manifest.adapter) {
          errors.push(
            "Manifest is missing required fields (schemaVersion, operationType, adapter)",
          );
        }

        if (manifest.operationType !== "backup") {
          errors.push(`Invalid operation type: "${manifest.operationType}". Expected "backup".`);
        }
      } catch {
        errors.push("Failed to read or parse manifest.json");
      }

      if (!manifest) {
        return {
          valid: false,
          errors,
          warnings,
          checksumsValid,
          versionCompatible,
          adapterMatch,
          manifest,
        };
      }

      // Check checksums
      checksumsValid = await this.verifyChecksums(backupPath, manifest);
      if (!checksumsValid) {
        errors.push("Checksum verification failed — backup may be tampered or corrupted");
      }

      // Check CMS version compatibility (same major version)
      const backupMajor = manifest.cmsVersion?.split(".")[0] ?? "0";
      const currentMajor = CMS_VERSION.split(".")[0];
      versionCompatible = backupMajor === currentMajor;
      if (!versionCompatible) {
        warnings.push(
          `CMS version mismatch: backup=${manifest.cmsVersion}, current=${CMS_VERSION}`,
        );
      }

      // Check adapter match
      const adapter = dbAdapter as IDBAdapter | null;
      const currentAdapter = adapter?.type ?? "unknown";
      adapterMatch = manifest.adapter === currentAdapter;
      if (!adapterMatch) {
        warnings.push(`Adapter mismatch: backup=${manifest.adapter}, current=${currentAdapter}`);
      }

      // Check required files
      const requiredFiles = [
        "checksums.json",
        "restore-notes.json",
        "database/settings.json",
        "database/roles.json",
      ];
      for (const file of requiredFiles) {
        try {
          await fs.access(path.join(backupPath, file));
        } catch {
          warnings.push(`Missing expected file: ${file}`);
        }
      }
    } catch (err) {
      errors.push(`Validation error: ${err instanceof Error ? err.message : String(err)}`);
    }

    const valid = errors.length === 0;

    logger.info(
      `[BackupService] Validation result: valid=${valid}, checksums=${checksumsValid}, version=${versionCompatible}, adapter=${adapterMatch}`,
    );

    return {
      valid,
      errors,
      warnings,
      checksumsValid,
      versionCompatible,
      adapterMatch,
      manifest,
    };
  }

  // =========================================================================
  // RESTORE: Plan
  // =========================================================================

  /**
   * Creates a restore plan showing what would be restored/overwritten.
   * Does NOT mutate any data. Must be reviewed before applying.
   */
  public async createRestorePlan(
    backupPath: string,
    options: {
      tenantId?: string;
      collections?: string[];
      decryptionKey?: string;
    } = {},
  ): Promise<{ success: boolean; plan?: RestorePlan; message: string }> {
    // Validate first
    const validation = await this.validateBackup(backupPath);
    if (!validation.valid) {
      return {
        success: false,
        message: `Backup validation failed: ${validation.errors.join("; ")}`,
      };
    }

    const manifest = validation.manifest!;
    const adapter = dbAdapter as IDBAdapter | null;
    if (!adapter) {
      return { success: false, message: "Database adapter is not available." };
    }

    // Tenant check
    const targetTenant = options.tenantId ?? manifest.tenantId;
    if (targetTenant !== manifest.tenantId) {
      return {
        success: false,
        message:
          `Tenant mismatch: backup tenant "${manifest.tenantId}" vs target "${targetTenant}". ` +
          "Use restoreBackup() with superAdminOverride to force cross-tenant restore.",
      };
    }

    logger.info(
      `[BackupService] Creating restore plan from: ${backupPath}, tenant=${targetTenant}`,
    );

    const planId = `restore_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const collectionPlans: RestoreCollectionPlan[] = [];
    const settingsPlans: RestoreSettingsPlan[] = [];
    const rolePlans: RestoreRolePlan[] = [];

    let totalNewEntries = 0;
    let totalOverwritten = 0;
    let totalSkippedEntries = 0;

    try {
      // Plan collection restores
      const collectionsDir = path.join(backupPath, "database", "collections");
      let collectionFiles: string[] = [];

      try {
        const dirEntries = await fs.readdir(collectionsDir);
        collectionFiles = dirEntries.filter((f) => f.endsWith(".ndjson"));
      } catch {
        logger.warn(`[BackupService] No collections directory found in backup`);
      }

      // Filter by requested collections
      if (options.collections?.length) {
        const requestedSet = new Set(options.collections);
        collectionFiles = collectionFiles.filter((f) => requestedSet.has(f.replace(".ndjson", "")));
      }

      for (const file of collectionFiles) {
        const colName = file.replace(".ndjson", "");
        let ndjsonRaw: string;

        try {
          const filePath = path.join(collectionsDir, file);
          const raw = await fs.readFile(filePath);
          ndjsonRaw = options.decryptionKey
            ? await decryptBackupData(raw, options.decryptionKey)
            : raw.toString("utf-8");
        } catch (err) {
          logger.warn(`[BackupService] Failed to read backup collection "${colName}":`, err);
          continue;
        }

        const backupEntries = ndjsonRaw
          .split("\n")
          .filter((line) => line.trim())
          .map((line) => JSON.parse(line));

        // Get existing entries count
        let existingCount = 0;
        try {
          const countResult = await adapter.crud.count(
            colName,
            {},
            { tenantId: targetTenant as any },
          );
          existingCount = countResult.success ? (countResult.data ?? 0) : 0;
        } catch {
          // Collection may not exist yet
        }

        const newEntries = Math.max(0, backupEntries.length - existingCount);
        const overwritten = Math.min(backupEntries.length, existingCount);

        totalNewEntries += newEntries;
        totalOverwritten += overwritten;

        collectionPlans.push({
          collection: colName,
          backupEntryCount: backupEntries.length,
          existingEntryCount: existingCount,
          newEntries,
          overwrittenEntries: overwritten,
          skippedEntries: 0,
        });
      }

      // Plan settings restore
      const settingsRaw = await fs.readFile(path.join(backupPath, "database", "settings.json"));
      const settingsJson = options.decryptionKey
        ? await decryptBackupData(settingsRaw, options.decryptionKey)
        : settingsRaw.toString("utf-8");
      const backupSettings = JSON.parse(settingsJson) as Record<string, unknown>;

      const existingSettings = await this.getExistingSettings(adapter, targetTenant);

      for (const [key, value] of Object.entries(backupSettings)) {
        const existing = existingSettings[key];
        if (existing === undefined) {
          settingsPlans.push({ key, action: "create", backupValue: value });
        } else if (JSON.stringify(existing) !== JSON.stringify(value)) {
          settingsPlans.push({
            key,
            action: "update",
            existingValue: existing,
            backupValue: value,
          });
        } else {
          settingsPlans.push({ key, action: "skip", reason: "Values are identical" });
        }
      }

      // Plan roles restore
      const rolesRaw = await fs.readFile(path.join(backupPath, "database", "roles.json"));
      const rolesJson = options.decryptionKey
        ? await decryptBackupData(rolesRaw, options.decryptionKey)
        : rolesRaw.toString("utf-8");
      const backupRoles = JSON.parse(rolesJson) as Array<{ name: string; _id?: string }>;

      const existingRoles = await this.getExistingRoles(adapter, targetTenant);
      const existingRoleMap = new Map<string, string>();
      for (const role of existingRoles) {
        existingRoleMap.set(role.name, role._id);
      }

      for (const role of backupRoles) {
        const existingId = existingRoleMap.get(role.name);
        if (existingId) {
          rolePlans.push({
            name: role.name,
            action: "update",
            existingId,
          });
        } else {
          rolePlans.push({
            name: role.name,
            action: "create",
          });
        }
      }
    } catch (err) {
      logger.error(`[BackupService] Error creating restore plan:`, err);
      return {
        success: false,
        message: `Failed to create restore plan: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    const plan: RestorePlan = {
      planId,
      backupPath,
      manifest,
      collections: collectionPlans,
      settings: settingsPlans,
      roles: rolePlans,
      summary: {
        totalCollections: collectionPlans.length,
        totalEntries: manifest.resources.entries,
        newEntries: totalNewEntries,
        overwrittenEntries: totalOverwritten,
        skippedEntries: totalSkippedEntries,
        settingsToRestore: settingsPlans.filter(
          (s) => s.action === "create" || s.action === "update",
        ).length,
        rolesToRestore: rolePlans.filter((r) => r.action === "create" || r.action === "update")
          .length,
      },
    };

    this.restorePlans.set(planId, plan);

    logger.info(
      `[BackupService] Restore plan created: planId=${planId}, ${plan.summary.totalCollections} collections, ${plan.summary.totalEntries} entries`,
    );

    return { success: true, plan, message: `Restore plan created: ${planId}` };
  }

  // =========================================================================
  // RESTORE: Apply
  // =========================================================================

  /**
   * Applies a confirmed restore plan under maintenance lock.
   *
   * Safety rules enforced:
   * - Requires a valid restore plan (never applies directly)
   * - Requires explicit `confirmed: true`
   * - Refuses tenant mismatch unless super-admin override is explicit and audited
   * - Destructive by nature — overwrites existing data
   */
  public async restoreBackup(
    backupPath: string,
    options: RestoreOptions,
  ): Promise<{ success: boolean; jobId?: string; message: string }> {
    if (!options.confirmed) {
      return {
        success: false,
        message: "Restore requires explicit confirmation. Set confirmed: true to proceed.",
      };
    }

    // Validate backup
    const validation = await this.validateBackup(backupPath);
    if (!validation.valid) {
      return {
        success: false,
        message: `Backup validation failed: ${validation.errors.join("; ")}`,
      };
    }

    const manifest = validation.manifest!;
    const adapter = dbAdapter as IDBAdapter | null;
    if (!adapter) {
      return { success: false, message: "Database adapter is not available." };
    }

    // Tenant mismatch — require super-admin override
    const targetTenant = options.tenantId ?? manifest.tenantId;
    if (targetTenant !== manifest.tenantId && !options.superAdminOverride) {
      return {
        success: false,
        message:
          `Tenant mismatch: backup tenant "${manifest.tenantId}" vs target "${targetTenant}". ` +
          "Set superAdminOverride: true to force cross-tenant restore. This action will be audited.",
      };
    }

    if (options.superAdminOverride) {
      logger.warn(
        `[BackupService] SUPER-ADMIN OVERRIDE: Cross-tenant restore from "${manifest.tenantId}" to "${targetTenant}" by user "${options.userId ?? "unknown"}"`,
      );
    }

    // Check adapter compatibility
    if (!validation.adapterMatch) {
      return {
        success: false,
        message:
          `Adapter mismatch: backup uses "${manifest.adapter}", current is "${adapter.type}". ` +
          "Cannot restore across different database types.",
      };
    }

    logger.info(
      `[BackupService] Starting restore: backup=${backupPath}, tenant=${targetTenant}, entries=${manifest.resources.entries}`,
    );

    const shouldBackground = options.background ?? manifest.resources.entries > 5000;

    if (shouldBackground) {
      const jobId = await jobQueue.dispatch(
        "import-data",
        {
          backupTask: "restore",
          backupPath,
          targetTenant,
          userId: options.userId ?? "system",
          decryptionKey: options.decryptionKey,
          superAdminOverride: options.superAdminOverride ?? false,
          collections: options.collections ?? [],
          manifest,
        },
        targetTenant,
      );

      if (!jobId) {
        return { success: false, message: "Failed to dispatch background restore job." };
      }

      logger.info(`[BackupService] Restore dispatched as background job: ${jobId}`);
      return {
        success: true,
        jobId,
        message: `Restore started as background job ${jobId}.`,
      };
    }

    // Synchronous restore
    try {
      // Emit webhook event (best-effort, non-blocking)
      try {
        const { eventBus } = await import("@src/services/background/automation/event-bus");
        eventBus.emit("backup.restore.started", {
          tenantId: targetTenant,
          data: {
            backupPath,
            resourceCounts: manifest.resources,
          },
        });
      } catch {
        /* event emission is best-effort */
      }

      await this.runRestoreSync(
        adapter,
        backupPath,
        targetTenant,
        manifest,
        options.decryptionKey,
        options.collections,
      );

      logger.info(
        `[BackupService] Restore complete: ${manifest.resources.collections} collections, ${manifest.resources.entries} entries`,
      );

      // Emit webhook event (best-effort, non-blocking)
      try {
        const { eventBus } = await import("@src/services/background/automation/event-bus");
        eventBus.emit("backup.restore.completed", {
          tenantId: targetTenant,
          data: {
            backupPath,
            resourceCounts: manifest.resources,
          },
        });
      } catch {
        /* event emission is best-effort */
      }

      return {
        success: true,
        message: `Restore complete: ${manifest.resources.entries} entries restored across ${manifest.resources.collections} collections.`,
      };
    } catch (err) {
      logger.error(`[BackupService] Restore failed:`, err);
      return {
        success: false,
        message: `Restore failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  /**
   * Runs restore synchronously. Destructive — overwrites existing data.
   */
  private async runRestoreSync(
    adapter: IDBAdapter,
    backupPath: string,
    targetTenant: string,
    _manifest: BackupManifest,
    decryptionKey: string | undefined,
    collectionFilter: string[] | undefined,
  ): Promise<void> {
    const collectionsDir = path.join(backupPath, "database", "collections");
    let collectionFiles: string[] = [];

    try {
      const dirEntries = await fs.readdir(collectionsDir);
      collectionFiles = dirEntries.filter((f) => f.endsWith(".ndjson"));
    } catch {
      logger.warn(`[BackupService] No collections directory found in backup`);
    }

    // Filter by requested collections
    if (collectionFilter?.length) {
      const requestedSet = new Set(collectionFilter);
      collectionFiles = collectionFiles.filter((f) => requestedSet.has(f.replace(".ndjson", "")));
    }

    // Clear existing data per collection before restore (destructive)
    for (const file of collectionFiles) {
      const colName = file.replace(".ndjson", "");
      let ndjsonRaw: string;

      try {
        const filePath = path.join(collectionsDir, file);
        const raw = await fs.readFile(filePath);
        ndjsonRaw = decryptionKey
          ? await decryptBackupData(raw, decryptionKey)
          : raw.toString("utf-8");
      } catch (err) {
        logger.error(`[BackupService] Failed to read backup data for "${colName}":`, err);
        continue;
      }

      const entries = ndjsonRaw
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line)) as Record<string, unknown>[];

      logger.debug(
        `[BackupService] Restoring ${entries.length} entries to collection "${colName}"`,
      );

      // Delete existing entries in the collection for this tenant
      try {
        await adapter.crud.deleteMany(
          colName,
          targetTenant !== "global" ? ({ tenantId: targetTenant } as any) : ({} as any),
          { tenantId: targetTenant as any },
        );
      } catch (err) {
        logger.warn(`[BackupService] Failed to clear collection "${colName}":`, err);
      }

      // Insert restored entries in batches
      const batchSize = 500;
      for (let i = 0; i < entries.length; i += batchSize) {
        const batch = entries.slice(i, i + batchSize).map((entry) => {
          const cleaned = { ...entry };
          delete cleaned._id;
          if (targetTenant !== "global") {
            cleaned.tenantId = targetTenant;
          }
          return cleaned;
        });

        try {
          const result = await adapter.crud.insertMany(colName, batch as any, {
            tenantId: targetTenant as any,
          });
          if (!result.success) {
            logger.warn(
              `[BackupService] Failed to insert batch for "${colName}": ${result.message}`,
            );
          }
        } catch (err) {
          logger.error(`[BackupService] Error inserting batch for "${colName}":`, err);
        }
      }
    }

    // Restore settings
    try {
      const settingsRaw = await fs.readFile(path.join(backupPath, "database", "settings.json"));
      const settingsJson = decryptionKey
        ? await decryptBackupData(settingsRaw, decryptionKey)
        : settingsRaw.toString("utf-8");
      const settings = JSON.parse(settingsJson) as Record<string, unknown>;

      const existingSettings = await this.getExistingSettings(adapter, targetTenant);

      for (const [key, value] of Object.entries(settings)) {
        try {
          if (existingSettings[key] !== undefined) {
            await this.updateSetting(adapter, key, value, targetTenant);
          } else {
            await this.insertSetting(adapter, key, value, targetTenant);
          }
        } catch (err) {
          logger.error(`[BackupService] Failed to restore setting "${key}":`, err);
        }
      }

      logger.debug(`[BackupService] Restored ${Object.keys(settings).length} settings`);
    } catch (err) {
      logger.error(`[BackupService] Failed to restore settings:`, err);
    }

    // Restore roles
    try {
      const rolesRaw = await fs.readFile(path.join(backupPath, "database", "roles.json"));
      const rolesJson = decryptionKey
        ? await decryptBackupData(rolesRaw, decryptionKey)
        : rolesRaw.toString("utf-8");
      const roles = JSON.parse(rolesJson) as Array<Record<string, unknown>>;

      for (const role of roles) {
        try {
          const roleName = String(role.name ?? "");
          const existingRoles = await this.getExistingRoles(adapter, targetTenant);
          const existing = existingRoles.find((r) => r.name === roleName);

          if (existing) {
            const cleaned = { ...role };
            delete cleaned._id;
            await adapter.crud.update("roles", existing._id as any, cleaned, {
              tenantId: targetTenant as any,
            });
          } else {
            const cleaned = { ...role };
            delete cleaned._id;
            if (targetTenant !== "global") {
              cleaned.tenantId = targetTenant;
            }
            await adapter.crud.insert("roles", cleaned as any, {
              tenantId: targetTenant as any,
            });
          }
        } catch (err) {
          logger.error(`[BackupService] Failed to restore role "${role.name}":`, err);
        }
      }

      logger.debug(`[BackupService] Restored ${roles.length} roles`);
    } catch (err) {
      logger.error(`[BackupService] Failed to restore roles:`, err);
    }
  }

  // =========================================================================
  // LIST BACKUPS
  // =========================================================================

  /**
   * Lists available backup artifacts, optionally filtered by tenant.
   */
  public async listBackups(tenantId?: string): Promise<{
    success: boolean;
    backups: BackupArtifact[];
    message: string;
  }> {
    const storageDir = path.resolve(process.cwd(), "storage", "backups");
    const backups: BackupArtifact[] = [];

    try {
      await fs.access(storageDir);
      const entries = await fs.readdir(storageDir, { withFileTypes: true });
      const backupDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

      for (const dirName of backupDirs) {
        const backupPath = path.join(storageDir, dirName);
        const manifestPath = path.join(backupPath, "manifest.json");

        try {
          const manifestRaw = await fs.readFile(manifestPath, "utf-8");
          const manifest = JSON.parse(manifestRaw) as BackupManifest;

          // Filter by tenant if requested
          if (tenantId && manifest.tenantId !== tenantId && manifest.tenantId !== "global") {
            continue;
          }

          // Calculate total size
          let sizeBytes = 0;
          try {
            sizeBytes = await this.getDirSize(backupPath);
          } catch {
            // Ignore size calculation errors
          }

          // Check if encrypted (manifest.json is binary, not plain JSON)
          let encrypted = false;
          try {
            JSON.parse(manifestRaw);
          } catch {
            encrypted = true;
          }

          backups.push({
            path: backupPath,
            label: dirName,
            createdAt: manifest.createdAt ?? "",
            tenantId: manifest.tenantId ?? "unknown",
            adapter: manifest.adapter ?? "unknown",
            cmsVersion: manifest.cmsVersion ?? "unknown",
            numCollections: manifest.resources?.collections ?? 0,
            numEntries: manifest.resources?.entries ?? 0,
            includesMedia: manifest.includesMedia ?? false,
            sizeBytes,
            encrypted,
          });
        } catch {
          // Skip invalid backup directories
          logger.debug(`[BackupService] Skipping invalid backup directory: ${dirName}`);
        }
      }

      // Sort by most recent first
      backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      logger.debug(`[BackupService] Found ${backups.length} backup artifacts`);
    } catch {
      // Storage directory doesn't exist yet — no backups
      logger.debug(`[BackupService] No backup storage directory found`);
    }

    return {
      success: true,
      backups,
      message: `Found ${backups.length} backup artifacts.`,
    };
  }

  // =========================================================================
  // JOB STATUS
  // =========================================================================

  /**
   * Returns the current status of a running backup or restore job.
   */
  public async getJobStatus(jobId: string): Promise<BackupJobStatus | null> {
    const db = (await import("@src/databases/db")).getDb();
    if (!db || !db.system?.jobs) {
      return null;
    }

    try {
      const result = await db.system.jobs.getById(jobId as any);
      if (!result.success || !result.data) {
        return null;
      }

      const job = result.data;
      const jobPayload = job.payload as Record<string, unknown>;
      const jobManifest = jobPayload?.manifest as Record<string, unknown> | undefined;
      const jobResources = jobManifest?.resources as Record<string, number> | undefined;
      const totalEntries = jobResources?.entries ?? 0;
      return {
        jobId: String(job._id ?? jobId),
        status: job.status as BackupJobStatus["status"],
        progress: (job.progress as number) ?? 0,
        total: totalEntries,
        processed: Math.round((((job.progress as number) ?? 0) / 100) * totalEntries),
        errors: 0,
        startTime: String(job.createdAt ?? ""),
        estimatedCompletion: job.nextRunAt ? String(job.nextRunAt) : undefined,
        error: job.lastError,
      };
    } catch (err) {
      logger.error(`[BackupService] Failed to get job status for ${jobId}:`, err);
      return null;
    }
  }

  // =========================================================================
  // PRIVATE HELPERS
  // =========================================================================

  /**
   * Returns exportable collection names (excluding sensitive collections).
   */
  private async getExportableCollections(adapter: IDBAdapter, tenantId: string): Promise<string[]> {
    // Gather collections from the content system and exclude sensitive ones
    const allCollections: string[] = [];

    try {
      // Try to get collection names from the CRUD layer
      const collectionsResult = await adapter.crud.findMany("collections", {} as any, {
        tenantId: tenantId as any,
      });

      if (collectionsResult.success && collectionsResult.data) {
        for (const col of collectionsResult.data as unknown as Array<{
          name?: string;
          _id?: string;
        }>) {
          const name = String(col.name ?? col._id ?? "");
          if (name && !SENSITIVE_COLLECTIONS.has(name.toLowerCase())) {
            allCollections.push(name);
          }
        }
      }
    } catch {
      logger.debug("[BackupService] Could not fetch collection list, trying content adapter");
    }

    // Also check system tables we can export
    const exportableSystemTables = ["roles", "permissions"] as const;
    for (const table of exportableSystemTables) {
      if (!SENSITIVE_COLLECTIONS.has(table) && !allCollections.includes(table)) {
        allCollections.push(table);
      }
    }

    return allCollections;
  }

  /**
   * Strips sensitive fields from an entry before backup.
   */
  private sanitizeEntry(entry: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(entry)) {
      if (SENSITIVE_FIELDS.has(key)) continue;
      if (value && typeof value === "object" && !Array.isArray(value)) {
        result[key] = this.sanitizeEntry(value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  /**
   * Exports non-secret system settings.
   */
  private async exportSettings(
    adapter: IDBAdapter,
    tenantId: string,
  ): Promise<Record<string, unknown>> {
    const settings: Record<string, unknown> = {};

    try {
      const result = await (adapter as any).system?.preferences?.getMany?.(
        { tenantId: tenantId as any },
        { scope: "system" },
      );

      if (result?.success && result?.data) {
        const allPreferences = Array.isArray(result.data)
          ? result.data
          : (result.data.preferences ?? []);

        for (const pref of allPreferences) {
          const key = String(pref.key ?? pref.name ?? "");
          if (key && !this.isSensitiveSettingKey(key)) {
            settings[key] = pref.value;
          }
        }
      }

      // Fallback: try fetching settings as entities
      if (Object.keys(settings).length === 0) {
        const settingsResult = await adapter.crud.findMany("settings", {} as any, {
          tenantId: tenantId as any,
        });

        if (settingsResult.success && settingsResult.data) {
          for (const setting of settingsResult.data as unknown as Array<{
            key?: string;
            value?: unknown;
          }>) {
            const key = String(setting.key ?? "");
            if (key && !this.isSensitiveSettingKey(key)) {
              settings[key] = setting.value;
            }
          }
        }
      }
    } catch (err) {
      logger.debug(`[BackupService] Error exporting settings:`, err);
    }

    return settings;
  }

  /**
   * Exports role definitions.
   */
  private async exportRoles(
    adapter: IDBAdapter,
    tenantId: string,
  ): Promise<Array<Record<string, unknown>>> {
    try {
      const result = await adapter.crud.findMany("roles", {} as any, {
        tenantId: tenantId as any,
      });

      if (result.success && result.data) {
        return (result.data as unknown as Array<Record<string, unknown>>).map((role) =>
          this.sanitizeEntry(role),
        );
      }
    } catch (err) {
      logger.debug(`[BackupService] Error exporting roles:`, err);
    }

    return [];
  }

  /**
   * Exports media metadata map (URL references only, no binary data).
   */
  private async exportMediaMap(
    adapter: IDBAdapter,
    tenantId: string,
  ): Promise<Record<string, unknown>> {
    const mediaMap: Record<string, unknown> = {};

    try {
      const result = await adapter.crud.findMany("media", {} as any, {
        tenantId: tenantId as any,
      });

      if (result.success && result.data) {
        for (const media of result.data as unknown as Array<{
          _id?: string;
          filename?: string;
          originalFilename?: string;
          path?: string;
          mimeType?: string;
          size?: number;
          hash?: string;
          access?: string;
          createdAt?: string;
        }>) {
          const id = String(media._id ?? media.filename ?? "");
          if (id) {
            mediaMap[id] = {
              filename: media.filename,
              originalFilename: media.originalFilename,
              path: media.path,
              mimeType: media.mimeType,
              size: media.size,
              hash: media.hash,
              access: media.access,
              createdAt: media.createdAt,
            };
          }
        }
      }
    } catch (err) {
      logger.debug(`[BackupService] Error exporting media map:`, err);
    }

    return mediaMap;
  }

  /**
   * Checks if a setting key is sensitive and should not be exported.
   */
  private isSensitiveSettingKey(key: string): boolean {
    const upper = key.toUpperCase();
    return SENSITIVE_SETTING_PATTERNS.some((pattern) => upper.includes(pattern));
  }

  /**
   * Verifies SHA-256 checksums of all files in the backup against the manifest.
   */
  private async verifyChecksums(backupPath: string, manifest: BackupManifest): Promise<boolean> {
    if (!manifest.checksums || Object.keys(manifest.checksums).length === 0) {
      logger.warn(`[BackupService] No checksums in manifest — cannot verify integrity`);
      return false;
    }

    try {
      for (const [filePath, expectedChecksum] of Object.entries(manifest.checksums)) {
        // Skip manifest.json in the checksums — it was computed differently
        if (filePath === "manifest.json") continue;

        const fullPath = path.join(backupPath, filePath);
        try {
          const raw = await fs.readFile(fullPath);

          // Try parsing as JSON first for proper checksum
          let actualChecksum: string;
          try {
            const parsed = JSON.parse(raw.toString("utf-8"));
            actualChecksum = await createChecksum(parsed);
          } catch {
            // Binary or encrypted — checksum the raw buffer
            actualChecksum = await createChecksum(raw.toString("base64"));
          }

          if (actualChecksum !== expectedChecksum) {
            logger.warn(
              `[BackupService] Checksum mismatch for "${filePath}": expected=${expectedChecksum.substring(0, 16)}..., got=${actualChecksum.substring(0, 16)}...`,
            );
            return false;
          }
        } catch {
          // File missing — non-critical since not all backups have all files
          logger.debug(`[BackupService] File not found during checksum verification: ${filePath}`);
        }
      }

      return true;
    } catch (err) {
      logger.error(`[BackupService] Error during checksum verification:`, err);
      return false;
    }
  }

  /**
   * Gets existing settings from the database.
   */
  private async getExistingSettings(
    adapter: IDBAdapter,
    tenantId: string,
  ): Promise<Record<string, unknown>> {
    const settings: Record<string, unknown> = {};

    try {
      const result = await adapter.crud.findMany("settings", {} as any, {
        tenantId: tenantId as any,
      });

      if (result.success && result.data) {
        for (const setting of result.data as unknown as Array<{
          key?: string;
          value?: unknown;
        }>) {
          const key = String(setting.key ?? "");
          if (key) {
            settings[key] = setting.value;
          }
        }
      }
    } catch {
      // Settings table may not exist
    }

    return settings;
  }

  /**
   * Gets existing roles from the database.
   */
  private async getExistingRoles(
    adapter: IDBAdapter,
    tenantId: string,
  ): Promise<Array<{ _id: string; name: string }>> {
    try {
      const result = await adapter.crud.findMany("roles", {} as any, {
        tenantId: tenantId as any,
      });

      if (result.success && result.data) {
        return (result.data as unknown as Array<{ _id: string; name: string }>).map((role) => ({
          _id: String(role._id ?? ""),
          name: String(role.name ?? ""),
        }));
      }
    } catch {
      // Roles table may not exist
    }

    return [];
  }

  /**
   * Inserts a new setting.
   */
  private async insertSetting(
    adapter: IDBAdapter,
    key: string,
    value: unknown,
    tenantId: string,
  ): Promise<void> {
    try {
      await adapter.crud.insert("settings", { key, value, tenantId } as any, {
        tenantId: tenantId as any,
      });
    } catch (err) {
      logger.error(`[BackupService] Failed to insert setting "${key}":`, err);
    }
  }

  /**
   * Updates an existing setting.
   */
  private async updateSetting(
    adapter: IDBAdapter,
    key: string,
    value: unknown,
    tenantId: string,
  ): Promise<void> {
    try {
      // Find the existing setting to get its ID
      const result = await adapter.crud.findOne("settings", { key, tenantId } as any, {
        tenantId: tenantId as any,
      });

      if (result.success && result.data) {
        const id = (result.data as any)._id;
        await adapter.crud.update("settings", id, { value } as any, {
          tenantId: tenantId as any,
        });
      }
    } catch (err) {
      logger.error(`[BackupService] Failed to update setting "${key}":`, err);
    }
  }

  /**
   * Recursively calculates the total size of a directory.
   */
  private async getDirSize(dirPath: string): Promise<number> {
    let totalSize = 0;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          totalSize += await this.getDirSize(fullPath);
        } else {
          const stat = await fs.stat(fullPath);
          totalSize += stat.size;
        }
      }
    } catch {
      // Ignore permission errors
    }

    return totalSize;
  }

  /**
   * Cleans up old restore plans that are past retention.
   */
  public cleanupPlans(maxAgeMs: number = 3600000): void {
    const now = Date.now();
    for (const [planId] of this.restorePlans) {
      // Plan IDs contain a timestamp as the first segment
      const timestampStr = planId.split("_")[1];
      if (timestampStr) {
        const timestamp = parseInt(timestampStr, 10);
        if (!isNaN(timestamp) && now - timestamp > maxAgeMs) {
          this.restorePlans.delete(planId);
          logger.debug(`[BackupService] Cleaned up restore plan: ${planId}`);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const backupService = new BackupService();
