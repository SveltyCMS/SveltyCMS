/**
 * @file tests/unit/agent/tools-server.test.ts
 * @description Unit tests for the local agent dev loop file tools: path fence and caps.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AGENT_CAPS } from "@src/utils/vite-plugin-agent/caps";
import { resolveInsideRoot } from "@src/utils/vite-plugin-agent/path-policy";
import {
  fileExistsTool,
  grepTool,
  listTreeTool,
  readFileTool,
  runAgentTool,
} from "@src/utils/vite-plugin-agent/tools-server";

let root = "";
let outside = "";

function write(rootPath: string, relPath: string, content: string): void {
  const abs = path.join(rootPath, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf8");
}

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-root-"));
  outside = fs.mkdtempSync(path.join(os.tmpdir(), "agent-outside-"));

  write(root, "src/hello.ts", "export const hello = 'world';\n// AGENT_MARKER line\n");
  write(root, "src/components/button.svelte", "<button>Save</button>\n");
  write(root, "src/nested/deep/leaf.ts", "export const leaf = 1;\n");
  write(root, "docs/guide.mdx", "# Guide\nAGENT_MARKER in docs\n");
  write(root, ".env", "SECRET=should-not-be-readable\n");
  write(root, "config/private.ts", "export const privateConfig = true;\n");
  write(root, ".git/config", "[core]\n");
  write(root, "node_modules/pkg/index.js", "module.exports = 1;\n");
  write(root, "mediaFolder/photo.txt", "binary-ish\n");
  write(
    root,
    "big.ts",
    Array.from({ length: 600 }, (_, i) => `export const line${i} = ${i};`).join("\n"),
  );

  const secret = path.join(outside, "secret.ts");
  fs.writeFileSync(secret, "export const secret = 'outside';\n", "utf8");
  fs.symlinkSync(outside, path.join(root, "escape"), "dir");
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
});

describe("agent path policy", () => {
  it("resolves a repo-relative source file", () => {
    const decision = resolveInsideRoot(root, "src/hello.ts");
    expect(decision.ok).toBe(true);
    if (decision.ok) {
      expect(decision.rel).toBe("src/hello.ts");
      expect(decision.abs.startsWith(fs.realpathSync(root))).toBe(true);
    }
  });

  it.each([
    ["", "empty"],
    ["../outside.ts", "parent escape"],
    ["src/../../outside.ts", "deep parent escape"],
    ["/etc/passwd", "absolute path"],
    [".env", "env file"],
    ["config/private.ts", "private config"],
    [".git/config", "git internals"],
    ["node_modules/pkg/index.js", "dependency tree"],
    ["mediaFolder/photo.txt", "media folder"],
    ["escape/secret.ts", "symlink escape"],
  ])("refuses %s (%s)", (candidate) => {
    expect(resolveInsideRoot(root, candidate).ok).toBe(false);
  });

  it("refuses a path containing a null byte", () => {
    expect(resolveInsideRoot(root, "src/hello\u0000.ts").ok).toBe(false);
  });
});

describe("agent read tools", () => {
  it("reads a file window with a total line count", () => {
    const result = readFileTool(root, "src/hello.ts");
    expect(result.ok).toBe(true);
    const data = result.data as { totalLines: number; lines: string[] };
    expect(data.totalLines).toBeGreaterThanOrEqual(2);
    expect(data.lines.join("\n")).toContain("AGENT_MARKER");
    expect(result.truncated).toBe(false);
  });

  it("truncates at the configured line cap", () => {
    const result = readFileTool(root, "big.ts");
    expect(result.ok).toBe(true);
    const data = result.data as { totalLines: number; lines: string[] };
    expect(data.lines).toHaveLength(AGENT_CAPS.readFileLines);
    expect(data.totalLines).toBe(600);
    expect(result.truncated).toBe(true);
  });

  it("reports a missing file and refuses a denied path", () => {
    expect(readFileTool(root, "src/missing.ts").ok).toBe(false);
    expect(readFileTool(root, "src/missing.ts").error).toBe("file not found");
    expect(readFileTool(root, ".env").ok).toBe(false);
  });

  it("answers file_exists without leaking content", () => {
    const present = fileExistsTool(root, "src/hello.ts");
    const absent = fileExistsTool(root, "src/nope.ts");
    expect((present.data as { exists: boolean }).exists).toBe(true);
    expect((absent.data as { exists: boolean }).exists).toBe(false);
    expect(absent.data).not.toHaveProperty("content");
  });

  it("lists a tree, skips the deny list, and respects depth", () => {
    const result = listTreeTool(root, "", 3);
    expect(result.ok).toBe(true);
    const entries = (result.data as { entries: string[] }).entries;
    expect(entries).toContain("src/hello.ts");
    expect(entries).toContain("src/nested/deep/");
    expect(entries.some((entry) => entry.startsWith("node_modules"))).toBe(false);
    expect(entries.some((entry) => entry.startsWith(".git"))).toBe(false);
    expect(entries.some((entry) => entry.startsWith("mediaFolder"))).toBe(false);
    expect(entries).not.toContain("src/nested/deep/leaf.ts");
  });

  it("greps text files, caps matches, and fails closed on a bad pattern", () => {
    const result = grepTool(root, "AGENT_MARKER");
    expect(result.ok).toBe(true);
    const data = result.data as { results: { path: string; matches: unknown[] }[] };
    const paths = data.results.map((entry) => entry.path);
    expect(paths).toContain("src/hello.ts");
    expect(paths).toContain("docs/guide.mdx");
    for (const entry of data.results) {
      expect(entry.matches.length).toBeLessThanOrEqual(AGENT_CAPS.grepMatchesPerFile);
    }
    expect(grepTool(root, "(").ok).toBe(false);
  });
});

describe("runAgentTool dispatch", () => {
  it("dispatches read_file and falls back on malformed arguments", async () => {
    const result = await runAgentTool("read_file", root, { path: "src/hello.ts", limit: "nope" });
    expect(result.ok).toBe(true);
    const data = result.data as { lines: string[] };
    expect(data.lines.length).toBeLessThanOrEqual(AGENT_CAPS.readFileLines);
  });

  it("fails closed on an unknown tool", async () => {
    const result = await runAgentTool("write_file", root, { path: "src/hello.ts" });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("unknown tool");
  });
});
