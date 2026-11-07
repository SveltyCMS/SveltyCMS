/**
 * @file tests/unit/scripts/module-boundary.test.ts
 * @description Pins the single definition of "server-only" and "client entry".
 *
 * The linkmap, and any future probe, must classify modules identically. A
 * second copy of these rules drifts silently and changes which modules count as
 * client→server leaks — the exact bug the gate exists to catch.
 */

import { describe, expect, it } from "vitest";
import {
  isClientEntrypoint,
  isServerOnlyPath,
  SERVER_STUB_PATHS,
} from "../../../scripts/lint/lib/module-boundary";
import {
  isClientEntrypoint as linkmapIsClientEntrypoint,
  isServerOnlyPath as linkmapIsServerOnlyPath,
} from "../../../scripts/check/analyze-linkmap";

describe("module boundary classification", () => {
  it("is the same function the linkmap re-exports", () => {
    expect(linkmapIsServerOnlyPath).toBe(isServerOnlyPath);
    expect(linkmapIsClientEntrypoint).toBe(isClientEntrypoint);
  });

  it("classifies SvelteKit and server-tree paths as server-only", () => {
    const serverOnly = [
      "src/hooks.server.ts",
      "src/hooks.ws.ts",
      "src/utils/foo.server.ts",
      "src/routes/api/[...path]/+server.ts",
      "src/routes/login/+page.server.ts",
      "src/routes/user/user.remote.ts",
      "src/databases/core/sql-adapter-core.ts",
      "src/databases/sqlite/adapter.ts",
      "src/hooks/handle-authentication.ts",
      "src/plugins/commerce/server/vies.ts",
      ...SERVER_STUB_PATHS,
    ];

    for (const relPath of serverOnly) {
      expect(isServerOnlyPath(relPath), relPath).toBe(true);
    }
  });

  it("does not classify shared utilities or components as server-only", () => {
    const shared = [
      "src/utils/date.ts",
      "src/services/ai-client/index.ts",
      "src/services/sdk/index.ts",
      "src/components/ui/button.svelte",
      "src/types/index.ts",
    ];

    for (const relPath of shared) {
      expect(isServerOnlyPath(relPath), relPath).toBe(false);
    }
  });

  it("distinguishes client entrypoints from server route modules", () => {
    const clientEntries = [
      "src/hooks.client.ts",
      "src/routes/(app)/dashboard/+page.svelte",
      "src/routes/(app)/+layout.ts",
      "src/routes/login/+page.ts",
    ];
    const notClientEntries = [
      "src/routes/(app)/dashboard/+page.server.ts",
      "src/routes/api/[...path]/+server.ts",
      "src/utils/date.ts",
    ];

    for (const relPath of clientEntries) {
      expect(isClientEntrypoint(relPath), relPath).toBe(true);
    }
    for (const relPath of notClientEntries) {
      expect(isClientEntrypoint(relPath), relPath).toBe(false);
    }
  });
});
