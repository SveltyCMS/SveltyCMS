/**
 * @file tests/unit/plugins/unified-data-hub/cross-source-alpha.test.ts
 * @description v3.1 cross-source alpha gating tests.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  annotateDecompositionForAlpha,
  assertDecompositionExecutable,
  buildDecompositionPlan,
} from "@plugins/unified-data-hub/server/federated-decomposition";
import { isCrossSourceAlphaEnabled } from "@plugins/unified-data-hub/server/cross-source-alpha";
import { FederationError } from "@plugins/unified-data-hub/types";

vi.mock("@src/utils/license-manager", () => ({
  checkExtensionLicense: vi.fn(async () => ({
    active: true,
    hasLicense: true,
    daysRemaining: 30,
  })),
}));

vi.mock("@src/plugins/registry", () => ({
  pluginRegistry: {
    get: () => ({
      metadata: { id: "unified-data-hub", enabled: true },
      config: { private: { enableCrossSourceAlpha: true } },
    }),
    getPluginState: async () => ({ enabled: true, settings: {} }),
  },
}));

describe("cross-source alpha v3.1", () => {
  const priorEnv = process.env.FEDERATION_CROSS_SOURCE_ALPHA;

  beforeEach(() => {
    delete process.env.FEDERATION_CROSS_SOURCE_ALPHA;
  });

  afterEach(() => {
    if (priorEnv === undefined) delete process.env.FEDERATION_CROSS_SOURCE_ALPHA;
    else process.env.FEDERATION_CROSS_SOURCE_ALPHA = priorEnv;
  });

  it("isCrossSourceAlphaEnabled respects private config + license", async () => {
    expect(await isCrossSourceAlphaEnabled("default")).toBe(true);
  });

  it("assertDecompositionExecutable allows cross-source when alpha flag set", () => {
    const plan = buildDecompositionPlan({
      primary: {
        _id: "a",
        slug: "articles",
        connectorId: "c1",
        source: { table: "articles", schema: "public" },
        fields: [],
        enabled: true,
      } as any,
      primaryConnector: {
        _id: "c1",
        type: "postgres",
        capabilities: {
          joinable: "same-source-only",
          filterPushdown: true,
          sortPushdown: true,
          maxPageSize: 100,
          supportsTransactions: false,
          staleness: "real-time",
          writable: true,
        },
      } as any,
      options: { tenantId: "default" },
      joinTargets: [
        {
          relation: {
            name: "author",
            targetSlug: "authors",
            localField: "authorId",
            foreignField: "id",
          },
          collection: {
            _id: "b",
            slug: "authors",
            connectorId: "c2",
            source: { endpoint: "/authors", platform: "wordpress" },
            fields: [],
            enabled: true,
          } as any,
          connector: {
            _id: "c2",
            type: "rest",
            capabilities: {
              joinable: false,
              filterPushdown: false,
              sortPushdown: false,
              maxPageSize: 100,
              supportsTransactions: false,
              staleness: "cache",
              writable: false,
            },
          } as any,
        },
      ],
    });
    expect(plan.crossSource).toBe(true);
    expect(() => assertDecompositionExecutable(plan)).toThrow(FederationError);
    expect(() => assertDecompositionExecutable(plan, { crossSourceAlpha: true })).not.toThrow();
  });

  it("annotateDecompositionForAlpha clears blockedReason and sets hash-join", () => {
    const plan = {
      version: "3.0-stable" as const,
      crossSource: true,
      subExpressions: [],
      mergeStrategy: "passthrough" as const,
      cursorModel: "per-source" as const,
      blockedReason: "blocked",
    };
    const annotated = annotateDecompositionForAlpha(plan, true);
    expect(annotated.mergeStrategy).toBe("hash-join");
    expect(annotated.blockedReason).toBeUndefined();
  });
});
