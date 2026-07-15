/**
 * @file src/widgets/custom/Seo/index.ts
 * @description SEO Widget Definition.
 *
 * An SEO analysis and optimization tool embedded as a widget.
 *
 * @features
 * - **Comprehensive Validation**: Valibot schema validates the entire SEO data object, including length checks.
 * - **Structured Data**: Stores a single, clean `SeoData` object.
 * - **Configurable Features**: The `features` prop allows tailoring the UI for different needs.
 * - **Translatable**: Fully supports multilingual SEO content.
 */

import { widget_seo_description } from "@src/paraglide/messages";
import { createWidget } from "@src/widgets/widget-factory";
import {
  custom,
  literal,
  maxLength,
  nullable,
  object,
  optional,
  pipe,
  string,
  transform,
  union,
  type InferInput as ValibotInput,
} from "valibot";

// Import components needed for the GuiSchema
// import Input from '@components/ui/input.svelte';
// import Toggle from '@components/ui/toggle.svelte';

// SECURITY: Escape HTML entities to prevent meta tag injection
const escapeHtml = (str: string): string => {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

// Define a robust validation schema for the SeoData object.
const SEO_VALIDATION_SCHEMA = object({
  title: pipe(
    string(),
    maxLength(60, "Title should be under 60 characters."),
    transform(escapeHtml),
  ),
  description: pipe(
    string(),
    maxLength(160, "Description should be under 160 characters."),
    transform(escapeHtml),
  ),
  focusKeyword: pipe(string(), transform(escapeHtml)),
  // Advanced
  robotsMeta: pipe(string(), transform(escapeHtml)),
  canonicalUrl: optional(
    pipe(
      string(),
      transform((v) => v.trim()),
      custom(
        (v) => (v as string) === "" || /^https?:\/\/.+/.test(v as string),
        "Must be a valid URL or empty",
      ),
    ),
  ),
  // Social
  ogTitle: optional(string()),
  ogDescription: optional(string()),
  ogImage: optional(string()), // ID of a media file
  twitterCard: union([literal("summary"), literal("summary_large_image")]),
  twitterTitle: optional(string()),
  twitterDescription: optional(string()),
  twitterImage: optional(string()), // ID of a media file
  // Schema - SECURITY: Validate JSON structure and sanitize content
  schemaMarkup: optional(
    pipe(
      string(),
      custom((input) => {
        if (!input) {
          return true;
        }
        try {
          const parsed = JSON.parse(input as string);

          // Recursive sanitizer to prevent script injection in JSON-LD
          const sanitizeJsonLd = (obj: unknown): boolean => {
            if (typeof obj === "string") return !/<script|javascript:/i.test(obj);
            if (Array.isArray(obj)) return obj.every(sanitizeJsonLd);
            if (typeof obj === "object" && obj !== null)
              return Object.values(obj).every(sanitizeJsonLd);
            return true;
          };

          // Must be an object, not a string or array at root level
          return typeof parsed === "object" && !Array.isArray(parsed) && sanitizeJsonLd(parsed);
        } catch {
          return false;
        }
      }, "Must be a safe JSON-LD object"),
    ),
  ),
});

const validationSchema = (field: any) => {
  return field.required ? SEO_VALIDATION_SCHEMA : nullable(SEO_VALIDATION_SCHEMA);
};

// Create the widget definition using the factory.
const SeoWidget = createWidget({
  Name: "SEO",
  Icon: "tabler:seo",
  Description: widget_seo_description(),
  inputComponentPath: "/src/widgets/custom/Seo/input.svelte",
  displayComponentPath: "/src/widgets/custom/Seo/display.svelte",
  validationSchema,

  // Set widget-specific defaults.
  defaults: {
    features: ["social", "schema", "advanced", "ai"],
    translated: true,
  },

  // Validation - defines which fields are translatable
  getTranslatablePaths: (basePath: string) => {
    // Return only fields that contribute to the global translation status
    // Exclude technical fields like robotsMeta, canonicalUrl which have defaults
    return [
      `${basePath}.title`,
      `${basePath}.description`,
      `${basePath}.focusKeyword`,
      `${basePath}.ogTitle`,
      `${basePath}.ogDescription`,
      `${basePath}.twitterTitle`,
      `${basePath}.twitterDescription`,
      `${basePath}.schemaMarkup`,
    ];
  },

  // GuiSchema allows configuration in the collection builder.
  GuiSchema: {
    label: { widget: "Input", required: true },
    db_fieldName: { widget: "Input", required: false },
    required: { widget: "Toggles", required: false },
    translated: { widget: "Toggles", required: false },
    features: {
      widget: "Input", // A multi-select component would be better here.
      required: false,
      helper: "Comma-separated features (social, schema, advanced, ai).",
    },
  },

  // GraphQL schema for SEO (complex object, would need custom type)
  // For now, return String to serialize as JSON
  GraphqlSchema: () => ({
    typeID: "String", // JSON string representation
    graphql: "", // No custom type definition needed
  }),

  /**
   * Enrich SEO data on retrieval (GET) and validate premium limits on save (POST/PATCH).
   */
  modifyRequest: async ({ data, type, user, tenantId }: any) => {
    const value = data.get() as SeoWidgetData;
    if (!value) return data;

    // SECURITY: Enforce Premium Licensing via Cloud API on Save
    if (type === "POST" || type === "PATCH") {
      if (import.meta.env.SSR) {
        const { checkExtensionLicense } = await import("@src/utils/license-manager");
        const status = await checkExtensionLicense("widget", "seo");

        try {
          // MOCK CLOUD API: Simulate passing the license key to the SveltyCMS Cloud API for generation
          // If this were the real implementation, the local code would NOT contain the generation logic.
          // It would simply pass the basic data + license key to the API, and the API would return the enriched data.
          if (!status.active && !status.hasLicense) {
            throw new Error("403 Forbidden: Invalid License Key");
          }

          // Assume the Cloud API succeeded and returned the enriched data
          // ... (data remains intact) ...
        } catch (err: any) {
          // Cloud API rejected the license or trial expired. Strip all premium fields.
          console.warn("[widget:seo] Premium Data stripped. Reason:", err.message);
          for (const langKey in value) {
            if (typeof value[langKey as keyof SeoWidgetData] === "object") {
              const langData = value[langKey as keyof SeoWidgetData] as any;

              // Basic fields kept: title, description, focusKeyword

              // Strip Premium fields because the Cloud API refused to generate/validate them
              delete langData.robotsMeta;
              delete langData.canonicalUrl;
              delete langData.ogTitle;
              delete langData.ogDescription;
              delete langData.ogImage;
              delete langData.twitterCard;
              delete langData.twitterTitle;
              delete langData.twitterDescription;
              delete langData.twitterImage;
              delete langData.schemaMarkup;
            }
          }
        }
      }
      data.update(value);
      return data;
    }

    if (type !== "GET") return data;

    // Resolve tokens in title and description
    const entry = (data as any).entry || {};
    const context = {
      entry,
      user,
      tenantId: (tenantId as string) || "default",
    };

    if (
      (value.title && value.title.includes("{{")) ||
      (value.description && value.description.includes("{{"))
    ) {
      const { replaceTokens } = await import("@src/services/token/engine");

      if (value.title && value.title.includes("{{")) {
        value.title = await replaceTokens(value.title, context);
      }

      if (value.description && value.description.includes("{{")) {
        value.description = await replaceTokens(value.description, context);
      }
    }

    data.update(value);
    return data;
  },
});

export default SeoWidget;

// Export helper types.
export type FieldType = ReturnType<typeof SeoWidget>;
export type SeoWidgetData = ValibotInput<typeof SEO_VALIDATION_SCHEMA>;
