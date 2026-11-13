/**
 * @file scripts/security/generate-sbom.ts
 * @description Generates a Software Bill of Materials (SBOM) in CycloneDX 1.5 JSON
 * for supply chain security auditing and compliance (SOC 2, GDPR Art. 32).
 *
 * The lock parser separates registry packages (`name@1.2.3`) from every other
 * specifier (`file:`, `git+https:`, `workspace:`, tarball URL). A version is only
 * recognised when the text after the LAST `@` starts with a digit; everything
 * else becomes a non-registry component with version `0.0.0` and a `bom-ref`
 * that encodes the raw specifier, so `file:`/`git:`/workspace entries can never
 * be reported under a bogus name/version pair. The emitted `dependencies`
 * graph gives every component a node (`ref` + `dependsOn`) so transitive
 * correlation works without re-resolving the lockfile.
 *
 * Usage: bun run scripts/security/generate-sbom.ts
 * Output: sbom.json (project root)
 *
 * Features:
 * - Registry vs non-registry specifier parsing — never mis-splits on `@`
 * - CycloneDX 1.5 `dependencies` array derived from each lock entry's `dependencies`
 * - Deterministic ordering: components sorted by `bom-ref`, `dependsOn` sorted
 */

import { resolve } from "node:path";
import fs from "node:fs/promises";

const NON_REGISTRY_VERSION = "0.0.0";

/** Resolved position of a lock entry: registry package or raw specifier. */
export interface PackageInfo {
  name: string;
  version: string;
  bomRef: string;
  purl?: string;
  integrity?: string;
  dependencies?: Record<string, string>;
  registry: boolean;
}

/** A parsed lock specifier (`name@1.2.3` or an opaque `file:`/`git:`/… value). */
export interface ParsedSpecifier {
  name: string;
  version: string;
  bomRef: string;
  purl?: string;
  registry: boolean;
}

/** Minimal manifest surface the BOM needs (dependency scopes + root identity). */
export interface SbomManifest {
  name: string;
  version: string;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

export interface SbomComponent {
  type: "library";
  "bom-ref": string;
  name: string;
  version: string;
  purl?: string;
  scope?: "required" | "optional" | "excluded";
  hashes?: Array<{ alg: string; content: string }>;
}

export interface SbomDependency {
  ref: string;
  dependsOn: string[];
}

export interface SBOM {
  bomFormat: string;
  specVersion: string;
  serialNumber: string;
  version: number;
  metadata: {
    timestamp: string;
    tools: Array<{ name: string; version: string }>;
    component: {
      name: string;
      version: string;
      type: "application";
      purl: string;
    };
  };
  components: SbomComponent[];
  dependencies: SbomDependency[];
}

/** Locale-independent string comparison — keeps the BOM byte-stable across hosts. */
function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/**
 * Derives a display name for a non-registry specifier. The lock key is preferred
 * (bun keys non-registry entries by package name); the specifier head is only
 * used when it cannot be a URL or a scheme-prefixed path.
 */
function nonRegistryName(specifier: string, fallbackName?: string): string {
  if (fallbackName) return fallbackName;
  const lastAtIndex = specifier.lastIndexOf("@");
  const head = lastAtIndex > 0 ? specifier.slice(0, lastAtIndex) : "";
  return head !== "" && !head.includes("://") && !head.includes(":") ? head : specifier;
}

/**
 * Splits a lock specifier into a component identity.
 *
 * `@scope/pkg@1.2.3` → `pkg:npm/@scope/pkg@1.2.3`; `pkg@file:../x`,
 * `pkg@git+https://…#sha`, `pkg@workspace:apps/x` and `pkg@latest` → version
 * `0.0.0` with `urn:sveltycms:lock:<encoded specifier>` as `bom-ref`.
 */
export function parseLockSpecifier(specifier: string, fallbackName?: string): ParsedSpecifier {
  const lastAtIndex = specifier.lastIndexOf("@");
  const suffix = lastAtIndex > 0 ? specifier.slice(lastAtIndex + 1) : "";

  if (suffix !== "" && /^\d/.test(suffix)) {
    const name = specifier.slice(0, lastAtIndex);
    return {
      name,
      version: suffix,
      bomRef: `pkg:npm/${name}@${suffix}`,
      purl: `pkg:npm/${name}@${suffix}`,
      registry: true,
    };
  }

  return {
    name: nonRegistryName(specifier, fallbackName),
    version: NON_REGISTRY_VERSION,
    bomRef: `urn:sveltycms:lock:${encodeURIComponent(specifier)}`,
    registry: false,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readDependencyMap(meta: Record<string, unknown>): Record<string, string> | undefined {
  const raw = meta.dependencies;
  if (!isPlainObject(raw)) return undefined;
  const dependencies: Record<string, string> = {};
  for (const [name, range] of Object.entries(raw)) {
    if (typeof range === "string") dependencies[name] = range;
  }
  return Object.keys(dependencies).length > 0 ? dependencies : undefined;
}

/**
 * Normalises one `packages` value. Registry entries are
 * `[specifier, resolution, meta, integrity]`; non-registry entries omit slots, so
 * the meta object and the integrity hash are located positionally-independent.
 */
function normalizeLockEntry(
  raw: unknown,
): { specifier: string; meta: Record<string, unknown>; integrity?: string } | null {
  if (!Array.isArray(raw) || raw.length === 0 || typeof raw[0] !== "string") return null;

  let meta: Record<string, unknown> = {};
  let integrity: string | undefined;
  for (const item of raw.slice(1)) {
    if (isPlainObject(item)) {
      if (Object.keys(meta).length === 0) meta = item;
    } else if (
      typeof item === "string" &&
      integrity === undefined &&
      /^(sha1|sha256|sha512)-/.test(item)
    ) {
      integrity = item;
    }
  }
  return { specifier: raw[0], meta, integrity };
}

/** Parses raw `bun.lock` text into resolved packages (exported for tests). */
export function parseBunLockText(rawText: string): PackageInfo[] {
  const cleanText = rawText.replace(/^\uFEFF/, "").replace(/,\s*([\]}])/g, "$1");
  const lockData: unknown = JSON.parse(cleanText);
  if (!isPlainObject(lockData) || !isPlainObject(lockData.packages)) return [];

  const packages: PackageInfo[] = [];
  for (const [lockKey, rawEntry] of Object.entries(lockData.packages)) {
    const entry = normalizeLockEntry(rawEntry);
    if (!entry) continue;
    const parsed = parseLockSpecifier(entry.specifier, lockKey);
    packages.push({
      ...parsed,
      integrity: entry.integrity,
      dependencies: readDependencyMap(entry.meta),
    });
  }
  return packages;
}

async function parseBunLock(): Promise<PackageInfo[]> {
  try {
    return parseBunLockText(await fs.readFile("bun.lock", "utf-8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Failed to parse bun.lock:", message);
    return [];
  }
}

/** Builds the CycloneDX document from resolved packages + the manifest (pure). */
export function buildSbom(packages: PackageInfo[], manifest: SbomManifest): SBOM {
  const devDeps = new Set(Object.keys(manifest.devDependencies ?? {}));
  const optDeps = new Set(Object.keys(manifest.optionalDependencies ?? {}));

  const sortedPackages = packages
    .filter((pkg) => pkg.name !== "" && pkg.bomRef !== "")
    .sort((a, b) => compareStrings(a.bomRef, b.bomRef));

  const bomRefByName = new Map<string, string>();
  for (const pkg of sortedPackages) {
    if (!bomRefByName.has(pkg.name)) bomRefByName.set(pkg.name, pkg.bomRef);
  }

  const components: SbomComponent[] = sortedPackages.map((pkg) => ({
    type: "library",
    "bom-ref": pkg.bomRef,
    name: pkg.name,
    version: pkg.version,
    purl: pkg.purl,
    scope: optDeps.has(pkg.name)
      ? ("optional" as const)
      : devDeps.has(pkg.name)
        ? ("excluded" as const)
        : ("required" as const),
    hashes: pkg.integrity ? [{ alg: "SHA-512", content: pkg.integrity }] : undefined,
  }));

  const dependencies: SbomDependency[] = sortedPackages.map((pkg) => {
    const dependsOn = new Set<string>();
    for (const dependencyName of Object.keys(pkg.dependencies ?? {})) {
      const ref = bomRefByName.get(dependencyName);
      if (ref !== undefined && ref !== pkg.bomRef) dependsOn.add(ref);
    }
    return { ref: pkg.bomRef, dependsOn: [...dependsOn].sort(compareStrings) };
  });

  return {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    serialNumber: `urn:uuid:${crypto.randomUUID()}`,
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      tools: [{ name: "sveltycms-sbom", version: "1.0.0" }],
      component: {
        name: manifest.name,
        version: manifest.version,
        type: "application",
        purl: `pkg:npm/${manifest.name}@${manifest.version}`,
      },
    },
    components,
    dependencies,
  };
}

async function readManifest(): Promise<SbomManifest> {
  const rawText = await fs.readFile("package.json", "utf-8");
  const parsed: unknown = JSON.parse(rawText.replace(/^\uFEFF/, ""));
  if (
    !isPlainObject(parsed) ||
    typeof parsed.name !== "string" ||
    typeof parsed.version !== "string"
  ) {
    throw new Error("package.json is missing a string name/version");
  }
  const readMap = (value: unknown): Record<string, string> | undefined =>
    isPlainObject(value) ? (value as Record<string, string>) : undefined;
  return {
    name: parsed.name,
    version: parsed.version,
    devDependencies: readMap(parsed.devDependencies),
    optionalDependencies: readMap(parsed.optionalDependencies),
  };
}

async function main(): Promise<void> {
  const packages = await parseBunLock();
  const sbom = buildSbom(packages, await readManifest());
  const outputPath = resolve(process.cwd(), "sbom.json");
  await fs.writeFile(outputPath, JSON.stringify(sbom, null, 2), "utf-8");

  console.log(`✅ SBOM generated: ${outputPath}`);
  console.log(`   ${sbom.components.length} components`);
  console.log(`   ${sbom.dependencies.length} dependency nodes`);
  console.log(`   CycloneDX ${sbom.specVersion} format`);
  console.log(`   Serial: ${sbom.serialNumber}`);
}

if (import.meta.main) {
  await main();
}
