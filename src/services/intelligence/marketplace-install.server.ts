/**
 * @file src/services/intelligence/marketplace-install.server.ts
 * @description Server-only half of the marketplace: download, checksum verification
 * and installation of remote packages into the local project.
 *
 * Split from `marketplace-client.ts` on purpose. The catalog client is bundled into
 * the browser (extensions UI); this module needs Node builtins (`node:fs`,
 * `node:path`, `node:crypto`) plus the SSRF guard (`validateEgressUrl` + `safeFetch`).
 * Importing them from the catalog client shipped `node:*` specifiers into client
 * chunks — measured 2026-09-21: the browser requested the URL `node:path`, the
 * CORS-blocked scheme aborted the import and the whole route chunk failed, taking
 * /mediagallery and the marketplace down with it.
 *
 * ### Features:
 * - Egress-guarded download (validateEgressUrl + safeFetch, size and timeout capped)
 * - SHA-256 checksum over canonical file contents
 * - Install path allowlist plus directory-traversal guard
 */

import { logger } from "@utils/logger";
import { marketplace, type MarketplacePlugin } from "./marketplace-client";
import { assertPackageCompatibleWithCms } from "@src/widgets/widget-compatibility";

const ALLOWED_INSTALL_PREFIXES = [
  "src/plugins/",
  "src/widgets/",
  "src/widgets/custom/",
  "src/routes/(app)/dashboard/widgets/",
  "src/themes/",
] as const;

/** Node fs/path surface used by the install path guard (loaded lazily by callers). */
type PathOps = Pick<typeof import("node:path"), "resolve" | "relative" | "isAbsolute">;

function assertSafeInstallPath(
  path: PathOps,
  installPath: string,
  filename: string,
  cwd: string,
): string {
  if (!installPath || installPath.includes("\0") || filename.includes("\0")) {
    throw new Error("Invalid install path");
  }
  const normalized = installPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (normalized.includes("..") || filename.includes("..")) {
    throw new Error("Install path must not contain '..'");
  }
  const allowed = ALLOWED_INSTALL_PREFIXES.some(
    (prefix) => normalized === prefix.slice(0, -1) || normalized.startsWith(prefix),
  );
  if (!allowed) {
    throw new Error(`Install path "${normalized}" is outside the allowed marketplace directories`);
  }
  const installDir = path.resolve(cwd, normalized);
  const filePath = path.resolve(installDir, filename);
  const rel = path.relative(installDir, filePath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("File path escapes install directory");
  }
  return filePath;
}

/** Canonical SHA-256 of package files (sorted filenames, utf-8). */
export async function hashPackageFiles(files: Record<string, string>): Promise<string> {
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256");
  for (const name of Object.keys(files).sort()) {
    hash.update(name);
    hash.update("\0");
    hash.update(files[name] ?? "");
    hash.update("\n");
  }
  return hash.digest("hex");
}

export function verifyPackageChecksum(
  plugin: Pick<MarketplacePlugin, "id" | "checksum" | "sha256">,
  actual: string,
): void {
  const expected = (plugin.checksum || plugin.sha256 || "").trim().toLowerCase();
  if (!expected) return;
  if (expected !== actual.toLowerCase()) {
    throw new Error(`Checksum mismatch for ${plugin.id}: expected ${expected}, got ${actual}`);
  }
}

/**
 * Download a package by slug, preferring JSON payloads with `files` + checksum.
 * The remote URL is attacker-influenced, so it goes through the egress guard.
 */
async function downloadPackage(pluginSlug: string): Promise<MarketplacePlugin> {
  const pkg = await marketplace.getPackage(pluginSlug);
  const downloadUrl = marketplace.downloadUrlFor(pkg);
  const { validateEgressUrl, safeFetch } = await import("@src/utils/egress-guard");
  await validateEgressUrl(downloadUrl, { timeoutMs: 30_000, maxSizeBytes: 20 * 1024 * 1024 });
  const result = await safeFetch(downloadUrl, {
    headers: marketplace.authHeaders(),
    timeoutMs: 30_000,
    maxSizeBytes: 20 * 1024 * 1024,
  });
  if (!result.success || result.status !== 200 || !result.body) {
    if (pkg.files && Object.keys(pkg.files).length > 0) return pkg;
    throw new Error(`Download failed for ${pluginSlug}: ${result.error || result.status}`);
  }
  try {
    const parsed = JSON.parse(result.body) as MarketplacePlugin & {
      files?: Record<string, string>;
    };
    if (parsed.files && typeof parsed.files === "object") {
      return { ...pkg, ...parsed, files: parsed.files };
    }
  } catch {
    // Non-JSON archive: keep metadata; installPlugin requires `files`.
  }
  return pkg;
}

/**
 * Install a plugin from the marketplace into the local project.
 * Creates the directory structure and writes all files after checksum + path checks.
 */
export async function installPlugin(
  pluginId: string,
  options: { licenseKey?: string; expectedChecksum?: string } = {},
): Promise<MarketplacePlugin> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const cwd = process.cwd();

  if (options.licenseKey) {
    marketplace.setLicense(options.licenseKey);
  }

  const plugin = await downloadPackage(pluginId);
  assertPackageCompatibleWithCms(plugin);
  if (!plugin.files || Object.keys(plugin.files).length === 0) {
    throw new Error(`Package ${pluginId} did not include installable files`);
  }

  const actual = await hashPackageFiles(plugin.files);
  if (options.expectedChecksum) {
    plugin.checksum = options.expectedChecksum;
  }
  verifyPackageChecksum(plugin, actual);

  const license = await marketplace.checkLicense(plugin.id);
  if (plugin.license && plugin.license !== "free" && !license.valid) {
    throw new Error(`License required for ${plugin.name} (${plugin.license})`);
  }

  await fs.mkdir(path.join(cwd, plugin.installPath.replace(/\\/g, "/")), { recursive: true });

  for (const [filename, content] of Object.entries(plugin.files)) {
    const filePath = assertSafeInstallPath(path, plugin.installPath, filename, cwd);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf-8");
  }

  logger.info(`[Marketplace] Installed ${plugin.name} v${plugin.version} to ${plugin.installPath}`);
  return plugin;
}

/**
 * Install a dashboard widget package from the marketplace into the local project.
 * Dashboard widgets live in self-contained kebab-case folders under
 * `src/routes/(app)/dashboard/widgets/<folder>/` and are discovered at build
 * time via `import.meta.glob` — no manual registration required.
 *
 * The marketplace package must set `installPath` to
 * `src/routes/(app)/dashboard/widgets/<folder>` and include the widget's
 * `.svelte` component, `widget.json` manifest, and optional `.mdx` docs.
 */
export async function installDashboardWidget(widgetId: string): Promise<MarketplacePlugin> {
  const plugin = await installPlugin(widgetId);
  logger.info(
    `[Marketplace] Dashboard widget ${plugin.name} v${plugin.version} installed to ${plugin.installPath} — restart the dev server to pick it up`,
  );
  return plugin;
}
