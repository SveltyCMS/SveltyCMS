/**
 * @file tests/unit/scripts/marketplace-conformance.test.ts
 * @description Unit tests for the in-repo marketplace plugin conformance audit.
 *
 * Every case builds a disposable `src/plugins` fixture under `os.tmpdir()` and
 * runs the real validator against the canonical `PluginCapability` and
 * `InjectionZone` unions in this repository. No live config or database is read.
 *
 * Features:
 * - Valid plugin passes every check
 * - Missing manifest/entry metadata fails
 * - Non-SemVer version fails
 * - Duplicate plugin id fails
 * - Unknown capability fails
 * - Unknown slot zone fails
 * - Missing cmsVersionRange inherits the host version for first-party metadata
 * - Temp fixture directories are removed in afterEach
 */

import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditPlugins,
  type AuditReport,
  type ConformanceCheck,
  type ConformanceCheckId,
} from "../../../scripts/marketplace/conformance.ts";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const HOST_VERSION = "0.11.1";
const tempRoots: string[] = [];

interface FixtureOptions {
  id?: string;
  version?: string;
  name?: string;
  description?: string;
  capabilities?: string[] | null;
  zone?: string | null;
  cmsVersionRange?: string | null;
}

function pluginSource(options: FixtureOptions = {}): string {
  const {
    id = "demo-plugin",
    version = "1.2.3",
    name = "Demo Plugin",
    description = "Fixture plugin for conformance tests.",
    capabilities = ["db:read"],
    zone = "dashboard",
    cmsVersionRange = null,
  } = options;

  const lines = [
    "/** @file fixture plugin */",
    'import { definePlugin } from "../../../define-plugin";',
    "",
    "export const demoPlugin = definePlugin({",
    "  metadata: {",
    `    id: ${JSON.stringify(id)},`,
    `    name: ${JSON.stringify(name)},`,
    `    version: ${JSON.stringify(version)},`,
    `    description: ${JSON.stringify(description)},`,
  ];

  if (cmsVersionRange !== null) {
    lines.push(`    cmsVersionRange: ${JSON.stringify(cmsVersionRange)},`);
  }
  if (capabilities !== null) {
    lines.push(`    capabilities: ${JSON.stringify(capabilities)},`);
  }

  lines.push("  },");
  if (zone !== null) {
    lines.push(
      `  ui: { slots: [{ id: "demo-slot", zone: ${JSON.stringify(zone)}, component: () => import("./demo.svelte") }] },`,
    );
  }
  lines.push("});", "");

  return lines.join("\n");
}

async function createPluginsRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "svelty-conformance-"));
  tempRoots.push(root);
  const pluginsRoot = join(root, "src", "plugins");
  await mkdir(pluginsRoot, { recursive: true });
  return pluginsRoot;
}

async function writePlugin(pluginsRoot: string, directory: string, source: string): Promise<void> {
  const path = join(pluginsRoot, directory);
  await mkdir(path, { recursive: true });
  await writeFile(join(path, "index.ts"), source, "utf8");
}

async function writePluginJson(
  pluginsRoot: string,
  directory: string,
  manifest: Record<string, unknown>,
): Promise<void> {
  const path = join(pluginsRoot, directory);
  await mkdir(path, { recursive: true });
  await writeFile(join(path, "plugin.json"), JSON.stringify(manifest, null, 2), "utf8");
}

function audit(pluginsRoot: string): AuditReport {
  return auditPlugins({
    repoRoot: REPO_ROOT,
    pluginsRoot,
    hostVersion: HOST_VERSION,
  });
}

function getCheck(
  report: AuditReport,
  directory: string,
  id: ConformanceCheckId,
): ConformanceCheck | undefined {
  return report.plugins
    .find((plugin) => plugin.directory === directory)
    ?.checks.find((check) => check.id === id);
}

afterEach(async () => {
  const roots = tempRoots.splice(0);
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

describe("marketplace plugin conformance", () => {
  it("accepts a plugin that satisfies the manifest, entry, capability, and slot contracts", async () => {
    const pluginsRoot = await createPluginsRoot();
    await writePlugin(pluginsRoot, "demo-plugin", pluginSource());

    const report = audit(pluginsRoot);

    expect(report.ok).toBe(true);
    expect(report.summary).toMatchObject({ total: 1, passed: 1, failed: 0 });
    expect(report.plugins[0]?.checks.every((check) => check.status === "pass")).toBe(true);
  });

  it("accepts a portable plugin.json manifest with an explicit CMS range", async () => {
    const pluginsRoot = await createPluginsRoot();
    await writePluginJson(pluginsRoot, "portable-plugin", {
      id: "portable-plugin",
      name: "Portable Plugin",
      description: "Fixture portable package.",
      version: "3.2.1",
      cmsVersionRange: ">=0.11.0",
      permissions: ["db:read"],
    });
    await writePlugin(pluginsRoot, "portable-plugin", 'export default { name: "portable" };\n');

    const report = audit(pluginsRoot);

    expect(report.ok).toBe(true);
    expect(report.plugins[0]?.manifestSource).toBe("plugin.json");
  });

  it("fails when a plugin has no manifest or entry-point metadata", async () => {
    const pluginsRoot = await createPluginsRoot();
    await mkdir(join(pluginsRoot, "missing-manifest"), { recursive: true });

    const report = audit(pluginsRoot);

    expect(report.ok).toBe(false);
    expect(getCheck(report, "missing-manifest", "manifest")?.status).toBe("fail");
    expect(getCheck(report, "missing-manifest", "entry-point")?.status).toBe("fail");
  });

  it("fails on a non-SemVer plugin version", async () => {
    const pluginsRoot = await createPluginsRoot();
    await writePlugin(pluginsRoot, "demo-plugin", pluginSource({ version: "1.0" }));

    const report = audit(pluginsRoot);

    expect(report.ok).toBe(false);
    expect(getCheck(report, "demo-plugin", "version")?.status).toBe("fail");
  });

  it("fails when two plugins declare the same id", async () => {
    const pluginsRoot = await createPluginsRoot();
    await writePlugin(pluginsRoot, "alpha", pluginSource({ id: "shared-id" }));
    await writePlugin(pluginsRoot, "beta", pluginSource({ id: "shared-id" }));

    const report = audit(pluginsRoot);

    expect(report.ok).toBe(false);
    expect(getCheck(report, "alpha", "duplicate-id")?.status).toBe("fail");
    expect(getCheck(report, "beta", "duplicate-id")?.status).toBe("fail");
  });

  it("fails when a declared capability is not in the PluginCapability registry", async () => {
    const pluginsRoot = await createPluginsRoot();
    await writePlugin(
      pluginsRoot,
      "demo-plugin",
      pluginSource({ capabilities: ["db:read", "db:drop"] }),
    );

    const report = audit(pluginsRoot);
    const permissions = getCheck(report, "demo-plugin", "permissions");

    expect(report.ok).toBe(false);
    expect(permissions?.status).toBe("fail");
    expect(permissions?.details.join("\n")).toContain("db:drop");
  });

  it("fails when a slot uses an unknown InjectionZone", async () => {
    const pluginsRoot = await createPluginsRoot();
    await writePlugin(pluginsRoot, "demo-plugin", pluginSource({ zone: "not_a_real_zone" }));

    const report = audit(pluginsRoot);
    const slots = getCheck(report, "demo-plugin", "slots");

    expect(report.ok).toBe(false);
    expect(slots?.status).toBe("fail");
    expect(slots?.details.join("\n")).toContain("not_a_real_zone");
  });

  it("inherits the host CMS range for first-party metadata without an explicit range", async () => {
    const pluginsRoot = await createPluginsRoot();
    await writePlugin(pluginsRoot, "demo-plugin", pluginSource());

    const report = audit(pluginsRoot);

    expect(report.plugins[0]?.manifest.cmsVersionRange).toBe(`>=${HOST_VERSION}`);
    expect(report.plugins[0]?.manifest.cmsVersionRangeInherited).toBe(true);
  });

  it("fails on an invalid cmsVersionRange", async () => {
    const pluginsRoot = await createPluginsRoot();
    await writePlugin(pluginsRoot, "demo-plugin", pluginSource({ cmsVersionRange: "not-a-range" }));

    const report = audit(pluginsRoot);

    expect(report.ok).toBe(false);
    expect(getCheck(report, "demo-plugin", "cms-version-range")?.status).toBe("fail");
  });
});
