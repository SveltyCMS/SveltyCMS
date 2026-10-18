/**
 * @file tests/unit/services/backup-path.test.ts
 * @description Path-containment tests for user-supplied backup paths.
 *
 * Features tested:
 * - Valid nested paths resolve inside the backup root
 * - `..` traversal, absolute paths outside the root, and symlink escapes are rejected
 * - `validateBackup` refuses a traversal path before touching the filesystem
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { backupService, resolveBackupPath } from "@src/services/core/backup-service";

describe("backup path containment", () => {
  let root: string;
  let outside: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "svelty-backup-root-"));
    outside = await fs.mkdtemp(path.join(os.tmpdir(), "svelty-backup-outside-"));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  });

  it("accepts a valid nested path", async () => {
    const nested = path.join(root, "backup_1", "database");
    await fs.mkdir(nested, { recursive: true });

    await expect(resolveBackupPath("backup_1/database", root)).resolves.toBe(nested);
  });

  it("rejects `..` traversal", async () => {
    await expect(resolveBackupPath("../escape", root)).resolves.toBeNull();
    await expect(resolveBackupPath("backup_1/../../escape", root)).resolves.toBeNull();
  });

  it("rejects an absolute path outside the root", async () => {
    await expect(resolveBackupPath(outside, root)).resolves.toBeNull();
  });

  it("rejects a symlink escape", async () => {
    const link = path.join(root, "escape-link");
    try {
      await fs.symlink(outside, link, "junction");
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      // Windows without symlink/junction permission — nothing to assert here.
      if (code === "EPERM" || code === "EACCES" || code === "ENOTSUP") return;
      throw err;
    }

    await expect(resolveBackupPath("escape-link", root)).resolves.toBeNull();
  });

  it("validateBackup rejects traversal before reading anything", async () => {
    const result = await backupService.validateBackup("../escape", { storageDir: root });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Invalid backup path");
  });

  it("validateBackup rejects an absolute path outside the root", async () => {
    const result = await backupService.validateBackup(outside, { storageDir: root });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Invalid backup path");
  });
});
