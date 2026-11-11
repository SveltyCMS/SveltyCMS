/**
 * @file tests/unit/services/import-actor-resolution.test.ts
 * @description Actor resolution for the two internal import callers that used to
 * reach `applyImport` with no usable identity.
 *
 * `applyImport` now gates publish transitions through the review workflow and
 * fails closed when it cannot resolve the importing user. A channel sync and the
 * SDK `planImport` namespace therefore have to present a real caller — never the
 * job-queue `"system"` sentinel, and never a synthesised admin. These tests pin
 * those decisions on the real services with a fake adapter / workflow service.
 *
 * Features:
 * - a channel sync passes the operator recorded in the job payload to plan + apply
 * - a sync with no operator identity fails closed with an actionable message
 * - an un-gated sync keeps working without an actor (historical behaviour)
 * - `planImport` forwards the SDK caller id instead of the `"system"` sentinel
 * - `planImport` omits the actor when no identity exists
 * - a gated import still fails closed for a non-admin (end-to-end through the namespace)
 * - an un-gated collection imports exactly as before
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@utils/error-handling";
import { nowISODateString } from "@utils/date";
import type { User } from "@src/databases/auth/types";
import type { DatabaseId, IDBAdapter } from "@src/databases/db-interface";
import type {
  ContentPackage,
  ContentPackageManifest,
  ImportPlan,
} from "@src/services/core/content-package-service";
import { contentPackageService } from "@src/services/core/content-package-service";
import { ContentSyncService } from "@src/services/core/content-sync-service";
import { ContentTransferNamespace } from "@src/services/sdk/namespaces/data-operations";
import { forgetWorkflowPresence } from "@src/services/background/workflow-presence";

/** Adapter + service surface the sync and import paths touch, spied for observation. */
const mocks = vi.hoisted(() => ({
  findOne: vi.fn(),
  findMany: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  getUserById: vi.fn(),
  assertPublishAllowed: vi.fn(),
  registerHandler: vi.fn(),
  dispatch: vi.fn(),
  emit: vi.fn(),
  getCollection: vi.fn(),
}));

vi.mock("@src/databases/db", () => ({
  dbAdapter: {
    crud: {
      findOne: mocks.findOne,
      findMany: mocks.findMany,
      insert: mocks.insert,
      update: mocks.update,
    },
    auth: { getUserById: mocks.getUserById },
  },
  getDb: () => null,
}));

vi.mock("@src/services/background/jobs/job-queue-service", () => ({
  jobQueue: { registerHandler: mocks.registerHandler, dispatch: mocks.dispatch },
}));

vi.mock("@src/services/background/workflow-service", () => ({
  workflowService: { assertPublishAllowed: mocks.assertPublishAllowed },
}));

vi.mock("@stores/content-registry.svelte", () => ({
  contentStore: { getCollection: mocks.getCollection },
}));

vi.mock("@src/services/background/automation/event-bus", () => ({
  eventBus: { emit: mocks.emit },
}));

// Manifest and file checksums are the same constant so validation passes without crypto.
vi.mock("@utils/security/checksum", () => ({
  createChecksum: vi.fn(async () => "test-checksum"),
}));

const TENANT = "tenant-1" as unknown as DatabaseId;
const NAMESPACE = new ContentTransferNamespace({} as IDBAdapter);

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

const CHANNEL = {
  channelId: "sync_testchannel",
  label: "Production → Staging",
  source: { tenantId: "tenant-src", label: "Production" },
  target: { tenantId: TENANT, label: "Staging" },
  collections: ["posts"],
  direction: "push" as const,
  enabled: true,
  anonymizeOnPull: false,
  conflictStrategy: "skip" as const,
  createdAt: nowISODateString(),
  updatedAt: nowISODateString(),
};

const GATE_MISSING_ACTOR =
  "Import blocked: This import would publish content in a workflow-gated collection, but no importing user was provided";

/**
 * Mirrors the real contract of `WorkflowService.assertPublishAllowed`: a no-op for
 * admins and for collections without a publication-gated workflow.
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

function makePackage(
  status: string,
  options: { collection?: string; slug?: string } = {},
): ContentPackage {
  const collection = options.collection ?? "posts";
  const entry: Record<string, unknown> = { _id: "src-1", title: "Imported", status };
  if (options.slug) entry.slug = options.slug;

  const manifest: ContentPackageManifest = {
    schemaVersion: 1,
    operationType: "content-export",
    cmsVersion: "0.0.7",
    adapter: "sqlite",
    tenantId: TENANT,
    createdAt: nowISODateString(),
    createdBy: "u-admin",
    resources: { [collection]: 1 },
    checksums: { "manifest.json": "test-checksum" },
  };

  return {
    manifest,
    collections: { [collection]: JSON.stringify(entry) },
    relationMap: {},
    mediaMap: {},
    checksums: {},
  };
}

/** The namespace params are a plain record; keep the fixture typed at the service edge. */
function asRecord(pkg: ContentPackage): Record<string, unknown> {
  return pkg as unknown as Record<string, unknown>;
}

function makePlan(userId?: string): ImportPlan {
  return {
    planId: "plan-1",
    operations: [],
    summary: { total: 0, create: 0, update: 0, skip: 0, conflict: 0 },
    duplicateStrategy: "skip",
    background: false,
    tenantId: TENANT,
    userId,
  };
}

/**
 * Runs the handler the sync service registered with the (mocked) job queue —
 * the same entry point a dispatched `content-sync` job goes through.
 */
async function runSyncJob(payload: Record<string, unknown>): Promise<void> {
  mocks.registerHandler.mockClear();
  new ContentSyncService();
  const registration = mocks.registerHandler.mock.calls.find((call) => call[0] === "content-sync");
  if (!registration) throw new Error("ContentSyncService did not register its job handler");
  const handler = registration[1] as (jobPayload: Record<string, unknown>) => Promise<void>;
  await handler(payload);
}

function syncPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    channelId: CHANNEL.channelId,
    direction: "push",
    anonymized: false,
    collections: ["posts"],
    duplicateStrategy: "skip",
    ...overrides,
  };
}

describe("import actor resolution", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    forgetWorkflowPresence();
    mocks.findOne.mockResolvedValue({ success: true, data: CHANNEL });
    mocks.findMany.mockResolvedValue({ success: true, data: [] });
    mocks.insert.mockResolvedValue({ success: true, data: { _id: "created-1" } });
    mocks.update.mockResolvedValue({ success: true, data: { _id: CHANNEL.channelId } });
    mocks.getUserById.mockResolvedValue({ success: true, data: EDITOR });
    mocks.dispatch.mockResolvedValue("job-1");
    mocks.getCollection.mockReturnValue({ _id: "posts" });
    installGate();
  });

  describe("content sync", () => {
    it("runs as the operator recorded in the sync job payload", async () => {
      vi.spyOn(contentPackageService, "runExport").mockResolvedValue(makePackage("publish"));
      const planImportSpy = vi
        .spyOn(contentPackageService, "planImport")
        .mockResolvedValue(makePlan("u-owner"));
      const applyImportSpy = vi
        .spyOn(contentPackageService, "applyImport")
        .mockResolvedValue({ success: true, message: "Import complete: 1 imported." });

      await runSyncJob(syncPayload({ userId: "u-owner" }));

      expect(planImportSpy).toHaveBeenCalledWith(
        expect.objectContaining({ manifest: expect.any(Object) }),
        expect.objectContaining({ tenantId: TENANT, userId: "u-owner" }),
      );
      expect(applyImportSpy).toHaveBeenCalledWith(
        "plan-1",
        expect.objectContaining({ tenantId: TENANT, userId: "u-owner" }),
      );
      expect(mocks.insert).not.toHaveBeenCalled();
    });

    it("fails closed with an actionable message when the job has no operator identity", async () => {
      vi.spyOn(contentPackageService, "runExport").mockResolvedValue(makePackage("publish"));
      const planImportSpy = vi
        .spyOn(contentPackageService, "planImport")
        .mockResolvedValue(makePlan());
      const applyImportSpy = vi
        .spyOn(contentPackageService, "applyImport")
        .mockImplementation(async (_planId, options) =>
          options?.userId
            ? { success: true, message: "Import complete: 1 imported." }
            : { success: false, message: GATE_MISSING_ACTOR },
        );

      await expect(runSyncJob(syncPayload({ userId: "system" }))).rejects.toThrow(
        /Channel "Production → Staging".*authenticated admin session/s,
      );

      // No admin was synthesised: the gate still receives no actor at all.
      expect(planImportSpy.mock.calls[0][1]).not.toHaveProperty("userId");
      expect(applyImportSpy.mock.calls[0][1]).not.toHaveProperty("userId");
      expect(mocks.insert).not.toHaveBeenCalled();
    });

    it("leaves an un-gated sync working without an operator identity", async () => {
      vi.spyOn(contentPackageService, "runExport").mockResolvedValue(makePackage("draft"));
      vi.spyOn(contentPackageService, "planImport").mockResolvedValue(makePlan());
      const applyImportSpy = vi
        .spyOn(contentPackageService, "applyImport")
        .mockResolvedValue({ success: true, message: "Import complete: 1 imported." });

      await expect(runSyncJob(syncPayload({ userId: "system" }))).resolves.toBeUndefined();

      expect(applyImportSpy).toHaveBeenCalledTimes(1);
      expect(applyImportSpy.mock.calls[0][1]).not.toHaveProperty("userId");
      // lastSyncAt is still recorded — the historical success path is untouched.
      expect(mocks.update).toHaveBeenCalledWith(
        "content_sync_channels",
        CHANNEL.channelId,
        expect.objectContaining({ lastSyncAt: expect.any(String) }),
      );
    });
  });

  describe("SDK planImport", () => {
    it("passes the SDK caller identity instead of the system sentinel", async () => {
      const plan = await NAMESPACE.planImport(
        asRecord(makePackage("draft")),
        {},
        {
          tenantId: TENANT,
          user: EDITOR,
        },
      );

      expect(plan.userId).toBe("u-editor");
    });

    it("prefers an explicit user id over the SDK identity", async () => {
      const plan = await NAMESPACE.planImport(
        asRecord(makePackage("draft")),
        { userId: "u-explicit" },
        { tenantId: TENANT, user: EDITOR },
      );

      expect(plan.userId).toBe("u-explicit");
    });

    it("omits the actor — never the system sentinel — when no identity exists", async () => {
      const plan = await NAMESPACE.planImport(
        asRecord(makePackage("draft")),
        {},
        {
          tenantId: TENANT,
        },
      );

      expect(plan.userId).toBeUndefined();
    });

    it("still fails a gated import closed for a non-admin", async () => {
      const plan = await NAMESPACE.planImport(
        asRecord(makePackage("publish")),
        {},
        {
          tenantId: TENANT,
          user: EDITOR,
        },
      );
      expect(plan.userId).toBe("u-editor");

      // No userId on the apply either: the gate must resolve the actor from the
      // plan, proving the identity was threaded through planImport.
      const result = await NAMESPACE.applyImport(plan.planId, { tenantId: TENANT });

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/workflow/i);
      expect(mocks.assertPublishAllowed).toHaveBeenCalledWith(
        "posts",
        TENANT,
        expect.objectContaining({ _id: "u-editor" }),
        undefined,
      );
      expect(mocks.insert).not.toHaveBeenCalled();
    });

    it("lets an admin apply the same gated import", async () => {
      mocks.getUserById.mockResolvedValue({ success: true, data: ADMIN });

      const plan = await NAMESPACE.planImport(
        asRecord(makePackage("publish")),
        {},
        {
          tenantId: TENANT,
          user: ADMIN,
        },
      );
      const result = await NAMESPACE.applyImport(plan.planId, { tenantId: TENANT });

      expect(result.success).toBe(true);
      expect(mocks.insert).toHaveBeenCalledTimes(1);
    });

    it("leaves an un-gated collection importing exactly as before", async () => {
      installGate(new Set());

      const plan = await NAMESPACE.planImport(
        asRecord(makePackage("publish")),
        {},
        {
          tenantId: TENANT,
          user: EDITOR,
        },
      );
      const result = await NAMESPACE.applyImport(plan.planId, { tenantId: TENANT });

      expect(result.success).toBe(true);
      expect(mocks.insert).toHaveBeenCalledTimes(1);
    });
  });
});
