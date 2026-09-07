/**
 * @file src/utils/form-sections.ts
 * @description Groups collection entry fields into labeled editor sections.
 *
 * Features:
 * - Honors an optional `section` string on the field (collection schema)
 * - Infers groups from field names / widgets when `section` is absent
 * - Preserves schema order (consecutive fields with the same key share a card)
 * - Marks compact widgets so the editor can pair them in a two-column grid
 */

export interface FormSectionField {
  db_fieldName?: string;
  name?: string;
  label?: string;
  type?: string;
  section?: string;
  sectionIcon?: string;
  /** 1–12 column span, or fractions like `1/2` / `full`. */
  width?: number | string;
  widget?: { Name?: string; __widgetName?: string } | string;
}

/** Static Tailwind spans — dynamic `sm:col-span-${n}` is stripped at build time. */
export const FORM_COL_SPAN_CLASS: Record<number, string> = {
  1: "col-span-12 sm:col-span-1",
  2: "col-span-12 sm:col-span-2",
  3: "col-span-12 sm:col-span-3",
  4: "col-span-12 sm:col-span-4",
  5: "col-span-12 sm:col-span-5",
  6: "col-span-12 sm:col-span-6",
  7: "col-span-12 sm:col-span-7",
  8: "col-span-12 sm:col-span-8",
  9: "col-span-12 sm:col-span-9",
  10: "col-span-12 sm:col-span-10",
  11: "col-span-12 sm:col-span-11",
  12: "col-span-12",
};

function clampColSpan(n: number): number {
  if (!Number.isFinite(n)) return 12;
  return Math.min(12, Math.max(1, Math.round(n)));
}

/** Parse collection-builder width / colspan (`6`, `"1/2"`, `"full"`). */
export function parseFieldWidth(raw: unknown): number | undefined {
  if (raw == null || raw === "") return undefined;
  if (typeof raw === "number") return clampColSpan(raw);
  const s = String(raw).trim().toLowerCase();
  if (!s) return undefined;
  if (s === "full" || s === "1/1" || s === "12/12") return 12;
  if (s === "half" || s === "1/2") return 6;
  if (s === "1/3") return 4;
  if (s === "2/3") return 8;
  if (s === "1/4") return 3;
  if (s === "3/4") return 9;
  if (s === "1/6") return 2;
  if (s === "5/12") return 5;
  if (s === "7/12") return 7;
  if (s === "5/6") return 10;
  const n = Number(s);
  if (Number.isFinite(n)) return clampColSpan(n);
  return undefined;
}

/** Column span for the entry editor: explicit width, else 12 (wide) or 6 (compact). */
export function formFieldColSpan(field: FormSectionField): number {
  const explicit = parseFieldWidth(field.width);
  if (explicit) return explicit;
  return isFullWidthFormField(field) ? 12 : 6;
}

export function formFieldColSpanClass(field: FormSectionField): string {
  return FORM_COL_SPAN_CLASS[formFieldColSpan(field)] ?? FORM_COL_SPAN_CLASS[12];
}

export interface FormSection {
  id: string;
  key: string;
  label: string;
  icon: string;
  showHeading: boolean;
  fields: FormSectionField[];
}

export interface FormSectionRow<T extends FormSectionField = FormSectionField> {
  fullWidth: boolean;
  fields: T[];
}

const IDENTITY_NAMES = new Set(["title", "slug", "name", "pagetype", "template", "status", "path"]);

const PAIRABLE_WIDGETS = new Set([
  "Input",
  "Slug",
  "Select",
  "Email",
  "Number",
  "DateTime",
  "Checkbox",
  "PhoneNumber",
]);

const WIDE_WIDGETS = new Set(["RichText", "Markdown", "SEO", "Group", "MediaUpload", "Repeater"]);

/** Preset / DB aliases → factory `Name` used by pairing and section inference. */
const WIDGET_ALIASES: Record<string, string> = {
  text: "Input",
  textarea: "Input",
  input: "Input",
  slug: "Slug",
  select: "Select",
  richtext: "RichText",
  "rich-text": "RichText",
  markdown: "Markdown",
  seo: "SEO",
  group: "Group",
  mediaupload: "MediaUpload",
  "media-upload": "MediaUpload",
  email: "Email",
  number: "Number",
  datetime: "DateTime",
  "date-time": "DateTime",
  checkbox: "Checkbox",
  boolean: "Checkbox",
  phonenumber: "PhoneNumber",
  "phone-number": "PhoneNumber",
  repeater: "Repeater",
};

/** Normalize widget identifiers so `text` / `slug` pair the same as `Input` / `Slug`. */
export function canonicalizeWidgetName(raw: string | undefined | null): string {
  if (!raw) return "Input";
  const trimmed = String(raw).trim();
  if (!trimmed) return "Input";
  const aliasKey = trimmed.toLowerCase().replace(/_/g, "-");
  return WIDGET_ALIASES[aliasKey] || trimmed;
}

function widgetName(field: FormSectionField): string {
  if (typeof field.widget === "string") return canonicalizeWidgetName(field.widget);
  return canonicalizeWidgetName(
    field.widget?.Name || field.widget?.__widgetName || field.type || "Input",
  );
}

function fieldName(field: FormSectionField): string {
  return String(field.db_fieldName || field.name || "")
    .trim()
    .toLowerCase();
}

function slugifySection(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Resolve the section card a field belongs to.
 * Explicit `field.section` always wins.
 */
export function resolveFieldSection(field: FormSectionField): {
  key: string;
  label: string;
  icon: string;
  showHeading: boolean;
} {
  const explicit = typeof field.section === "string" ? field.section.trim() : "";
  if (explicit) {
    return {
      key: slugifySection(explicit) || "details",
      label: explicit,
      icon:
        typeof field.sectionIcon === "string" && field.sectionIcon
          ? field.sectionIcon
          : "mdi:folder-outline",
      showHeading: true,
    };
  }

  const name = fieldName(field);
  const widget = widgetName(field).toLowerCase();
  const label = String(field.label || "").toLowerCase();

  if (widget === "seo" || name === "seo" || name.startsWith("seo")) {
    return { key: "seo", label: "SEO", icon: "mdi:search-web", showHeading: true };
  }
  if (name.startsWith("cta")) {
    return {
      key: "cta",
      label: "Call to action",
      icon: "mdi:gesture-tap-button",
      showHeading: true,
    };
  }
  if (name.startsWith("hero")) {
    return { key: "hero", label: "Hero", icon: "mdi:page-layout-header", showHeading: true };
  }
  if (widget === "group") {
    return {
      key: `group-${name || slugifySection(String(field.label || "group"))}`,
      label: String(field.label || "Group"),
      icon: "mdi:folder-outline",
      showHeading: true,
    };
  }
  if (
    label.includes("svedit") ||
    (name === "content" &&
      (label.includes("layout") || widget === "textarea" || widget === "input"))
  ) {
    return {
      key: "layout",
      label: "Layout",
      icon: "mdi:view-dashboard-outline",
      showHeading: true,
    };
  }
  if (widget === "richtext" || widget === "markdown" || name === "body") {
    return { key: "content", label: "Content", icon: "mdi:text-box-outline", showHeading: true };
  }
  if (IDENTITY_NAMES.has(name.replace(/_/g, ""))) {
    return { key: "details", label: "Details", icon: "mdi:card-text-outline", showHeading: true };
  }

  return { key: "more", label: "More", icon: "mdi:dots-horizontal", showHeading: true };
}

/** True when the field should span the full section width (not sit in a 2-col pair). */
export function isFullWidthFormField(field: FormSectionField): boolean {
  const name = fieldName(field);
  const widget = widgetName(field);
  if (WIDE_WIDGETS.has(widget)) return true;
  if (name === "body" || name === "content" || name.startsWith("seo")) return true;
  if (name.includes("subheading") || name.includes("description") || name.includes("body"))
    return true;
  return !PAIRABLE_WIDGETS.has(widget);
}

/**
 * Group fields into consecutive section cards. Order is never reshuffled.
 */
export function groupEntryFields(fields: FormSectionField[]): FormSection[] {
  const sections: FormSection[] = [];

  for (const field of fields) {
    const meta = resolveFieldSection(field);
    const last = sections[sections.length - 1];
    if (last && last.key === meta.key) {
      last.fields.push(field);
      continue;
    }
    sections.push({
      id: `${meta.key}-${sections.length}`,
      key: meta.key,
      label: meta.label,
      icon: meta.icon,
      showHeading: meta.showHeading,
      fields: [field],
    });
  }

  return sections;
}

/**
 * Pack a section's fields into rows: pair consecutive compact widgets,
 * leave wide widgets on their own row. Order is preserved.
 */
export function layoutFormSectionFields<T extends FormSectionField>(
  fields: T[],
): FormSectionRow<T>[] {
  const rows: FormSectionRow<T>[] = [];
  let pending: T | undefined;

  for (const field of fields) {
    if (isFullWidthFormField(field)) {
      if (pending) {
        rows.push({ fullWidth: false, fields: [pending] });
        pending = undefined;
      }
      rows.push({ fullWidth: true, fields: [field] });
      continue;
    }
    if (pending) {
      rows.push({ fullWidth: false, fields: [pending, field] });
      pending = undefined;
    } else {
      pending = field;
    }
  }

  if (pending) rows.push({ fullWidth: false, fields: [pending] });
  return rows;
}
