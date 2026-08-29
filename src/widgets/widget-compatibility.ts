/**
 * @file src/widgets/widget-compatibility.ts
 * @description
 * Import-time contract for CMS widgets, plugins, and dashboard extensions.
 * Rejects packages that lack required identity fields or that declare a
 * CMS version range the running host does not satisfy.
 *
 * ### Features:
 * - PascalCase `Name` + semver `version` required for portable packages
 * - `sveltycms` / `requiresSveltyCMS` range check (`>=`, `>`, `^`, `~`, exact)
 * - shared by createWidget, widget-store register, marketplace install
 */

export type WidgetImportTier = "core" | "custom" | "marketplace" | "dashboard" | "plugin";

export interface WidgetImportManifest {
  Name?: unknown;
  name?: unknown;
  version?: unknown;
  sveltycms?: unknown;
  requiresSveltyCMS?: unknown;
  validationSchema?: unknown;
}

export interface WidgetImportResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  name: string;
  version: string;
  cmsRange: string;
}

const SEMVER_CORE = /^(\d+)\.(\d+)\.(\d+)/;
const SEMVER_FULL = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

let cachedCmsVersion: string | null = null;

/** Running CMS version (package.json). Fallback keeps checks deterministic. */
export function getCmsVersion(): string {
  if (cachedCmsVersion) return cachedCmsVersion;
  try {
    const fromNpm = typeof process !== "undefined" ? process.env?.npm_package_version : undefined;
    if (fromNpm && SEMVER_FULL.test(fromNpm)) {
      cachedCmsVersion = fromNpm;
      return cachedCmsVersion;
    }
  } catch {
    /* ignore */
  }
  cachedCmsVersion = "0.0.8";
  return cachedCmsVersion;
}

export function isSemver(value: string): boolean {
  return SEMVER_FULL.test(value.trim());
}

export function parseSemver(value: string): [number, number, number] | null {
  const m = String(value).trim().match(SEMVER_CORE);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function cmp(a: [number, number, number], b: [number, number, number]): number {
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[1] !== b[1]) return a[1] - b[1];
  return a[2] - b[2];
}

/**
 * Minimal semver-range matcher for widget/plugin CMS constraints.
 * Supports `*`, exact `x.y.z`, `>=`, `>`, `<=`, `<`, `^`, `~`.
 */
export function satisfiesCmsRange(cmsVersion: string, range: string): boolean {
  const v = parseSemver(cmsVersion);
  if (!v) return false;
  const r = range.trim();
  if (!r || r === "*" || r === "x") return true;

  const op = r.match(/^(>=|>|<=|<|\^|~)\s*(.+)$/);
  if (!op) {
    const exact = parseSemver(r);
    return exact ? cmp(v, exact) === 0 : false;
  }
  const kind = op[1];
  const target = parseSemver(op[2]);
  if (!target) return false;

  if (kind === ">=") return cmp(v, target) >= 0;
  if (kind === ">") return cmp(v, target) > 0;
  if (kind === "<=") return cmp(v, target) <= 0;
  if (kind === "<") return cmp(v, target) < 0;
  if (kind === "~") {
    return v[0] === target[0] && v[1] === target[1] && cmp(v, target) >= 0;
  }
  // caret: ^1.2.3 → same major; ^0.2.3 → same minor; ^0.0.3 → exact patch
  if (target[0] > 0) return v[0] === target[0] && cmp(v, target) >= 0;
  if (target[1] > 0) return v[0] === 0 && v[1] === target[1] && cmp(v, target) >= 0;
  return v[0] === 0 && v[1] === 0 && v[2] === target[2];
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Import-time contract. Core in-tree widgets may omit `sveltycms`.
 * Custom/marketplace/dashboard/plugin packages must declare a CMS range.
 */
export function validateWidgetImport(
  manifest: WidgetImportManifest,
  opts: { tier?: WidgetImportTier; cmsVersion?: string } = {},
): WidgetImportResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const tier = opts.tier ?? "custom";
  const cmsVersion = opts.cmsVersion || getCmsVersion();

  const name = readString(manifest.Name) || readString(manifest.name);
  if (!name) {
    errors.push(`Missing required field Name (PascalCase factory name, e.g. PhoneNumber).`);
  } else if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) {
    errors.push(
      `Name "${name}" must be PascalCase / acronym (e.g. PhoneNumber, SEO), not kebab-case.`,
    );
  }

  let version = readString(manifest.version);
  if (!version) {
    if (tier === "core") {
      version = "1.0.0";
      warnings.push(`Core widget "${name || "(unnamed)"}" omitted version — defaulting to 1.0.0.`);
    } else {
      errors.push(`Missing required field version (semver, e.g. 1.0.0).`);
    }
  } else if (!isSemver(version)) {
    errors.push(`version "${version}" is not semver (expected x.y.z).`);
  }

  const cmsRange = readString(manifest.sveltycms) || readString(manifest.requiresSveltyCMS);
  const portable = tier === "marketplace" || tier === "dashboard" || tier === "plugin";
  if (!cmsRange) {
    if (portable) {
      errors.push(
        `Missing required field sveltycms / requiresSveltyCMS (CMS version range, e.g. ">=0.0.8").`,
      );
    } else if (tier === "custom") {
      warnings.push(
        `Custom widget "${name || "(unnamed)"}" should declare sveltycms (CMS version range) for import compatibility.`,
      );
    }
  } else if (!satisfiesCmsRange(cmsVersion, cmsRange)) {
    errors.push(
      `Incompatible with CMS ${cmsVersion} (package requires ${cmsRange}). Update the host or the package.`,
    );
  }

  if (tier !== "dashboard" && tier !== "plugin" && manifest.validationSchema === undefined) {
    if (tier === "core") {
      warnings.push(`Widget "${name || "(unnamed)"}" has no validationSchema.`);
    } else {
      errors.push(`Missing required field validationSchema.`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    name,
    version: version || "",
    cmsRange,
  };
}

/** Marketplace/plugin listing: version + CMS range. Display names need not be PascalCase. */
export function validatePackageCompatibility(
  pkg: { name?: string; version?: string; requiresSveltyCMS?: string; sveltycms?: string },
  cmsVersion = getCmsVersion(),
): WidgetImportResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const version = typeof pkg.version === "string" ? pkg.version.trim() : "";
  if (!version) {
    errors.push(`Missing required field version (semver, e.g. 1.0.0).`);
  } else if (!isSemver(version)) {
    errors.push(`version "${version}" is not semver (expected x.y.z).`);
  }
  const cmsRange =
    (typeof pkg.sveltycms === "string" && pkg.sveltycms.trim()) ||
    (typeof pkg.requiresSveltyCMS === "string" && pkg.requiresSveltyCMS.trim()) ||
    "";
  if (!cmsRange) {
    errors.push(
      `Missing required field sveltycms / requiresSveltyCMS (CMS version range, e.g. ">=0.0.8").`,
    );
  } else if (!satisfiesCmsRange(cmsVersion, cmsRange)) {
    errors.push(
      `Incompatible with CMS ${cmsVersion} (package requires ${cmsRange}). Update the host or the package.`,
    );
  }
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    name: pkg.name || "",
    version,
    cmsRange,
  };
}

/** Throws if a marketplace/plugin listing cannot be installed on this CMS. */
export function assertPackageCompatibleWithCms(
  pkg: { name?: string; version?: string; requiresSveltyCMS?: string; sveltycms?: string },
  cmsVersion = getCmsVersion(),
): void {
  const result = validatePackageCompatibility(pkg, cmsVersion);
  if (!result.ok) {
    throw new Error(
      `[Import] ${pkg.name || "package"} v${pkg.version || "?"} is not compatible: ${result.errors.join("; ")}`,
    );
  }
}
