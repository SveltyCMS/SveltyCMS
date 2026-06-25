import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import {
  BENCHMARK_COMPILED_DIR,
  cleanupAllBenchmarkWorkspaces,
  cleanupBenchmarkCompiledWorkspace,
  getBenchmarkWorkspace,
  isBenchmarkRelativePath,
  isUnderBenchmarkPath,
  prepareBenchmarkCompiledWorkspace,
  USER_COMPILED_DIR,
  USER_COLLECTIONS_DIR,
} from "@utils/benchmark-paths";

describe("benchmark-paths", () => {
  it("resolves workspace under test/ trees", () => {
    const ws = getBenchmarkWorkspace("scan");
    expect(ws.compiled).toBe(path.join(USER_COMPILED_DIR, "test", "scan"));
    expect(ws.source).toBe(path.join(USER_COLLECTIONS_DIR, "test", "scan"));
  });

  it("detects benchmark relative and absolute paths", () => {
    expect(isBenchmarkRelativePath("test/scan/foo.ts")).toBe(true);
    expect(isBenchmarkRelativePath("posts.ts")).toBe(false);
    expect(isUnderBenchmarkPath(path.join(BENCHMARK_COMPILED_DIR, "scan", "a.js"))).toBe(true);
    expect(isUnderBenchmarkPath(path.join(USER_COMPILED_DIR, "posts.js"))).toBe(false);
  });

  it("prepares and cleans workspace without touching user root marker", async () => {
    const userMarker = path.join(USER_COMPILED_DIR, "user_live_marker.js");
    await fs.mkdir(USER_COMPILED_DIR, { recursive: true });
    await fs.writeFile(userMarker, "export default {};", "utf-8");

    const ws = await prepareBenchmarkCompiledWorkspace("paths-test");
    await fs.writeFile(path.join(ws.compiled, "bench_fixture.js"), "export default {};", "utf-8");

    expect(await fs.stat(path.join(ws.compiled, "bench_fixture.js")).then(() => true)).toBe(true);
    expect(await fs.stat(userMarker).then(() => true)).toBe(true);

    await cleanupBenchmarkCompiledWorkspace("paths-test");
    expect(
      await fs
        .access(path.join(ws.compiled, "bench_fixture.js"))
        .then(() => true)
        .catch(() => false),
    ).toBe(false);
    expect(await fs.stat(userMarker).then(() => true)).toBe(true);

    await fs.unlink(userMarker).catch(() => {});
  });

  it("cleanupAllBenchmarkWorkspaces removes test trees only", async () => {
    const userMarker = path.join(USER_COMPILED_DIR, "user_live_marker.js");
    await fs.mkdir(BENCHMARK_COMPILED_DIR, { recursive: true });
    await fs.writeFile(
      path.join(BENCHMARK_COMPILED_DIR, "bench.js"),
      "export default {};",
      "utf-8",
    );
    await fs.writeFile(userMarker, "export default {};", "utf-8");

    await cleanupAllBenchmarkWorkspaces();

    expect(
      await fs
        .access(path.join(BENCHMARK_COMPILED_DIR, "bench.js"))
        .then(() => true)
        .catch(() => false),
    ).toBe(false);
    expect(await fs.stat(userMarker).then(() => true)).toBe(true);

    await fs.unlink(userMarker).catch(() => {});
  });
});
