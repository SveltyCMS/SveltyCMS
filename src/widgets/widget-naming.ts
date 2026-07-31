/**
 * @file src/widgets/widget-naming.ts
 * @description Single naming convention for SveltyCMS widgets.
 *
 * ### Convention (one rule set)
 * | Layer            | Format      | Example              |
 * |------------------|-------------|----------------------|
 * | Folder           | kebab-case  | `phone-number/`      |
 * | Factory `Name`   | PascalCase  | `"PhoneNumber"`      |
 * | Schema field     | factory Name| `{ Name: "PhoneNumber" }` |
 *
 * Invariant: `widgetNameToFolder(Name) === folderName`
 * e.g. `PhoneNumber` → `phone-number`, `SEO` → `seo`, `AIEnrichment` → `ai-enrichment`
 *
 * Used by: scanner paths, registry registration, marketplace/custom boot.
 * This module does **not** invent aliases — it enforces the one convention.
 */

/** kebab-case folder segment under core|custom|marketplace */
const FOLDER_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/** Factory Name: PascalCase or acronyms (SEO, AIEnrichment) */
const NAME_RE = /^[A-Z][A-Za-z0-9]*$/;

/**
 * Widget component roots: core, first-party custom, and marketplace portable modules.
 */
export const WIDGET_COMPONENT_ROOTS = ["core", "custom", "marketplace"] as const;

export type WidgetTier = "core" | "custom" | "marketplace";

export interface WidgetNamingResult {
  /** True when folder + Name obey the convention */
  ok: boolean;
  /** Folder segment (kebab-case) */
  folder: string;
  /** Canonical factory Name to register under */
  name: string;
  /** Human-readable issues (empty when ok) */
  errors: string[];
  /** Non-fatal notes */
  warnings: string[];
}

/**
 * Factory `Name` → folder segment (kebab-case).
 * `RichText` → `rich-text`, `MediaUpload` → `media-upload`, `SEO` → `seo`
 */
export function widgetNameToFolder(widgetName: string): string {
  if (!widgetName) return "";
  return widgetName
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

/**
 * Folder kebab-case → best-effort PascalCase Name.
 * Prefer explicit `Name` on the factory; use this only when Name is missing.
 * `phone-number` → `PhoneNumber` (not suitable for acronyms like SEO — declare Name).
 */
export function folderToWidgetName(folder: string): string {
  if (!folder) return "";
  return folder
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("");
}

export function isValidWidgetFolder(folder: string): boolean {
  return typeof folder === "string" && FOLDER_RE.test(folder);
}

export function isValidWidgetName(name: string): boolean {
  return typeof name === "string" && NAME_RE.test(name);
}

/**
 * Extract the widget folder segment from a module path.
 * Folder-nested widgets: `./custom/phone-number/index.ts` → `phone-number`,
 * `src/widgets/marketplace/foo-bar/index.ts` → `foo-bar`, `…/phone-number/Input.svelte` → `phone-number`.
 * Single-file modules directly under a root: `./custom/phone-number.ts` → `phone-number`
 * (base name without extension). Root-level shared components like `./core/Input.svelte`
 * resolve to `Input` and then fail the kebab-case check loudly — they are never
 * misreported as belonging to the root folder.
 */
export function folderFromWidgetPath(modulePath: string): string | null {
  if (!modulePath) return null;
  const normalized = modulePath.replace(/\\/g, "/");
  const parts = normalized.split("/").filter((p) => p !== "" && p !== "." && p !== "..");
  if (parts.length < 2) return null;

  const file = parts.at(-1) ?? "";
  const parent = parts.at(-2)!;
  if (
    (WIDGET_COMPONENT_ROOTS as readonly string[]).includes(parent) &&
    /\.(ts|js|mts|cts|svelte)$/i.test(file)
  ) {
    return file.replace(/\.(ts|js|mts|cts|svelte)$/i, "") || null;
  }
  // Folder-nested widget: the segment before the filename is the widget folder.
  return parent;
}

/**
 * Validate folder + factory Name against the single convention.
 *
 * @param folder - Directory name under core|custom|marketplace
 * @param declaredName - `createWidget({ Name })` value (optional)
 * @param tier - core is lenient (warn); custom/marketplace fail closed
 */
export function validateWidgetNaming(
  folder: string,
  declaredName: string | undefined | null,
  tier: WidgetTier = "custom",
): WidgetNamingResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!folder || !isValidWidgetFolder(folder)) {
    errors.push(
      `Folder "${folder || "(empty)"}" must be kebab-case (e.g. phone-number, seo). See docs/development/widgets/.`,
    );
  }

  let name = (declaredName && String(declaredName).trim()) || "";

  if (!name) {
    if (folder && isValidWidgetFolder(folder)) {
      name = folderToWidgetName(folder);
      const msg = `Missing factory Name — derived "${name}" from folder "${folder}". Set Name: "${name}" explicitly in createWidget().`;
      if (tier === "core") {
        // Core is lenient: in-repo widgets are verified by check-widget-naming.mjs.
        warnings.push(msg);
      } else {
        // Custom + marketplace fail closed: title-cased derivation cannot
        // preserve acronyms (seo → Seo ≠ SEO), so the schema field would
        // miss the registry entry. Authors must declare Name explicitly.
        errors.push(msg);
      }
    } else {
      errors.push(`Factory Name is required (PascalCase, e.g. PhoneNumber).`);
    }
  } else if (!isValidWidgetName(name)) {
    errors.push(
      `Factory Name "${name}" must be PascalCase / acronym (e.g. PhoneNumber, SEO), not kebab-case or lowercase.`,
    );
  }

  if (name && folder && isValidWidgetFolder(folder) && isValidWidgetName(name)) {
    const expectedFolder = widgetNameToFolder(name);
    if (expectedFolder !== folder) {
      const msg = `Name "${name}" maps to folder "${expectedFolder}" but lives in "${folder}". Rename the folder or set Name so widgetNameToFolder(Name) === folder.`;
      if (tier === "core") {
        warnings.push(msg);
      } else {
        // custom + marketplace: fail closed so portable modules stay loadable
        errors.push(msg);
      }
    }
  }

  const ok = errors.length === 0 && !!name && !!folder;
  return {
    ok,
    folder: folder || "",
    name: name || folderToWidgetName(folder) || "Unknown",
    errors,
    warnings,
  };
}
