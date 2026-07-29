/**
 * @file src/widgets/desugar-field.ts
 * @description Schema desugaring layer for SveltyCMS field types.
 *
 * When a collection author writes a shortcut field type like `{ type: 'color' }`
 * or `{ type: 'seo' }`, this module expands it into a full object field while
 * **preserving all authored metadata** — access control, validation, groups,
 * and any custom properties the author set.
 *
 * ### Architecture:
 * - `desugarFieldType` is the main entry point — it tree-walks nested objects
 *   and array members, layering the authored field back over the built one.
 * - Each sugar type has a `SugarTypeBuilder` that declares only the shape it owns.
 * - `sugarKeys` names properties that exist solely on the sugar type (e.g.,
 *   `alpha` on color, which becomes `inputOptions.alpha`) so they don't survive
 *   onto the expanded field as top-level properties.
 * - A property added to `BaseField` later is carried through automatically
 *   because the authored field is spread over the built one.
 *
 * ### Features:
 * - sugar type → full field expansion
 * - deep-merge metadata preservation (access, validation, groups)
 * - nested object/array tree-walking
 * - extensible sugar type registry
 * - runtime immutability (Object.freeze on expanded schemas)
 */

import type { FieldDefinition } from "@src/content/types";

// ============================================================================
// Types
// ============================================================================

/** Properties that every field (base or sugar) can carry. */
export interface BaseField {
  name?: string;
  label?: string;
  title?: string;
  description?: string;
  group?: string | string[];
  access?: FieldAccess;
  validation?: FieldValidation;
  required?: boolean;
  translated?: boolean;
  width?: number;
  helper?: string;
  placeholder?: string;
  default?: unknown;
  [key: string]: unknown;
}

/** Access control for a field. */
export interface FieldAccess {
  read?: string[];
  write?: string[];
  create?: string[];
  update?: string[];
}

/** Validation rules for a field. */
export interface FieldValidation {
  required?: boolean;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  message?: string;
  [key: string]: unknown;
}

/**
 * A sugar type builder declares only the shape it owns.
 * The authored field is layered over it, so preservation is the default.
 */
export interface SugarTypeBuilder {
  /** The sugar type name (e.g., 'color', 'seo'). */
  type: string;

  /** Properties that exist only on the sugar type and should NOT survive
   *  onto the expanded field as top-level properties. */
  sugarKeys: string[];

  /**
   * Build the expanded field shape from the sugar-type-specific properties.
   * Returns only the shape the builder owns — the authored field will be
   * layered on top automatically by the desugar engine.
   */
  build(authoredField: BaseField): Record<string, unknown>;
}

// ============================================================================
// Deep Merge Helper
// ============================================================================

/**
 * Deep-merge authored metadata over built field shape.
 * Shallow spread ({ ...built, ...stripped }) would clobber nested objects
 * like `access` or `validation`. This helpers merges objects recursively
 * so a collection author's `access.read` doesn't wipe `access.write` from
 * the built field configuration.
 */
function deepMergeMetadata(
  built: Record<string, unknown>,
  stripped: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...built };
  for (const key of Object.keys(stripped)) {
    const strippedVal = stripped[key];
    const builtVal = merged[key];
    if (
      strippedVal &&
      typeof strippedVal === "object" &&
      !Array.isArray(strippedVal) &&
      builtVal &&
      typeof builtVal === "object" &&
      !Array.isArray(builtVal)
    ) {
      // Both are plain objects — deep merge
      merged[key] = {
        ...(builtVal as Record<string, unknown>),
        ...(strippedVal as Record<string, unknown>),
      };
    } else {
      // Primitive, array, or missing on built — authored wins
      merged[key] = strippedVal;
    }
  }
  return merged;
}

const sugarTypeRegistry = new Map<string, SugarTypeBuilder>();

/** Register a sugar type builder. Plugins can call this to add their own. */
export function registerSugarType(builder: SugarTypeBuilder): void {
  sugarTypeRegistry.set(builder.type, builder);
}

/** Get a registered sugar type builder. */
export function getSugarType(type: string): SugarTypeBuilder | undefined {
  return sugarTypeRegistry.get(type);
}

/** Check if a type is a registered sugar type. */
export function isSugarType(type: string): boolean {
  return sugarTypeRegistry.has(type);
}

// ============================================================================
// Built-in Sugar Types
// ============================================================================

/** Color picker sugar type — expands to an object with hex + alpha fields. */
registerSugarType({
  type: "color",
  sugarKeys: ["alpha", "preset"],
  build(authoredField) {
    const alpha = authoredField.alpha !== undefined ? authoredField.alpha : true;
    const preset = authoredField.preset as string | undefined;
    return {
      type: "object",
      fields: [
        {
          name: "hex",
          type: "text",
          label: "Color",
          inputOptions: { type: "color" },
        },
        ...(alpha
          ? [
              {
                name: "alpha",
                type: "number",
                label: "Opacity",
                inputOptions: { min: 0, max: 1, step: 0.01 },
                default: 1,
              },
            ]
          : []),
        ...(preset
          ? [
              {
                name: "preset",
                type: "text",
                label: "Preset",
                inputOptions: { hidden: true },
                default: preset,
              },
            ]
          : []),
      ],
    };
  },
});

/** SEO sugar type — expands to meta title, description, and OG fields. */
registerSugarType({
  type: "seo",
  sugarKeys: ["ogImageField"],
  build(authoredField) {
    const ogImageField = authoredField.ogImageField as string | undefined;
    return {
      type: "object",
      fields: [
        { name: "metaTitle", type: "text", label: "Meta Title", inputOptions: { maxLength: 60 } },
        {
          name: "metaDescription",
          type: "textarea",
          label: "Meta Description",
          inputOptions: { maxLength: 160 },
        },
        { name: "ogTitle", type: "text", label: "OG Title" },
        { name: "ogDescription", type: "textarea", label: "OG Description" },
        ...(ogImageField
          ? [
              {
                name: "ogImage",
                type: ogImageField === "media" ? "media" : "text",
                label: "OG Image",
              },
            ]
          : [{ name: "ogImage", type: "media", label: "OG Image" }]),
        { name: "canonicalUrl", type: "text", label: "Canonical URL" },
        { name: "noindex", type: "boolean", label: "No Index", default: false },
        { name: "nofollow", type: "boolean", label: "No Follow", default: false },
      ],
    };
  },
});

// ============================================================================
// Desugar Engine
// ============================================================================

/**
 * Desugar a field that uses a sugar type into its expanded form.
 *
 * The authored field is **layered over** the built field, so any property
 * the author explicitly set is preserved. Properties listed in the sugar
 * type's `sugarKeys` are removed from the top level (they get folded into
 * nested fields or `inputOptions` by the builder).
 *
 * Handles nested objects and array members recursively.
 *
 * @param authoredField - The field as written by the collection author.
 * @returns The expanded field definition with all metadata preserved.
 */
export function desugarFieldType(authoredField: BaseField): Record<string, unknown> {
  const sugarType = authoredField.type as string | undefined;
  if (!sugarType) return authoredField as Record<string, unknown>;

  const builder = sugarTypeRegistry.get(sugarType);
  if (!builder) return authoredField as Record<string, unknown>;

  // Build the expanded shape from the sugar type
  const built = builder.build(authoredField);

  // Strip sugarKeys from the authored field — they get folded into the built shape
  const stripped: Record<string, unknown> = {};
  for (const key of Object.keys(authoredField)) {
    if (key === "type") {
      // Don't carry `type: 'color'` onto the expanded field — the expanded
      // field has its own type (usually 'object').
      continue;
    }
    if (builder.sugarKeys.includes(key)) {
      // Sugar-only keys — already handled by the builder
      continue;
    }
    stripped[key] = authoredField[key];
  }

  // Layer authored over built — deep merge preserves nested metadata (access, validation)
  const result = deepMergeMetadata(built, stripped);

  // Recursively expand nested fields
  result.fields = expandFields((result.fields as Array<Record<string, unknown>>) || []);

  return result;
}

/**
 * Recursively expand sugar types in a list of field definitions.
 * Used for both top-level schema fields and nested object/array members.
 */
export function expandFields(
  fields: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  return fields.map((field) => {
    const type = field.type as string | undefined;
    if (type && sugarTypeRegistry.has(type)) {
      return desugarFieldType(field as BaseField);
    }

    // Recurse into nested objects
    if (field.fields && Array.isArray(field.fields)) {
      return {
        ...field,
        fields: expandFields(field.fields as Array<Record<string, unknown>>),
      };
    }

    // Recurse into array members
    if (field.of && typeof field.of === "object") {
      const memberField = field.of as Record<string, unknown>;
      const memberType = memberField.type as string | undefined;
      if (memberType && sugarTypeRegistry.has(memberType)) {
        return {
          ...field,
          of: desugarFieldType(memberField as BaseField),
        };
      }
      // Recurse into member's nested fields
      if (memberField.fields && Array.isArray(memberField.fields)) {
        return {
          ...field,
          of: {
            ...memberField,
            fields: expandFields(memberField.fields as Array<Record<string, unknown>>),
          },
        };
      }
    }

    return field;
  });
}

/**
 * Process a full collection schema, expanding all sugar types.
 * This should be called during collection loading/sync.
 *
 * The returned array is deep-frozen to prevent runtime mutations by
 * plugin script contexts — a plugin cannot redefine access rules or
 * validation on core fields after desugaring.
 *
 * @param fields - The fields array from a Schema
 * @returns The expanded (and frozen) fields with all sugar types desugared
 */
export function desugarSchemaFields(fields: FieldDefinition[]): FieldDefinition[] {
  const processed = fields.map((field) => {
    // Handle WidgetPlaceholder (structured type with __widgetId)
    if (field && typeof field === "object" && "__widgetId" in field) {
      return field;
    }
    // Handle JoinField (structured type with collection + on)
    if (field && typeof field === "object" && "collection" in field && "on" in field) {
      return field;
    }
    // Handle index-signature fallback (future field types)
    const rawField = field as Record<string, unknown>;
    const type = rawField.type as string | undefined;
    if (type && sugarTypeRegistry.has(type)) {
      return desugarFieldType(rawField as BaseField) as FieldDefinition;
    }
    // Recurse into nested object fields
    if (rawField.fields && Array.isArray(rawField.fields)) {
      return {
        ...rawField,
        fields: expandFields(rawField.fields as Array<Record<string, unknown>>),
      } as FieldDefinition;
    }
    return field;
  });

  // Deep-freeze the expanded schema to prevent runtime mutations by plugin contexts.
  // A plugin cannot redefine access rules or validation on desugared fields.
  return Object.freeze(processed) as FieldDefinition[];
}

/**
 * Collect all sugar keys across all registered sugar types.
 * Useful for documentation and schema validation tools.
 */
export function getAllSugarKeys(): string[] {
  const keys: string[] = [];
  for (const builder of sugarTypeRegistry.values()) {
    keys.push(...builder.sugarKeys);
  }
  return [...new Set(keys)];
}

/**
 * List all registered sugar type names.
 */
export function listSugarTypes(): string[] {
  return Array.from(sugarTypeRegistry.keys());
}
