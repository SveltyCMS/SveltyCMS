/**
 * @file src/utils/theme-preset-mapper.ts
 * @description Maps Skeleton.dev theme generator exports to SveltyCMS admin runtime CSS.
 *
 * Skeleton presets use the same Tailwind v4 `--color-{palette}-{shade}` tokens as SveltyCMS.
 * This module scopes imported values under `.admin-theme-container` and `[data-admin-theme]`
 * so admin utilities (`bg-primary-500`, `text-tertiary-500`, etc.) update without editing `app.css`.
 *
 * ### Features:
 * - JSON `properties` map parsing (full `--color-*` tokens or shorthand palettes)
 * - shorthand palette expansion (`primary: "#0f766e"` → 50–950 shade scale via `color-mix`)
 * - optional Skeleton CSS string extraction
 * - palette alias mapping (`accent` → `tertiary`)
 * - safe value filtering (colors, lengths, fonts)
 * - admin radius token bridging
 */

/** Skeleton palette names that differ from SveltyCMS naming */
const PALETTE_ALIASES: Record<string, string> = {
  accent: "tertiary",
};

/** Shorthand palette keys in `/src/themes/*.json` (e.g. `"primary": "#0f766e"`) */
export const SHORTHAND_PALETTES = new Set([
  "primary",
  "secondary",
  "tertiary",
  "accent",
  "success",
  "warning",
  "error",
  "surface",
]);

const SHADE_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

/** Base color % when mixing lighter shades from a 500 anchor */
const LIGHTER_BASE_PERCENT: Partial<Record<(typeof SHADE_STEPS)[number], number>> = {
  50: 8,
  100: 16,
  200: 30,
  300: 46,
  400: 68,
};

/** Base color % when mixing darker shades from a 500 anchor */
const DARKER_BASE_PERCENT: Partial<Record<(typeof SHADE_STEPS)[number], number>> = {
  600: 88,
  700: 74,
  800: 58,
  900: 42,
  950: 28,
};

/** Base color % when mixing darker surface shades from a 50 anchor */
const SURFACE_DARKER_BASE_PERCENT: Partial<Record<(typeof SHADE_STEPS)[number], number>> = {
  100: 96,
  200: 90,
  300: 82,
  400: 72,
  500: 60,
  600: 48,
  700: 36,
  800: 24,
  900: 14,
  950: 8,
};

/** Property prefixes allowed into generated admin CSS */
const ALLOWED_PROPERTY_PREFIXES = [
  "--color-",
  "--radius-",
  "--spacing",
  "--text-scaling",
  "--base-font-",
  "--heading-font-",
  "--anchor-font-",
  "--body-background-color",
  "--default-border-width",
  "--default-divide-width",
  "--default-ring-width",
] as const;

const ADMIN_SCOPE_SELECTOR = ".admin-theme-container, [data-admin-theme]";

export interface SkeletonMappedTheme {
  name: string;
  customCss: string;
  presetSource: "imported";
}

/** Detect Skeleton theme generator JSON (`{ name, properties: { ... } }`) */
export function isSkeletonPreset(preset: Record<string, unknown>): boolean {
  return (
    "properties" in preset &&
    preset.properties !== null &&
    typeof preset.properties === "object" &&
    !Array.isArray(preset.properties)
  );
}

/** Detect pasted Skeleton CSS export (`[data-theme='...'] { ... }`) */
export function isSkeletonCssExport(value: string): boolean {
  return /\[data-theme\s*=/.test(value) || /--color-primary-\d{2,3}\s*:/.test(value);
}

function remapPropertyName(key: string): string | null {
  const accentMatch = key.match(/^--color-accent(-|$)/);
  if (accentMatch) {
    return key.replace(/^--color-accent/, "--color-tertiary");
  }

  for (const [from, to] of Object.entries(PALETTE_ALIASES)) {
    const aliasMatch = key.match(new RegExp(`^--color-${from}(-|$)`));
    if (aliasMatch) {
      return key.replace(new RegExp(`^--color-${from}`), `--color-${to}`);
    }
  }

  for (const prefix of ALLOWED_PROPERTY_PREFIXES) {
    if (key.startsWith(prefix)) return key;
  }

  return null;
}

function isSafeCssValue(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (/url\s*\(/i.test(v)) return false;
  if (/javascript\s*:/i.test(v)) return false;
  if (/expression\s*\(/i.test(v)) return false;
  if (/@import/i.test(v)) return false;
  if (/<[^>]+>/.test(v)) return false;
  return true;
}

/** Extract `--property: value;` pairs from Skeleton CSS export text */
export function parseSkeletonCssBlock(css: string): Record<string, string> {
  const props: Record<string, string> = {};
  const declRe = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let match: RegExpExecArray | null;
  while ((match = declRe.exec(css)) !== null) {
    props[match[1]] = match[2].trim();
  }
  return props;
}

function isLightColor(value: string): boolean {
  const hex = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const normalized =
      hex[1].length === 3
        ? hex[1]
            .split("")
            .map((c) => c + c)
            .join("")
        : hex[1];
    const r = parseInt(normalized.slice(0, 2), 16) / 255;
    const g = parseInt(normalized.slice(2, 4), 16) / 255;
    const b = parseInt(normalized.slice(4, 6), 16) / 255;
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luminance > 0.85;
  }

  const oklch = value.match(/oklch\(\s*([\d.]+)/i);
  if (oklch) return parseFloat(oklch[1]) > 0.85;

  return false;
}

function mixWithWhite(color: string, basePercent: number): string {
  return `color-mix(in oklch, ${color} ${basePercent}%, white)`;
}

function mixWithBlack(color: string, basePercent: number): string {
  return `color-mix(in oklch, ${color} ${basePercent}%, black)`;
}

function resolvePaletteName(key: string): string | null {
  if (SHORTHAND_PALETTES.has(key)) {
    return PALETTE_ALIASES[key] ?? key;
  }
  return null;
}

/** Expand shorthand palette entries to full `--color-{palette}-{shade}` maps */
export function expandShorthandPaletteProperties(
  properties: Record<string, unknown>,
): Record<string, string> {
  const expanded: Record<string, string> = {};

  for (const [key, rawValue] of Object.entries(properties)) {
    if (typeof rawValue !== "string" || !isSafeCssValue(rawValue)) continue;

    if (key.startsWith("--")) {
      expanded[key] = rawValue;
      continue;
    }

    const palette = resolvePaletteName(key);
    if (!palette) continue;

    const anchor: 50 | 500 = palette === "surface" && isLightColor(rawValue) ? 50 : 500;

    for (const shade of SHADE_STEPS) {
      const token = `--color-${palette}-${shade}`;
      if (shade === anchor) {
        expanded[token] = rawValue;
        continue;
      }

      if (anchor === 500) {
        const lighter = LIGHTER_BASE_PERCENT[shade];
        if (lighter !== undefined) {
          expanded[token] = mixWithWhite(rawValue, lighter);
          continue;
        }
        const darker = DARKER_BASE_PERCENT[shade];
        if (darker !== undefined) {
          expanded[token] = mixWithBlack(rawValue, darker);
        }
        continue;
      }

      if (shade < 50) continue;
      const darker = SURFACE_DARKER_BASE_PERCENT[shade];
      if (darker !== undefined) {
        expanded[token] = mixWithBlack(rawValue, darker);
      }
    }
  }

  return expanded;
}

function collectProperties(preset: Record<string, unknown>): Record<string, unknown> {
  let raw: Record<string, unknown> = {};

  if (isSkeletonPreset(preset)) {
    raw = preset.properties as Record<string, unknown>;
  } else if (typeof preset.css === "string" && isSkeletonCssExport(preset.css)) {
    raw = parseSkeletonCssBlock(preset.css);
  } else if (typeof preset.code === "string" && isSkeletonCssExport(preset.code)) {
    raw = parseSkeletonCssBlock(preset.code);
  }

  return expandShorthandPaletteProperties(raw);
}

/** Build scoped admin CSS from Skeleton property map */
export function mapSkeletonPropertiesToCss(properties: Record<string, unknown>): string {
  const declarations: string[] = [];
  const adminAliases: string[] = [];

  for (const [rawKey, rawValue] of Object.entries(properties)) {
    if (typeof rawValue !== "string") continue;

    const key = remapPropertyName(rawKey);
    if (!key || !isSafeCssValue(rawValue)) continue;

    declarations.push(`  ${key}: ${rawValue};`);

    if (key === "--radius-base") {
      adminAliases.push(`  --admin-radius-base: ${rawValue};`);
      adminAliases.push(`  --admin-radius-button: ${rawValue};`);
    }
    if (key === "--radius-container") {
      adminAliases.push(`  --admin-radius-card: ${rawValue};`);
      adminAliases.push(`  --admin-radius-input: ${rawValue};`);
    }
  }

  if (declarations.length === 0) return "";

  const lines = [...declarations, ...adminAliases];
  return `${ADMIN_SCOPE_SELECTOR} {\n${lines.join("\n")}\n}`;
}

/** Map a preset object to SveltyCMS admin theme fields */
export function mapPresetToAdminTheme(preset: Record<string, unknown>): SkeletonMappedTheme {
  const name =
    typeof preset.name === "string" && preset.name.trim() ? preset.name.trim() : "Imported Theme";

  const properties = collectProperties(preset);
  const customCss = mapSkeletonPropertiesToCss(properties);

  return {
    name,
    customCss,
    presetSource: "imported",
  };
}

/** Normalize theme file / import payload when it is a Skeleton export */
export function normalizeSkeletonThemePayload(
  preset: Record<string, unknown>,
): Partial<SkeletonMappedTheme> | null {
  if (!isSkeletonPreset(preset) && !isSkeletonCssField(preset)) return null;
  const mapped = mapPresetToAdminTheme(preset);
  return {
    name: mapped.name,
    customCss: mapped.customCss || undefined,
    presetSource: mapped.presetSource,
  };
}

function isSkeletonCssField(preset: Record<string, unknown>): boolean {
  if (typeof preset.css === "string" && isSkeletonCssExport(preset.css)) return true;
  if (typeof preset.code === "string" && isSkeletonCssExport(preset.code)) return true;
  return false;
}
