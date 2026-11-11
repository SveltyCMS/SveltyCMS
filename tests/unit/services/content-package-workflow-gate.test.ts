/**
 * @file tests/unit/services/content-package-workflow-gate.test.ts
 * @description Import governance: a content package must not write entries into a
 * published state on a collection whose workflow gates publication.
 *
 * `applyImport` writes through raw adapter calls, so nothing in that loop consulted
 * the review workflow — imported entries could land published without approval.
 * These tests pin the gate (and the fast paths around it) on the real service
 * against a fake adapter and a fake workflow service. No harness, no network.
 *
 * Features:
 * - non-admin import of a published entry on a gated collection is rejected, no write
 * - admin import keeps working (gate override)
 * - a collection without a workflow is unaffected (insert still happens)
 * - update lane: the transition to published is gated with the existing entry id
 * - unresolvable / missing actor fails closed instead of skipping the gate
 * - a known-absent workflow skips the actor lookup and the workflow import
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@utils/error-handling";
import { nowISODateString } from "@utils/date";
import type { User } from "@src/databases/auth/types";
import type { DatabaseId } from "@src/databases/db-interface";
import type {
  ContentPackage,
  ContentPackageManifest,
} from "@src/services/core/content-package-service";
import { contentPackageService } from "@src/services/core/content-package-service";
import {
  forgetWorkflowPresence,
  noteWorkflowPresence,
} from "@src/services/background/workflow-presence";

/** Adapter + workflow surface the service touches, spied so writes stay observable. */
const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  update: vi.fn(),
  findMany: vi.fn(),
  getUserById: vi.fn(),
  assertPublishAllowed: vi.fn(),
  dispatch: vi.fn(),
  getCollection: vi.fn(),
}));

vi.mock("@src/databases/db", () => ({
  dbAdapter: {
    crud: { insert: mocks.insert, update: mocks.update, findMany: mocks.findMany },
    auth: { getUserById: mocks.getUserById },
  },
  getDb: () => null,
}));

vi.mock("@src/services/background/jobs/job-queue-service", () => ({
  jobQueue: { dispatch: mocks.dispatch },
}));

vi.mock("@src/services/background/workflow-service", () => ({
  workflowService: { assertPublishAllowed: mocks.assertPublishAllowed },
}));

vi.mock("@stores/content-registry.svelte", () => ({
  contentStore: { getCollection: mocks.getCollection },
}));

// Manifest and file checksums are the same constant so validation passes without crypto.
vi.mock("@utils/security/checksum", () => ({
  createChecksum: vi.fn(async () => "test-checksum"),
}));

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

/** plan → apply, the documented two-step import flow. */
async function applyPackage(
  pkg: ContentPackage,
  options: { userId?: string; duplicateStrategy?: "skip" | "update"; background?: boolean } = {},
) {
  const plan = await contentPackageService.planImport(pkg, {
    tenantId: TENANT,
    userId: options.userId,
    duplicateStrategy: options.duplicateStrategy,
  });
  return contentPackageService.applyImport(plan.planId, {
    tenantId: TENANT,
    userId: options.userId,
    background: options.background ?? false,
  });
}

describe("content package import publication gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    forgetWorkflowPresence();
    mocks.findMany.mockResolvedValue({ success: true, data: [] });
    mocks.insert.mockResolvedValue({ success: true, data: { _id: "created-1" } });
    mocks.update.mockResolvedValue({ success: true, data: { _id: "existing-1" } });
    mocks.getUserById.mockResolvedValue({ success: true, data: EDITOR });
    mocks.dispatch.mockResolvedValue("job-1");
    mocks.getCollection.mockReturnValue({ _id: "posts" });
    installGate();
  });

  it("rejects a non-admin import that lands an entry published on a gated collection", async () => {
    const result = await applyPackage(makePackage("publish"), { userId: "u-editor" });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/workflow/i);
    expect(mocks.assertPublishAllowed).toHaveBeenCalledWith(
      "posts",
      TENANT,
      expect.objectContaining({ _id: "u-editor", role: "editor" }),
      undefined,
    );
    // The gate runs before the write lane, so nothing was inserted.
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("lets an admin import the same published entry", async () => {
    mocks.getUserById.mockResolvedValue({ success: true, data: ADMIN });

    const result = await applyPackage(makePackage("publish"), { userId: "u-admin" });

    expect(result.success).toBe(true);
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.insert.mock.calls[0][0]).toBe("posts");
  });

  it("leaves a collection without a workflow unaffected", async () => {
    installGate(new Set());

    const result = await applyPackage(makePackage("publish"), { userId: "u-editor" });

    expect(result.success).toBe(true);
    expect(mocks.insert).toHaveBeenCalledTimes(1);
  });

  it("gates an update that transitions an existing entry to published", async () => {
    mocks.findMany.mockResolvedValue({
      success: true,
      data: [{ _id: "existing-1", slug: "hello" }],
    });

    const result = await applyPackage(makePackage("publish", { slug: "hello" }), {
      userId: "u-editor",
      duplicateStrategy: "update",
    });

    expect(result.success).toBe(false);
    expect(mocks.assertPublishAllowed).toHaveBeenCalledWith(
      "posts",
      TENANT,
      expect.objectContaining({ _id: "u-editor" }),
      "existing-1",
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("blocks the background lane before it dispatches the import job", async () => {
    const result = await applyPackage(makePackage("publish"), {
      userId: "u-editor",
      background: true,
    });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/workflow/i);
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it("does not gate a draft import", async () => {
    const result = await applyPackage(makePackage("draft"), { userId: "u-editor" });

    expect(result.success).toBe(true);
    expect(mocks.assertPublishAllowed).not.toHaveBeenCalled();
    expect(mocks.getUserById).not.toHaveBeenCalled();
    expect(mocks.insert).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the importing user cannot be resolved", async () => {
    mocks.getUserById.mockResolvedValue({ success: false, data: null });

    const result = await applyPackage(makePackage("publish"), { userId: "system" });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/could not be resolved/i);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("fails closed when the import carries no actor at all", async () => {
    const result = await applyPackage(makePackage("publish"));

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/no importing user/i);
    expect(mocks.getUserById).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("skips the gate and the actor lookup when the workflow is known absent", async () => {
    noteWorkflowPresence("posts", TENANT, false);

    const result = await applyPackage(makePackage("publish"), { userId: "u-editor" });

    expect(result.success).toBe(true);
    expect(mocks.assertPublishAllowed).not.toHaveBeenCalled();
    expect(mocks.getUserById).not.toHaveBeenCalled();
    expect(mocks.insert).toHaveBeenCalledTimes(1);
  });
});
