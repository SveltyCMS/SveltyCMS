/**
 * @file scripts/marketplace/conformance.ts
 * @description In-repo plugin conformance audit for the marketplace "certified plugin" contract.
 *
 * Scans `src/plugins/*` and validates each package against the manifest,
 * entry-point, capability, slot-zone, and identity rules documented in
 * `docs/development/plugins/testing.mdx`. First-party plugins declare metadata
 * through `definePlugin({ metadata })`; a portable `plugin.json` is accepted
 * when present. The audit deliberately reads source text instead of importing
 * plugin modules: Svelte runes, Vite-only `import.meta.env`, path aliases, and
 * lazy `.svelte` imports make entry modules unsafe to execute on a clean CLI
 * checkout.
 *
 * Usage:
 *   bun run scripts/marketplace/conformance.ts [--check] [--json] [--verbose]
 *
 * Features:
 * - Manifest/identity checks: id, name, description, strict SemVer, CMS range
 * - Entry-point factory/default export detection
 * - Runtime capability validation against the PluginCapability union
 * - UI slot zone validation against the InjectionZone union
 * - Duplicate plugin id and folder/id match checks
 * - Narrow allowlist for reviewed exceptions
 * - JSON output and exit code 1 on failure (check mode is the default)
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

// ============================================================================
// Public types
// ============================================================================

export type ManifestSource = "plugin.json" | "entry-metadata" | "none";

export type ConformanceCheckId =
  | "manifest"
  | "entry-point"
  | "version"
  | "cms-version-range"
  | "permissions"
  | "slots"
  | "id"
  | "duplicate-id";

export type ConformanceCheckStatus = "pass" | "fail" | "allowlisted";

export interface ConformanceCheck {
  id: ConformanceCheckId;
  status: ConformanceCheckStatus;
  message: string;
  details: string[];
}

export interface ResolvedManifest {
  id: string | null;
  name: string | null;
  description: string | null;
  version: string | null;
  cmsVersionRange: string | null;
  /** True when a first-party plugin omitted the range and inherited the host version. */
  cmsVersionRangeInherited: boolean;
  permissions: string[] | null;
  /** Whether the source declared an explicit permissions/capabilities array. */
  permissionsDeclared: boolean;
  source: ManifestSource;
  /** Repo-relative path in the report; absolute while parsing. */
  sourcePath: string | null;
  error: string | null;
}

export interface ParsedSlot {
  id: string | null;
  zone: string | null;
  permissions: string[];
}

export interface PluginAudit {
  directory: string;
  pluginId: string | null;
  manifestSource: ManifestSource;
  entryPath: string;
  manifest: ResolvedManifest;
  ok: boolean;
  checks: ConformanceCheck[];
}

export interface AuditSummary {
  total: number;
  passed: number;
  failed: number;
  allowlistedPlugins: number;
  allowlistedChecks: number;
}

export interface AuditReport {
  ok: boolean;
  pluginsRoot: string;
  hostVersion: string;
  summary: AuditSummary;
  allowlist: readonly AllowlistEntry[];
  skippedDirectories: string[];
  plugins: PluginAudit[];
}

export interface AllowlistEntry {
  /** Plugin id or directory name. */
  plugin: string;
  check: ConformanceCheckId;
  /** Why this plugin cannot satisfy the check. */
  reason: string;
  /** The issue that must be fixed to remove the exception. */
  followUp: string;
}

export interface AuditOptions {
  /** Repository root (the directory containing `package.json` and `src/`). */
  repoRoot: string;
  /** Plugin root override for fixture-based tests. Defaults to `<repoRoot>/src/plugins`. */
  pluginsRoot?: string;
  /** Host CMS version override for fixture-based tests. Defaults to `package.json#version`. */
  hostVersion?: string;
  /** Allowlist override for fixture-based tests. Defaults to `ALLOWLIST`. */
  allowlist?: readonly AllowlistEntry[];
}

/**
 * Shared primitives under `src/plugins/` that are not plugin packages:
 * `storage` is the storage-adapter contract and `wasm` is the WebAssembly
 * sandbox type contract. Neither has a `definePlugin` entry point.
 */
export const NON_PLUGIN_DIRECTORIES: ReadonlySet<string> = new Set(["storage", "wasm"]);

/**
 * Reviewed exceptions. Keep entries narrow: one plugin and one check, with a
 * reason and a follow-up. An empty list means every in-repo plugin conforms.
 */
export const ALLOWLIST: readonly AllowlistEntry[] = [
  // No entries: the in-repo plugins satisfy every check.
];

// ============================================================================
// Source parsing (no plugin imports)
// ============================================================================

interface PluginCandidate {
  directory: string;
  path: string;
  entryPath: string;
  manifestPath: string;
}

interface ParsedPlugin {
  candidate: PluginCandidate;
  manifest: ResolvedManifest;
  entryExists: boolean;
  hasFactoryExport: boolean;
  hasDefaultExport: boolean;
  slots: ParsedSlot[];
}

interface ValidationContext {
  repoRoot: string;
  capabilities: ReadonlySet<string>;
  zones: ReadonlySet<string>;
  duplicateIds: ReadonlySet<string>;
  allowlist: readonly AllowlistEntry[];
}

const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

const COMPARATOR_RE =
  /^(?:\^|~|>=|<=|>|<|=)?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/;

function isIdentifierStart(char: string | undefined): boolean {
  return char !== undefined && /[A-Za-z_$]/.test(char);
}

function isIdentifierPart(char: string | undefined): boolean {
  return char !== undefined && /[A-Za-z0-9_$]/.test(char);
}

/** Skip a quoted string or template literal and return the index after it. */
function skipQuoted(source: string, start: number): number {
  const quote = source[start];
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === "\\") {
      index += 2;
      continue;
    }
    if (source[index] === quote) return index + 1;
    index += 1;
  }
  return source.length;
}

/** Remove line and block comments while preserving strings and template literals. */
function stripComments(source: string): string {
  let result = "";
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (char === '"' || char === "'" || char === "`") {
      const end = skipQuoted(source, index);
      result += source.slice(index, end);
      index = end;
      continue;
    }
    if (char === "/" && source[index + 1] === "/") {
      const end = source.indexOf("\n", index);
      index = end === -1 ? source.length : end;
      continue;
    }
    if (char === "/" && source[index + 1] === "*") {
      const end = source.indexOf("*/", index + 2);
      index = end === -1 ? source.length : end + 2;
      continue;
    }
    result += char;
    index += 1;
  }
  return result;
}

/** Find the closing brace/bracket/paren for `openIndex`, skipping strings. */
function findMatching(source: string, openIndex: number): number {
  const open = source[openIndex];
  const close = open === "{" ? "}" : open === "[" ? "]" : open === "(" ? ")" : null;
  if (close === null) return -1;

  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"' || char === "'" || char === "`") {
      index = skipQuoted(source, index) - 1;
      continue;
    }
    if (char === open) {
      depth += 1;
    } else if (char === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/** Locate a top-level `key:` property in an object literal and return its value offset. */
function findTopLevelProperty(objectText: string, key: string): { valueStart: number } | null {
  let depth = 0;
  for (let index = 0; index < objectText.length; index += 1) {
    const char = objectText[index];
    if (char === '"' || char === "'" || char === "`") {
      index = skipQuoted(objectText, index) - 1;
      continue;
    }
    if (char === "{" || char === "[" || char === "(") {
      depth += 1;
      continue;
    }
    if (char === "}" || char === "]" || char === ")") {
      depth -= 1;
      continue;
    }
    if (depth !== 1 || !isIdentifierStart(char)) continue;

    const start = index;
    while (index < objectText.length && isIdentifierPart(objectText[index])) index += 1;
    const identifier = objectText.slice(start, index);
    if (identifier !== key) {
      index -= 1;
      continue;
    }

    let cursor = index;
    while (cursor < objectText.length && /\s/.test(objectText[cursor])) cursor += 1;
    if (objectText[cursor] !== ":") {
      index -= 1;
      continue;
    }
    cursor += 1;
    while (cursor < objectText.length && /\s/.test(objectText[cursor])) cursor += 1;
    return { valueStart: cursor };
  }
  return null;
}

function unescapeString(raw: string): string {
  return raw.replace(/\\(["'`\\nrt])/g, (_match, code: string) => {
    switch (code) {
      case "n":
        return "\n";
      case "r":
        return "\r";
      case "t":
        return "\t";
      default:
        return code;
    }
  });
}

function readStringAt(source: string, start: number): string | null {
  const quote = source[start];
  if (quote !== '"' && quote !== "'" && quote !== "`") return null;
  const end = skipQuoted(source, start);
  if (end <= start + 1) return "";
  return unescapeString(source.slice(start + 1, end - 1));
}

function readStringProperty(objectText: string, key: string): string | null {
  const property = findTopLevelProperty(objectText, key);
  if (!property) return null;
  return readStringAt(objectText, property.valueStart);
}

function readStringLiterals(source: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char !== '"' && char !== "'" && char !== "`") continue;
    const end = skipQuoted(source, index);
    values.push(unescapeString(source.slice(index + 1, end - 1)));
    index = end - 1;
  }
  return values;
}

function readStringArrayProperty(objectText: string, key: string): string[] | null {
  const property = findTopLevelProperty(objectText, key);
  if (!property || objectText[property.valueStart] !== "[") return null;
  const end = findMatching(objectText, property.valueStart);
  if (end === -1) return null;
  return readStringLiterals(objectText.slice(property.valueStart + 1, end));
}

/** Read a `key: { ... }` value from an object literal. */
function readObjectProperty(objectText: string, key: string): string | null {
  const property = findTopLevelProperty(objectText, key);
  if (!property || objectText[property.valueStart] !== "{") return null;
  const end = findMatching(objectText, property.valueStart);
  return end === -1 ? null : objectText.slice(property.valueStart, end + 1);
}

/** Extract the object passed to an exported `definePlugin`/`createPlugin` call. */
function extractFactoryObject(source: string): string | null {
  const match =
    /\bexport\s+(?:const|let|var)\s+[A-Za-z0-9_$]+\s*=\s*(?:definePlugin|createPlugin)\s*\(\s*\{/.exec(
      source,
    ) ?? /\b(?:definePlugin|createPlugin)\s*\(\s*\{/.exec(source);
  if (!match) return null;
  const open = source.indexOf("{", match.index);
  const end = findMatching(source, open);
  return end === -1 ? null : source.slice(open, end + 1);
}

/** Fallback for plain object exports: the first `key: { ... }` in the file. */
function extractFirstObjectProperty(source: string, key: string): string | null {
  const match = new RegExp(`\\b${key}\\s*:\\s*\\{`, "m").exec(source);
  if (!match) return null;
  const open = source.indexOf("{", match.index);
  const end = findMatching(source, open);
  return end === -1 ? null : source.slice(open, end + 1);
}

/** Parse object literals from a literal array such as `[{ ... }, { ... }]`. */
function parseObjectArray(arrayText: string): string[] {
  const objects: string[] = [];
  let index = 1;
  while (index < arrayText.length - 1) {
    const char = arrayText[index];
    if (char === '"' || char === "'" || char === "`") {
      index = skipQuoted(arrayText, index);
      continue;
    }
    if (char === "{") {
      const end = findMatching(arrayText, index);
      if (end === -1) break;
      objects.push(arrayText.slice(index, end + 1));
      index = end + 1;
      continue;
    }
    index += 1;
  }
  return objects;
}

/** Direct `slotRegistry.register({ ... })` calls used outside `ui.slots`. */
function extractRegisteredSlotObjects(source: string): string[] {
  const objects: string[] = [];
  const regex = /\bslotRegistry\s*\.\s*register\s*\(\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source)) !== null) {
    const open = source.indexOf("{", match.index);
    const end = findMatching(source, open);
    if (end === -1) break;
    objects.push(source.slice(open, end + 1));
    regex.lastIndex = end + 1;
  }
  return objects;
}

function parseSlots(source: string, pluginObject: string | null): ParsedSlot[] {
  const objects: string[] = [];

  if (pluginObject) {
    const uiObject = readObjectProperty(pluginObject, "ui");
    if (uiObject) {
      const slots = findTopLevelProperty(uiObject, "slots");
      if (slots && uiObject[slots.valueStart] === "[") {
        const end = findMatching(uiObject, slots.valueStart);
        if (end !== -1) {
          objects.push(...parseObjectArray(uiObject.slice(slots.valueStart, end + 1)));
        }
      }
    }
  }

  objects.push(...extractRegisteredSlotObjects(source));

  return objects.map((objectText) => ({
    id: readStringProperty(objectText, "id"),
    zone: readStringProperty(objectText, "zone"),
    permissions: readStringArrayProperty(objectText, "permissions") ?? [],
  }));
}

// ============================================================================
// Manifest parsing
// ============================================================================

function emptyManifest(source: ManifestSource, sourcePath: string | null): ResolvedManifest {
  return {
    id: null,
    name: null,
    description: null,
    version: null,
    cmsVersionRange: null,
    cmsVersionRangeInherited: false,
    permissions: null,
    permissionsDeclared: false,
    source,
    sourcePath,
    error: null,
  };
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJsonString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readLocalizedString(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (!isJsonRecord(value)) return null;
  const english = value.en;
  if (typeof english === "string" && english.trim()) return english.trim();
  const first = Object.values(value).find((entry) => typeof entry === "string");
  return typeof first === "string" && first.trim() ? first.trim() : null;
}

function readJsonStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const values: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return null;
    values.push(item);
  }
  return values;
}

function parseJsonManifest(source: string, sourcePath: string): ResolvedManifest {
  const manifest = emptyManifest("plugin.json", sourcePath);
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    return {
      ...manifest,
      error: `invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (!isJsonRecord(value)) {
    return { ...manifest, error: "plugin.json must contain a JSON object" };
  }

  const permissionsValue = value.permissions ?? value.capabilities;
  const permissions = readJsonStringArray(permissionsValue);

  return {
    ...manifest,
    id: readJsonString(value.id),
    name: readLocalizedString(value.name) ?? readLocalizedString(value.displayName),
    description: readLocalizedString(value.description),
    version: readJsonString(value.version),
    cmsVersionRange: readJsonString(value.cmsVersionRange),
    permissions,
    permissionsDeclared: permissionsValue !== undefined,
    error:
      permissionsValue !== undefined && permissions === null
        ? "permissions must be an array of strings"
        : null,
  };
}

function parseEntryManifest(
  sourcePath: string,
  pluginObject: string | null,
  cleanedSource: string,
  hostVersion: string,
): ResolvedManifest {
  const metadataObject = pluginObject
    ? readObjectProperty(pluginObject, "metadata")
    : extractFirstObjectProperty(cleanedSource, "metadata");

  if (!metadataObject) return emptyManifest("none", null);

  const capabilitiesProperty = findTopLevelProperty(metadataObject, "capabilities");
  // `PluginMetadata.capabilities` is optional: an omitted list means the plugin
  // declares no runtime capabilities. Normalizing to `[]` keeps entry metadata
  // and `plugin.json` on the same resolved-manifest shape.
  const permissions =
    capabilitiesProperty === null ? [] : readStringArrayProperty(metadataObject, "capabilities");
  const explicitRange = readStringProperty(metadataObject, "cmsVersionRange");

  return {
    id: readStringProperty(metadataObject, "id"),
    name: readStringProperty(metadataObject, "name"),
    description: readStringProperty(metadataObject, "description"),
    version: readStringProperty(metadataObject, "version"),
    cmsVersionRange: explicitRange ?? `>=${hostVersion}`,
    cmsVersionRangeInherited: explicitRange === null,
    permissions,
    permissionsDeclared: capabilitiesProperty !== null,
    source: "entry-metadata",
    sourcePath,
    error:
      capabilitiesProperty !== null && permissions === null
        ? "metadata.capabilities must be a literal array of strings"
        : null,
  };
}

function parsePlugin(candidate: PluginCandidate, hostVersion: string): ParsedPlugin {
  const entryExists = existsSync(candidate.entryPath);
  const entrySource = entryExists ? readFileSync(candidate.entryPath, "utf8") : "";
  const cleanedSource = stripComments(entrySource);
  const pluginObject = extractFactoryObject(cleanedSource);
  const hasFactoryExport =
    /\bexport\s+(?:const|let|var)\s+[A-Za-z0-9_$]+\s*=\s*(?:definePlugin|createPlugin)\s*\(/.test(
      cleanedSource,
    ) ||
    /\bexport\s+default\s+(?:definePlugin|createPlugin)\s*\(/.test(cleanedSource) ||
    (/\b(?:definePlugin|createPlugin)\s*\(/.test(cleanedSource) &&
      /\bexport\s+(?:default|\{)/.test(cleanedSource));
  const hasDefaultExport = /\bexport\s+default\b/.test(cleanedSource);
  const manifestExists = existsSync(candidate.manifestPath);

  const manifest = manifestExists
    ? parseJsonManifest(readFileSync(candidate.manifestPath, "utf8"), candidate.manifestPath)
    : parseEntryManifest(candidate.entryPath, pluginObject, cleanedSource, hostVersion);

  return {
    candidate,
    manifest,
    entryExists,
    hasFactoryExport,
    hasDefaultExport,
    slots: entryExists ? parseSlots(cleanedSource, pluginObject) : [],
  };
}

// ============================================================================
// Canonical registries (read from source; no duplicated lists)
// ============================================================================

/**
 * `PluginCapability` and `InjectionZone` are type-only unions, so they cannot
 * be imported at runtime. Reading the canonical declaration keeps this script
 * aligned with the compiler instead of maintaining a parallel string list.
 */
function readTypeUnion(repoRoot: string, typeName: string): string[] {
  const file = join(repoRoot, "src", "plugins", "types.ts");
  const source = stripComments(readFileSync(file, "utf8"));
  const match = new RegExp(`export\\s+type\\s+${typeName}\\s*=\\s*([\\s\\S]*?);`).exec(source);
  if (!match) {
    throw new Error(`[conformance] could not find the ${typeName} union in ${file}`);
  }
  return readStringLiterals(match[1]);
}

function readHostVersion(repoRoot: string): string {
  const file = join(repoRoot, "package.json");
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(
      `[conformance] could not read ${file}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const version = isJsonRecord(value) ? readJsonString(value.version) : null;
  if (!version || !isStrictSemver(version)) {
    throw new Error(`[conformance] ${file} has no strict SemVer "version" field`);
  }
  return version;
}

// ============================================================================
// Validation
// ============================================================================

export function isStrictSemver(value: string): boolean {
  return SEMVER_RE.test(value.trim());
}

/**
 * Accepts the range shapes the plugin contract uses: `*`, exact versions, and
 * comparator sets (`>=`, `>`, `<=`, `<`, `=`, `^`, `~`) joined by whitespace or
 * `||`. Hyphen ranges are intentionally out of scope.
 */
export function isValidCmsVersionRange(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return trimmed.split("||").every((alternative) => {
    const comparators = alternative.trim().split(/\s+/).filter(Boolean);
    if (comparators.length === 0) return false;
    return comparators.every((comparator) => {
      if (comparator === "*") return true;
      const match = COMPARATOR_RE.exec(comparator);
      return match !== null && isStrictSemver(match[1]);
    });
  });
}

function makeCheck(
  id: ConformanceCheckId,
  ok: boolean,
  passMessage: string,
  failMessage: string,
  details: string[] = [],
): ConformanceCheck {
  return {
    id,
    status: ok ? "pass" : "fail",
    message: ok ? passMessage : failMessage,
    details,
  };
}

function applyAllowlist(
  checks: ConformanceCheck[],
  directory: string,
  pluginId: string | null,
  allowlist: readonly AllowlistEntry[],
): void {
  for (const check of checks) {
    if (check.status !== "fail") continue;
    const entry = allowlist.find(
      (candidate) =>
        candidate.check === check.id &&
        (candidate.plugin === pluginId || candidate.plugin === directory),
    );
    if (!entry) continue;
    check.status = "allowlisted";
    check.message = `allowlisted: ${entry.reason} (follow-up: ${entry.followUp})`;
  }
}

function validatePlugin(plugin: ParsedPlugin, context: ValidationContext): PluginAudit {
  const { candidate, manifest } = plugin;
  const checks: ConformanceCheck[] = [];
  const sourceLabel = manifest.sourcePath
    ? toRelativePath(context.repoRoot, manifest.sourcePath)
    : manifest.source;

  const manifestProblems: string[] = [];
  if (manifest.source === "none") {
    manifestProblems.push("no plugin.json and no metadata export in index.ts");
  }
  if (manifest.error) manifestProblems.push(manifest.error);
  if (!manifest.id) manifestProblems.push("missing id");
  if (!manifest.name) manifestProblems.push("missing name");
  if (!manifest.description) manifestProblems.push("missing description");
  if (!manifest.version) manifestProblems.push("missing version");
  if (!manifest.cmsVersionRange) manifestProblems.push("missing cmsVersionRange");
  if (manifest.permissions === null) {
    manifestProblems.push("permissions must be an array of capability ids");
  }
  checks.push(
    makeCheck(
      "manifest",
      manifestProblems.length === 0,
      `manifest resolved from ${sourceLabel}`,
      "manifest is incomplete",
      manifestProblems,
    ),
  );

  const entryProblem = !plugin.entryExists
    ? "missing index.ts entry point"
    : plugin.hasFactoryExport || plugin.hasDefaultExport
      ? null
      : "index.ts does not export definePlugin(...) or a default plugin";
  checks.push(
    makeCheck(
      "entry-point",
      entryProblem === null,
      "entry point exports a plugin factory or default",
      "entry point is not a plugin package",
      entryProblem ? [entryProblem] : [],
    ),
  );

  const versionProblem = !manifest.version
    ? "missing version"
    : isStrictSemver(manifest.version)
      ? null
      : `version "${manifest.version}" is not strict SemVer`;
  checks.push(
    makeCheck(
      "version",
      versionProblem === null,
      `version ${manifest.version} is strict SemVer`,
      "version is not strict SemVer",
      versionProblem ? [versionProblem] : [],
    ),
  );

  const rangeProblem = !manifest.cmsVersionRange
    ? "missing cmsVersionRange"
    : isValidCmsVersionRange(manifest.cmsVersionRange)
      ? null
      : `cmsVersionRange "${manifest.cmsVersionRange}" is not a supported range`;
  const rangeMessage = manifest.cmsVersionRangeInherited
    ? `cmsVersionRange inherited from host version (${manifest.cmsVersionRange})`
    : `cmsVersionRange ${manifest.cmsVersionRange}`;
  checks.push(
    makeCheck(
      "cms-version-range",
      rangeProblem === null,
      rangeMessage,
      "cmsVersionRange is missing or invalid",
      rangeProblem ? [rangeProblem] : [],
    ),
  );

  const permissionProblems: string[] = [];
  if (manifest.permissions !== null) {
    const seen = new Set<string>();
    for (const permission of manifest.permissions) {
      if (!context.capabilities.has(permission)) {
        permissionProblems.push(`unknown capability "${permission}"`);
      }
      if (seen.has(permission)) {
        permissionProblems.push(`duplicate capability "${permission}"`);
      }
      seen.add(permission);
    }
  }
  const permissionsMessage =
    manifest.permissions === null
      ? "permissions must be an array of capability ids"
      : manifest.permissions.length === 0
        ? "no runtime capabilities declared"
        : `${manifest.permissions.length} declared capability(ies) are known`;
  checks.push(
    makeCheck(
      "permissions",
      manifest.permissions !== null && permissionProblems.length === 0,
      permissionsMessage,
      "permissions do not match the PluginCapability registry",
      permissionProblems,
    ),
  );

  const slotProblems: string[] = [];
  const slotIds = new Set<string>();
  for (const slot of plugin.slots) {
    const label = slot.id ? `slot "${slot.id}"` : "unnamed slot";
    if (!slot.id) slotProblems.push(`${label} is missing an id`);
    if (!slot.zone) {
      slotProblems.push(`${label} is missing a zone`);
    } else if (!context.zones.has(slot.zone)) {
      slotProblems.push(`${label} uses unknown zone "${slot.zone}"`);
    }
    if (slot.id) {
      if (slotIds.has(slot.id)) {
        slotProblems.push(`${label} reuses an id within the plugin`);
      }
      slotIds.add(slot.id);
    }
  }
  checks.push(
    makeCheck(
      "slots",
      slotProblems.length === 0,
      plugin.slots.length === 0
        ? "no UI slots declared"
        : `${plugin.slots.length} slot(s) use known InjectionZone values`,
      "UI slots do not match the InjectionZone registry",
      slotProblems,
    ),
  );

  const idProblem = !manifest.id
    ? "missing id"
    : manifest.id === candidate.directory
      ? null
      : `id "${manifest.id}" does not match directory "${candidate.directory}"`;
  checks.push(
    makeCheck(
      "id",
      idProblem === null,
      `id matches directory "${candidate.directory}"`,
      "id does not match directory",
      idProblem ? [idProblem] : [],
    ),
  );

  const duplicateProblem = !manifest.id
    ? "missing id"
    : context.duplicateIds.has(manifest.id)
      ? `id "${manifest.id}" is declared by more than one plugin`
      : null;
  checks.push(
    makeCheck(
      "duplicate-id",
      duplicateProblem === null,
      `id "${manifest.id}" is unique`,
      "duplicate plugin id",
      duplicateProblem ? [duplicateProblem] : [],
    ),
  );

  applyAllowlist(checks, candidate.directory, manifest.id, context.allowlist);

  return {
    directory: candidate.directory,
    pluginId: manifest.id,
    manifestSource: manifest.source,
    entryPath: toRelativePath(context.repoRoot, candidate.entryPath),
    manifest: {
      ...manifest,
      sourcePath: manifest.sourcePath
        ? toRelativePath(context.repoRoot, manifest.sourcePath)
        : null,
    },
    ok: checks.every((check) => check.status !== "fail"),
    checks,
  };
}

// ============================================================================
// Audit entry point
// ============================================================================

function toRelativePath(repoRoot: string, target: string): string {
  const value = relative(repoRoot, target).replaceAll("\\", "/");
  return value || ".";
}

export function auditPlugins(options: AuditOptions): AuditReport {
  const repoRoot = resolve(options.repoRoot);
  const pluginsRoot = resolve(options.pluginsRoot ?? join(repoRoot, "src", "plugins"));
  const hostVersion = options.hostVersion ?? readHostVersion(repoRoot);

  if (!isStrictSemver(hostVersion)) {
    throw new Error(`[conformance] host version "${hostVersion}" is not strict SemVer`);
  }
  if (!existsSync(pluginsRoot)) {
    throw new Error(`[conformance] plugins directory not found: ${pluginsRoot}`);
  }

  const capabilities = new Set(readTypeUnion(repoRoot, "PluginCapability"));
  const zones = new Set(readTypeUnion(repoRoot, "InjectionZone"));
  const allowlist = options.allowlist ?? ALLOWLIST;

  const entries = readdirSync(pluginsRoot, { withFileTypes: true });
  const skippedDirectories = entries
    .filter((entry) => entry.isDirectory() && NON_PLUGIN_DIRECTORIES.has(entry.name))
    .map((entry) => entry.name)
    .sort();
  const directories = entries
    .filter((entry) => entry.isDirectory() && !NON_PLUGIN_DIRECTORIES.has(entry.name))
    .map((entry) => entry.name)
    .sort();

  const parsed = directories.map((directory) => {
    const path = join(pluginsRoot, directory);
    return parsePlugin(
      {
        directory,
        path,
        entryPath: join(path, "index.ts"),
        manifestPath: join(path, "plugin.json"),
      },
      hostVersion,
    );
  });

  const idCounts = new Map<string, number>();
  for (const plugin of parsed) {
    if (!plugin.manifest.id) continue;
    idCounts.set(plugin.manifest.id, (idCounts.get(plugin.manifest.id) ?? 0) + 1);
  }
  const duplicateIds = new Set(
    [...idCounts.entries()].filter(([, count]) => count > 1).map(([id]) => id),
  );

  const context: ValidationContext = {
    repoRoot,
    capabilities,
    zones,
    duplicateIds,
    allowlist,
  };
  const plugins = parsed.map((plugin) => validatePlugin(plugin, context));
  const passed = plugins.filter((plugin) => plugin.ok).length;
  const allowlistedChecks = plugins.reduce(
    (total, plugin) =>
      total + plugin.checks.filter((check) => check.status === "allowlisted").length,
    0,
  );
  const allowlistedPlugins = plugins.filter((plugin) =>
    plugin.checks.some((check) => check.status === "allowlisted"),
  ).length;

  return {
    ok: passed === plugins.length,
    pluginsRoot: toRelativePath(repoRoot, pluginsRoot),
    hostVersion,
    summary: {
      total: plugins.length,
      passed,
      failed: plugins.length - passed,
      allowlistedPlugins,
      allowlistedChecks,
    },
    allowlist,
    skippedDirectories,
    plugins,
  };
}

// ============================================================================
// Output
// ============================================================================

function resultLabel(plugin: PluginAudit): string {
  if (!plugin.ok) return "FAIL";
  return plugin.checks.some((check) => check.status === "allowlisted") ? "ALLOW" : "PASS";
}

export function formatHumanReport(report: AuditReport, verbose: boolean): string {
  const lines: string[] = [];
  const directoryWidth = Math.max(6, ...report.plugins.map((plugin) => plugin.directory.length));
  const sourceWidth = Math.max(8, ...report.plugins.map((plugin) => plugin.manifestSource.length));

  lines.push(
    `SveltyCMS plugin conformance — ${report.summary.total} package(s), host ${report.hostVersion}`,
  );
  lines.push("");
  lines.push(
    `${"Plugin".padEnd(directoryWidth)}  ${"Manifest".padEnd(sourceWidth)}  Result  Checks`,
  );
  lines.push(`${"-".repeat(directoryWidth)}  ${"-".repeat(sourceWidth)}  ------  ------`);

  for (const plugin of report.plugins) {
    const passed = plugin.checks.filter((check) => check.status !== "fail").length;
    lines.push(
      `${plugin.directory.padEnd(directoryWidth)}  ${plugin.manifestSource.padEnd(sourceWidth)}  ${resultLabel(plugin).padEnd(6)}  ${passed}/${plugin.checks.length}`,
    );
    if (verbose) {
      for (const check of plugin.checks) {
        const status =
          check.status === "pass" ? "PASS" : check.status === "allowlisted" ? "ALLOW" : "FAIL";
        lines.push(`  ${status} ${check.id} — ${check.message}`);
        for (const detail of check.details) lines.push(`       ${detail}`);
      }
    }
  }

  const failures = report.plugins.filter((plugin) => !plugin.ok);
  if (failures.length > 0) {
    lines.push("");
    lines.push("Failures:");
    for (const plugin of failures) {
      lines.push(`  ${plugin.directory}${plugin.pluginId ? ` (${plugin.pluginId})` : ""}`);
      for (const check of plugin.checks.filter((item) => item.status === "fail")) {
        lines.push(`    ${check.id}: ${check.message}`);
        for (const detail of check.details) lines.push(`      ${detail}`);
      }
    }
  }

  lines.push("");
  lines.push(
    `Summary: ${report.summary.passed} passed, ${report.summary.failed} failed, ${report.summary.allowlistedChecks} allowlisted check(s).`,
  );
  if (report.skippedDirectories.length > 0) {
    lines.push(`Skipped non-plugin directories: ${report.skippedDirectories.join(", ")}.`);
  }
  return lines.join("\n");
}

// ============================================================================
// CLI
// ============================================================================

function usage(): string {
  return [
    "Usage: bun run marketplace:conformance [--check] [--json] [--verbose]",
    "",
    "  --check    exit 1 on any failure (default; accepted for CI symmetry)",
    "  --json     emit the machine-readable report",
    "  --verbose  print every check for every plugin",
  ].join("\n");
}

function runCli(argv: readonly string[]): number {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(usage());
    return 0;
  }

  const report = auditPlugins({ repoRoot: process.cwd() });

  if (argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatHumanReport(report, argv.includes("--verbose")));
  }

  return report.ok ? 0 : 1;
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  const normalized = entry.replaceAll("\\", "/");
  return (
    normalized === "scripts/marketplace/conformance.ts" ||
    normalized.endsWith("/scripts/marketplace/conformance.ts")
  );
}

if (isDirectRun()) {
  try {
    process.exitCode = runCli(process.argv.slice(2));
  } catch (error) {
    console.error(`[conformance] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
