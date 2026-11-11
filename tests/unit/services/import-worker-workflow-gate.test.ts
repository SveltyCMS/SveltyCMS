/**
 * @file tests/unit/services/import-worker-workflow-gate.test.ts
 * @description The background `import-data` worker must not be a way around the
 * publication gate — a job can be replayed, or the workflow can change between
 * dispatch and execution, so the worker re-checks every publish transition.
 *
 * Also pins the dispatch → worker payload contract: the content-package
 * dispatcher sends `{ planId, tenantId, userId, operations }` and the worker
 * applies those pre-resolved operations per collection (the payload shape
 * mismatch used to fail every background content-package import with
 * `PERMANENT_FAILURE: No data provided for import`).
 *
 * Features:
 * - non-admin job publishing into a gated collection is rejected, nothing written
 * - the gate runs before replace mode's deleteMany (no wiped collection)
 * - admin job publishes the same rows
 * - a collection whose workflow is known absent writes as before (no lookups)
 * - missing / unresolvable actor fails closed with a PERMANENT_FAILURE
 * - a real content-package dispatch payload round-trips through the worker
 * - update operations upsert the matched entry; skips are counted, not written
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@utils/error-handling";
import { nowISODateString } from "@utils/date";
import type { User } from "@src/databases/auth/types";
import type { DatabaseId, Job } from "@src/databases/db-interface";
import type {
  ContentPackage,
  ContentPackageManifest,
} from "@src/services/core/content-package-service";
import type { ImportJobPayload } from "@src/services/background/jobs/import-jobs";

/** Adapter, workflow and job-queue surface the worker touches, spied. */
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
  getCollection: vi.fn(),
}));

vi.mock("@src/databases/db", () => ({
  dbAdapter: {
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
}));

vi.mock("@src/services/background/workflow-service", () => ({
  workflowService: { assertPublishAllowed: mocks.assertPublishAllowed },
}));

vi.mock("@src/services/background/jobs/job-queue-service", () => ({
  jobQueue: { dispatch: mocks.dispatch },
}));

vi.mock("@stores/content-registry.svelte", () => ({
  contentStore: { getCollection: mocks.getCollection },
}));

// Manifest and file checksums are the same constant so validation passes without crypto.
vi.mock("@utils/security/checksum", () => ({
  createChecksum: vi.fn(async () => "test-checksum"),
}));

import { importDataHandler } from "@src/services/background/jobs/import-jobs";
import { contentPackageService } from "@src/services/core/content-package-service";
import {
  forgetWorkflowPresence,
  noteWorkflowPresence,
} from "@src/services/background/workflow-presence";

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

/** A minimal content package holding one entry, used for the dispatch contract. */
function makePackage(status: string): ContentPackage {
  const manifest: ContentPackageManifest = {
    schemaVersion: 1,
    operationType: "content-export",
    cmsVersion: "0.0.7",
    adapter: "sqlite",
    tenantId: TENANT,
    createdAt: nowISODateString(),
    createdBy: "u-admin",
    resources: { posts: 1 },
    checksums: { "manifest.json": "test-checksum" },
  };

  return {
    manifest,
    collections: { posts: JSON.stringify({ _id: "src-1", title: "Imported", status }) },
    relationMap: {},
    mediaMap: {},
    checksums: {},
  };
}

describe("background import worker publication gate", () => {
  beforeEach(() => {
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
    mocks.getCollection.mockReturnValue({ _id: "posts", name: "posts" });
    installGate();
  });

  it("rejects a non-admin job that publishes into a gated collection and writes nothing", async () => {
    const payload: ImportJobPayload = {
      collectionName: "posts",
      data: [{ _id: "e1", title: "Imported", status: "publish" }],
      duplicateStrategy: "overwrite",
      tenantId: TENANT,
      userId: "u-editor",
    };

    await expect(importDataHandler(payload, job)).rejects.toThrow(/PERMANENT_FAILURE/);

    expect(mocks.assertPublishAllowed).toHaveBeenCalledWith(
      "posts",
      TENANT,
      expect.objectContaining({ _id: "u-editor", role: "editor" }),
      "e1",
    );
    expect(mocks.insertMany).not.toHaveBeenCalled();
    expect(mocks.upsertMany).not.toHaveBeenCalled();
  });

  it("checks the gate before replace mode wipes the collection", async () => {
    const payload: ImportJobPayload = {
      collectionName: "posts",
      data: [{ title: "Imported", status: "published" }],
      mode: "replace",
      duplicateStrategy: "overwrite",
      tenantId: TENANT,
      userId: "u-editor",
    };

    await expect(importDataHandler(payload, job)).rejects.toThrow(/publication gate/i);

    // A refused import must not leave an emptied collection behind.
    expect(mocks.deleteMany).not.toHaveBeenCalled();
    expect(mocks.insertMany).not.toHaveBeenCalled();
  });

  it("lets an admin job publish the same rows", async () => {
    mocks.getUserById.mockResolvedValue({ success: true, data: ADMIN });

    const payload: ImportJobPayload = {
      collectionName: "posts",
      data: [{ _id: "e1", title: "Imported", status: "publish" }],
      duplicateStrategy: "overwrite",
      tenantId: TENANT,
      userId: "u-admin",
    };

    await importDataHandler(payload, job);

    expect(mocks.assertPublishAllowed).toHaveBeenCalledWith(
      "posts",
      TENANT,
      expect.objectContaining({ _id: "u-admin" }),
      "e1",
    );
    expect(mocks.upsertMany).toHaveBeenCalledTimes(1);
    expect(mocks.upsertMany.mock.calls[0]![0]).toBe("posts");
  });

  it("writes published rows for a collection whose workflow is known absent", async () => {
    noteWorkflowPresence("posts", TENANT, false);

    const payload: ImportJobPayload = {
      collectionName: "posts",
      data: [{ title: "Imported", status: "publish" }],
      tenantId: TENANT,
      userId: "u-editor",
    };

    await importDataHandler(payload, job);

    expect(mocks.assertPublishAllowed).not.toHaveBeenCalled();
    expect(mocks.getUserById).not.toHaveBeenCalled();
    expect(mocks.insertMany).toHaveBeenCalledTimes(1);
    expect(mocks.insertMany.mock.calls[0]![0]).toBe("posts");
  });

  it("fails closed when the job carries no actor", async () => {
    const payload: ImportJobPayload = {
      collectionName: "posts",
      data: [{ title: "Imported", status: "publish" }],
      tenantId: TENANT,
    };

    await expect(importDataHandler(payload, job)).rejects.toThrow(/no importing user/i);

    expect(mocks.getUserById).not.toHaveBeenCalled();
    expect(mocks.insertMany).not.toHaveBeenCalled();
  });

  it("fails closed when the actor cannot be resolved", async () => {
    mocks.getUserById.mockResolvedValue({ success: false, data: null });

    const payload: ImportJobPayload = {
      collectionName: "posts",
      data: [{ title: "Imported", status: "publish" }],
      tenantId: TENANT,
      userId: "u-ghost",
    };

    await expect(importDataHandler(payload, job)).rejects.toThrow(
      /could not be resolved.*PERMANENT_FAILURE|PERMANENT_FAILURE.*could not be resolved/,
    );

    expect(mocks.getUserById).toHaveBeenCalledWith("u-ghost", { tenantId: TENANT });
    expect(mocks.insertMany).not.toHaveBeenCalled();
  });

  it("round-trips the content-package dispatch payload through the worker", async () => {
    mocks.getUserById.mockResolvedValue({ success: true, data: ADMIN });

    const plan = await contentPackageService.planImport(makePackage("publish"), {
      tenantId: TENANT,
      userId: "u-admin",
    });
    const result = await contentPackageService.applyImport(plan.planId, {
      tenantId: TENANT,
      userId: "u-admin",
      background: true,
    });

    expect(result.success).toBe(true);

    // What `applyImport` actually handed to the queue is what the worker consumes.
    const [jobType, dispatched, dispatchTenant] = mocks.dispatch.mock.calls[0] as [
      string,
      ImportJobPayload,
      string,
    ];
    expect(jobType).toBe("import-data");
    expect(dispatchTenant).toBe(TENANT);
    expect(Object.keys(dispatched).sort()).toEqual(["operations", "planId", "tenantId", "userId"]);
    expect(dispatched.operations).toHaveLength(1);

    await importDataHandler(dispatched, job);

    expect(mocks.assertPublishAllowed).toHaveBeenCalledWith(
      "posts",
      TENANT,
      expect.objectContaining({ _id: "u-admin" }),
      undefined,
    );
    expect(mocks.insertMany).toHaveBeenCalledTimes(1);

    const [collectionName, rows] = mocks.insertMany.mock.calls[0] as [
      string,
      Array<Record<string, unknown>>,
    ];
    expect(collectionName).toBe("posts");
    // Creates insert without the package's source id, exactly like the sync lane.
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty("_id");
    expect(rows[0]).toMatchObject({ title: "Imported", status: "publish", tenantId: TENANT });

    // importedCount progression is reported for the content-package lane too.
    expect(mocks.updateJob).toHaveBeenCalledWith("job-1", {
      progress: 100,
      metadata: { imported: 1, skipped: 0, errors: 0, total: 1 },
    });
  });

  it("gates content-package operations before writing them", async () => {
    const payload: ImportJobPayload = {
      planId: "import_manual",
      tenantId: TENANT,
      userId: "u-editor",
      operations: [
        {
          collection: "posts",
          action: "create",
          entry: { title: "Imported", status: "publish" },
        },
      ],
    };

    await expect(importDataHandler(payload, job)).rejects.toThrow(/PERMANENT_FAILURE/);

    expect(mocks.insertMany).not.toHaveBeenCalled();
    expect(mocks.upsertMany).not.toHaveBeenCalled();
  });

  it("upserts update operations against the matched entry and counts skips", async () => {
    mocks.getUserById.mockResolvedValue({ success: true, data: ADMIN });

    const payload: ImportJobPayload = {
      planId: "import_updates",
      tenantId: TENANT,
      userId: "u-admin",
      operations: [
        {
          collection: "posts",
          action: "update",
          existingId: "existing-1",
          entry: { _id: "src-upd", title: "Updated", status: "draft" },
        },
        { collection: "posts", action: "skip", entry: {} },
      ],
    };

    await importDataHandler(payload, job);

    expect(mocks.upsertMany).toHaveBeenCalledTimes(1);
    const [, rows] = mocks.upsertMany.mock.calls[0] as [
      string,
      Array<{ query: { _id: string }; data: Record<string, unknown> }>,
    ];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.query._id).toBe("existing-1");
    expect(rows[0]!.data._id).toBe("existing-1");
    expect(rows[0]!.data.title).toBe("Updated");
    expect(mocks.insertMany).not.toHaveBeenCalled();

    expect(mocks.updateJob).toHaveBeenCalledWith("job-1", {
      progress: 100,
      metadata: { imported: 1, skipped: 1, errors: 0, total: 2 },
    });
  });
});
