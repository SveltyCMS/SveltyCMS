/**
 * @file tests/unit/scripts/config-cli.test.ts
 * @description Unit tests for the SveltyCMS Configuration Promotion CLI (scripts/config-cli.ts).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseConfigCLIArgs, runConfigCLI } from "../../../scripts/config-cli";
import { configService } from "@src/services/core/config-service";

vi.mock("@src/services/core/config-service", () => ({
  configService: {
    performExport: vi.fn(),
    getStatus: vi.fn(),
    performImport: vi.fn(),
  },
}));

vi.mock("@src/databases/db", () => ({
  getDbInitPromise: vi.fn().mockResolvedValue(null),
}));

describe("Config CLI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("parseConfigCLIArgs", () => {
    it("parses export command", () => {
      const args = parseConfigCLIArgs(["export"]);
      expect(args.command).toBe("export");
      expect(args.mode).toBe("merge");
    });

    it("parses status command with json flag", () => {
      const args = parseConfigCLIArgs(["status", "--json", "--tenant=tenant_1"]);
      expect(args.command).toBe("status");
      expect(args.json).toBe(true);
      expect(args.tenantId).toBe("tenant_1");
    });

    it("parses diff command", () => {
      const args = parseConfigCLIArgs(["diff"]);
      expect(args.command).toBe("diff");
    });

    it("parses plan command with mode", () => {
      const args = parseConfigCLIArgs(["plan", "--mode=mirror"]);
      expect(args.command).toBe("plan");
      expect(args.mode).toBe("mirror");
    });

    it("parses import command with yes flag and uuids filter", () => {
      const args = parseConfigCLIArgs(["import", "--mode=add", "--yes", "--uuids=u1,u2"]);
      expect(args.command).toBe("import");
      expect(args.mode).toBe("add");
      expect(args.yes).toBe(true);
      expect(args.uuids).toEqual(["u1", "u2"]);
    });

    it("defaults unknown command to help", () => {
      const args = parseConfigCLIArgs(["unknown"]);
      expect(args.command).toBe("help");
    });
  });

  describe("runConfigCLI", () => {
    it("handles export successfully", async () => {
      vi.mocked(configService.performExport).mockResolvedValueOnce({
        dirPath: "config/sync/export_global_123",
      });

      const exitCode = await runConfigCLI({
        command: "export",
        json: true,
      });

      expect(exitCode).toBe(0);
      expect(configService.performExport).toHaveBeenCalledWith({
        tenantId: undefined,
        uuids: undefined,
      });
    });

    it("handles status when in sync", async () => {
      vi.mocked(configService.getStatus).mockResolvedValueOnce({
        status: "in_sync",
        changes: { new: [], updated: [], deleted: [] },
        unmetRequirements: [],
      });

      const exitCode = await runConfigCLI({
        command: "status",
        json: true,
      });

      expect(exitCode).toBe(0);
    });

    it("handles status when changes detected", async () => {
      vi.mocked(configService.getStatus).mockResolvedValueOnce({
        status: "changes_detected",
        changes: {
          new: [{ name: "posts", uuid: "u1", type: "collection", entity: {}, hash: "h1" }],
          updated: [],
          deleted: [],
        },
        unmetRequirements: [],
      });

      const exitCode = await runConfigCLI({
        command: "status",
        json: true,
      });

      expect(exitCode).toBe(2);
    });

    it("handles plan generation in merge mode", async () => {
      vi.mocked(configService.getStatus).mockResolvedValueOnce({
        status: "changes_detected",
        changes: {
          new: [{ name: "posts", uuid: "u1", type: "collection", entity: {}, hash: "h1" }],
          updated: [{ name: "users", uuid: "u2", type: "role", entity: {}, hash: "h2" }],
          deleted: [{ name: "old_theme", uuid: "u3", type: "theme", entity: {}, hash: "h3" }],
        },
        unmetRequirements: [],
      });

      const exitCode = await runConfigCLI({
        command: "plan",
        mode: "merge",
        json: true,
      });

      expect(exitCode).toBe(0);
    });

    it("handles import execution with --yes", async () => {
      vi.mocked(configService.getStatus).mockResolvedValueOnce({
        status: "changes_detected",
        changes: {
          new: [{ name: "posts", uuid: "u1", type: "collection", entity: {}, hash: "h1" }],
          updated: [],
          deleted: [],
        },
        unmetRequirements: [],
      });
      vi.mocked(configService.performImport).mockResolvedValueOnce(undefined as any);

      const exitCode = await runConfigCLI({
        command: "import",
        mode: "merge",
        yes: true,
        json: true,
      });

      expect(exitCode).toBe(0);
      expect(configService.performImport).toHaveBeenCalledTimes(1);
    });

    it("blocks import if there are unmet requirements", async () => {
      vi.mocked(configService.getStatus).mockResolvedValueOnce({
        status: "changes_detected",
        changes: { new: [], updated: [], deleted: [] },
        unmetRequirements: [{ key: "PUBLIC_SITE_NAME" }],
      });

      const exitCode = await runConfigCLI({
        command: "import",
        mode: "merge",
        yes: true,
      });

      expect(exitCode).toBe(1);
      expect(configService.performImport).not.toHaveBeenCalled();
    });
  });
});
