/**
 * @file tests/unit/services/import-lane-gaps.test.ts
 * @description The import lane has three ways to lose its publication gate or
 * its plan semantics. This suite pins all three:
 *
 * 1. `ImporterNamespace.importData` queues its job with the caller identity —
 *    without it the worker's gate fails closed on every publishing import.
 * 2. The backup restore reaches a worker branch that understands its payload
 *    (it used to be queued as `backupTask` on the import worker, which expects
 *    `collectionName` + `data` or `operations` and rejected it as "No data"),
 *    and a restore that publishes is gated with the same actor check.
 * 3. A plan built with `duplicateStrategy: "fail"` marks duplicates `conflict`;
 *    the worker must abort those permanently instead of counting them as skips,
 *    while a `skip` operation still skips.
 *
 * Features:
 * - namespace dispatch carries the caller id, and the worker gates with it
 * - a publishing restore without an actor fails closed with a clear message
 * - the dispatched restore payload round-trips through the worker into the
 *   backup service's own restore (no re-queue)
 * - a queued background backup runs in-process instead of re-queueing itself
 * - a "fail"-strategy conflict fails the job permanently and names the conflict
 * - "skip" operations are still skipped and still accounted for
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@utils/error-handling";
import { nowISODateString } from "@utils/date";
import type { User } from "@src/databases/auth/types";
import type { DatabaseId, IDBAdapter, Job } from "@src/databases/db-interface";
import type { BackupManifest, BackupValidation } from "@src/services/core/backup-service";
import type {
  BackupRestoreJobPayload,
  ImportJobPayload,
} from "@src/services/background/jobs/import-jobs";

/** Adapter, workflow and job-queue surface the lane touches, spied. */
const mocks = vi.hoisted(() => ({
  findByIds: vi.fn(),
  insertMany: vi.fn(),
  upsertMany: vi.fn(),
  deleteMany: vi.fn(),
  findMany: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  getUserById: vi.fn(),
  assertPublishAllowed: vi.fn(),
  updateJob: vi.fn(),
  dispatch: vi.fn(),
}));

vi.mock("@src/databases/db", () => ({
  dbAdapter: {
    type: "sqlite",
    crud: {
      findByIds: mocks.findByIds,
      insertMany: mocks.insertMany,
      upsertMany: mocks.upsertMany,
      deleteMany: mocks.deleteMany,
      findMany: mocks.findMany,
      insert: mocks.insert,
      update: mocks.update,
    },
    auth: { getUserById: mocks.getUserById },
  },
  getDb: () => ({ system: { jobs: { update: mocks.updateJob } } }),
  // Imported by the namespace layer; never called by these tests.
  reinitializeSystem: vi.fn(async () => ({ status: "ok" })),
}));

vi.mock("@src/services/background/workflow-service", () => ({
  workflowService: { assertPublishAllowed: mocks.assertPublishAllowed },
}));

vi.mock("@src/services/background/jobs/job-queue-service", () => ({
  jobQueue: { dispatch: mocks.dispatch },
}));

import { importDataHandler } from "@src/services/background/jobs/import-jobs";
import { ImporterNamespace } from "@src/services/sdk/namespaces/misc-namespaces";
import { backupService } from "@src/services/core/backup-service";
import { forgetWorkflowPresence } from "@src/services/background/workflow-presence";

const TENANT = "tenant-1";

const EDITOR: User = {
  _id: "u-editor" as unknown as DatabaseId,
  role: "editor",
  isAdmin: false,
  email: "editor@test.dev",
  permissions: [],
  createdAt: nowISODateString(),
  updatedAt: nowISODateString(),
};

const ADMIN: User = {
  _id: "u-admin" as unknown as DatabaseId,
  role: "admin",
  isAdmin: true,
  email: "admin@test.dev",
  permissions: [],
  createdAt: nowISODateString(),
  updatedAt: nowISODateString(),
};

const job = { _id: "job-1", taskType: "import-data" } as unknown as Job;

/**
 * Mirrors the real contract of `WorkflowService.assertPublishAllowed`: a no-op
 * for admins and for collections without a publication-gated workflow.
 */
function installGate(gated: ReadonlySet<string> = new Set(["posts"])): void {
  mocks.assertPublishAllowed.mockImplementation(
    async (collectionId: string, _tenantId: string | undefined, user: User) => {
      if (!gated.has(collectionId)) return;
      if (user.isAdmin === true || user.role === "admin") return;
      throw new AppError(
        "Content in this collection must pass its review workflow before it can be published",
        403,
        "WORKFLOW_PUBLISH_GATE",
      );
    },
  );
}

/** Manifest of a one-entry archive, as `restoreBackup` reads it back. */
function makeManifest(): BackupManifest {
  return {
    schemaVersion: 1,
    operationType: "backup",
    cmsVersion: "0.0.7",
    adapter: "sqlite",
    tenantId: TENANT,
    createdAt: nowISODateString(),
    createdBy: "u-admin",
    includesMedia: false,
    resources: { collections: 1, entries: 1, mediaRefs: 0, roles: 0, settings: 0 },
    checksums: { "manifest.json": "test-checksum" },
  };
}

/** A validated archive: `validateBackup` is the only part that needs the disk. */
function makeValidation(): BackupValidation {
  return {
    valid: true,
    errors: [],
    warnings: [],
    checksumsValid: true,
    versionCompatible: true,
    adapterMatch: true,
    manifest: makeManifest(),
  };
}

/** The namespace stores the adapter; the synchronous lane reads `crud` + `auth`. */
function makeAdapter(): IDBAdapter {
  return {
    type: "sqlite",
    crud: {
      findByIds: mocks.findByIds,
      insertMany: mocks.insertMany,
      upsertMany: mocks.upsertMany,
      deleteMany: mocks.deleteMany,
      findMany: mocks.findMany,
      insert: mocks.insert,
      update: mocks.update,
    },
    auth: { getUserById: mocks.getUserById },
  } as unknown as IDBAdapter;
}

describe("import lane gaps", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    forgetWorkflowPresence();
    mocks.findByIds.mockResolvedValue({ success: true, data: [] });
    mocks.insertMany.mockResolvedValue({ success: true, data: [] });
    mocks.upsertMany.mockResolvedValue({ success: true, data: [] });
    mocks.deleteMany.mockResolvedValue({ success: true, data: { deletedCount: 0 } });
    mocks.findMany.mockResolvedValue({ success: true, data: [] });
    mocks.insert.mockResolvedValue({ success: true, data: { _id: "created-1" } });
    mocks.update.mockResolvedValue({ success: true, data: { _id: "existing-1" } });
    mocks.getUserById.mockResolvedValue({ success: true, data: EDITOR });
    mocks.updateJob.mockResolvedValue(undefined);
    mocks.dispatch.mockResolvedValue("job-1");
    installGate();
  });

  it("queues the caller identity and the worker gates a publishing import with it", async () => {
    const importer = new ImporterNamespace(makeAdapter());
    const rows = Array.from({ length: 51 }, (_, i) => ({
      title: `Entry ${i}`,
      status: "publish",
    }));

    const queued = await importer.importData(
      { collectionName: "posts", data: rows },
      { tenantId: TENANT as DatabaseId, user: { _id: "u-editor" } },
    );

    expect(queued.status).toBe("pending");
    const [taskType, payload] = mocks.dispatch.mock.calls[0] as [string, ImportJobPayload];
    expect(taskType).toBe("import-data");
    expect(payload.userId).toBe("u-editor");
    expect(payload).toMatchObject({ collectionName: "posts", tenantId: TENANT });

    await expect(importDataHandler(payload, job)).rejects.toThrow(/PERMANENT_FAILURE/);

    // The gate ran as the caller the namespace queued, not as nobody.
    expect(mocks.assertPublishAllowed).toHaveBeenCalledWith(
      "posts",
      TENANT,
      expect.objectContaining({ _id: "u-editor", role: "editor" }),
      undefined,
    );
    expect(mocks.getUserById).toHaveBeenCalledWith("u-editor", { tenantId: TENANT });
    expect(mocks.insertMany).not.toHaveBeenCalled();
  });

  it("dispatches a restore shape the worker applies instead of rejecting", async () => {
    const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), "svelty-import-lane-"));
    try {
      mocks.getUserById.mockResolvedValue({ success: true, data: ADMIN });
      // Only archive validation needs the filesystem; the write path is spied.
      vi.spyOn(backupService, "validateBackup").mockResolvedValue(makeValidation());

      const accepted = await backupService.restoreBackup("bk-1", {
        confirmed: true,
        tenantId: TENANT,
        userId: "u-admin",
        storageDir,
        background: true,
      });
      expect(accepted.success).toBe(true);

      const [taskType, dispatched, dispatchTenant] = mocks.dispatch.mock.calls[0] as [
        string,
        BackupRestoreJobPayload,
        string,
      ];
      expect(taskType).toBe("import-data");
      expect(dispatchTenant).toBe(TENANT);
      expect(dispatched).toMatchObject({
        backupTask: "restore",
        targetTenant: TENANT,
        userId: "u-admin",
        collections: [],
      });

      // What the dispatcher queued is what the worker consumes: the archive is
      // re-read for the gate, then the backup service applies its own restore.
      vi.spyOn(backupService, "readBackupCollections").mockResolvedValue([
        { collection: "posts", entries: [{ title: "Imported", status: "publish" }] },
      ]);
      const restore = vi
        .spyOn(backupService, "restoreBackup")
        .mockResolvedValue({ success: true, message: "Restore complete" });

      await importDataHandler(dispatched, job);

      expect(mocks.assertPublishAllowed).toHaveBeenCalledWith(
        "posts",
        TENANT,
        expect.objectContaining({ _id: "u-admin" }),
        undefined,
      );
      expect(restore).toHaveBeenCalledWith(
        dispatched.backupPath,
        expect.objectContaining({
          confirmed: true,
          tenantId: TENANT,
          userId: "u-admin",
          background: false,
        }),
      );
      expect(mocks.updateJob).toHaveBeenCalledWith("job-1", { progress: 100 });
    } finally {
      await fs.rm(storageDir, { recursive: true, force: true });
    }
  });

  it("runs a queued background backup in-process instead of re-queueing", async () => {
    const create = vi.spyOn(backupService, "createBackup").mockResolvedValue({
      success: true,
      backupPath: "bk-1",
      message: "Backup created",
    });

    await importDataHandler(
      {
        backupTask: "create",
        tenantId: TENANT,
        userId: "u-admin",
        includesMedia: false,
        storageDir: "/tmp/backups",
        label: "bk-1",
      },
      job,
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT, label: "bk-1", background: false }),
    );
    expect(mocks.dispatch).not.toHaveBeenCalled();
    expect(mocks.updateJob).toHaveBeenCalledWith("job-1", { progress: 100 });
  });

  it("fails a publishing restore closed when the job carries no actor", async () => {
    vi.spyOn(backupService, "readBackupCollections").mockResolvedValue([
      { collection: "posts", entries: [{ title: "Imported", status: "publish" }] },
    ]);
    const restore = vi.spyOn(backupService, "restoreBackup");

    const payload: BackupRestoreJobPayload = {
      backupTask: "restore",
      backupPath: "bk-1",
      targetTenant: TENANT,
      superAdminOverride: false,
      collections: [],
    };

    await expect(importDataHandler(payload, job)).rejects.toThrow(/no importing user/i);

    expect(mocks.getUserById).not.toHaveBeenCalled();
    expect(restore).not.toHaveBeenCalled();
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });

  it("gates the synchronous import lane instead of writing a small publishing batch", async () => {
    const importer = new ImporterNamespace(makeAdapter());

    // ≤50 rows and no `async` means the request writes immediately — but it is
    // still a publish transition and must pass the same review gate.
    await expect(
      importer.importData(
        {
          collectionName: "posts",
          data: [
            { title: "Small 1", status: "publish" },
            { title: "Small 2", status: "publish" },
          ],
        },
        { tenantId: TENANT as DatabaseId, user: { _id: "u-editor" } },
      ),
    ).rejects.toThrow(/PERMANENT_FAILURE/);

    expect(mocks.assertPublishAllowed).toHaveBeenCalledWith(
      "posts",
      TENANT,
      expect.objectContaining({ _id: "u-editor", role: "editor" }),
      undefined,
    );
    // The gate runs before the write, so a rejected import inserts nothing.
    expect(mocks.insertMany).not.toHaveBeenCalled();
    expect(mocks.upsertMany).not.toHaveBeenCalled();
  });

  it("lets an admin publish through the synchronous lane", async () => {
    mocks.getUserById.mockResolvedValue({ success: true, data: ADMIN });
    const importer = new ImporterNamespace(makeAdapter());

    const result = await importer.importData(
      { collectionName: "posts", data: [{ title: "Small", status: "publish" }] },
      { tenantId: TENANT as DatabaseId, user: { _id: "u-admin" } },
    );

    expect(result).toMatchObject({ status: "completed", imported: 1 });
    expect(mocks.assertPublishAllowed).toHaveBeenCalledWith(
      "posts",
      TENANT,
      expect.objectContaining({ _id: "u-admin", role: "admin" }),
      undefined,
    );
    expect(mocks.insertMany).toHaveBeenCalledTimes(1);
  });

  it('aborts permanently on a "fail"-strategy conflict and names it', async () => {
    const payload: ImportJobPayload = {
      planId: "import_conflict",
      tenantId: TENANT,
      userId: "u-admin",
      operations: [
        { collection: "posts", action: "create", entry: { title: "Fresh", status: "draft" } },
        {
          collection: "posts",
          action: "conflict",
          existingId: "existing-1",
          reason: "Duplicate detected via syncId: entry already exists.",
          entry: { title: "Duplicate", status: "draft" },
        },
      ],
    };

    await expect(importDataHandler(payload, job)).rejects.toThrow(
      /PERMANENT_FAILURE: Import halted due to conflict in "posts": Duplicate detected via syncId/,
    );

    expect(mocks.insertMany).not.toHaveBeenCalled();
    expect(mocks.upsertMany).not.toHaveBeenCalled();
    expect(mocks.updateJob).not.toHaveBeenCalled();
  });

  it("still skips plan skips and accounts for them", async () => {
    const payload: ImportJobPayload = {
      planId: "import_skip",
      tenantId: TENANT,
      userId: "u-admin",
      operations: [
        { collection: "posts", action: "create", entry: { title: "Fresh", status: "draft" } },
        { collection: "posts", action: "skip", entry: { title: "Duplicate", status: "draft" } },
      ],
    };

    await importDataHandler(payload, job);

    expect(mocks.insertMany).toHaveBeenCalledTimes(1);
    expect(mocks.updateJob).toHaveBeenCalledWith("job-1", {
      progress: 100,
      metadata: { imported: 1, skipped: 1, errors: 0, total: 2 },
    });
  });
});
