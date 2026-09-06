/**
 * @file src/routes/(app)/config/collectionbuilder/smart-inference.ts
 * @description Heuristic engine for natural-language widget inferencing in the Collection Builder.
 *
 * Features:
 * - Automatically infers optimal SveltyCMS widget from field names (e.g. "email", "price", "cover")
 * - Sanitizes database field names and humanizes labels
 * - Detects relational target collections based on existing content structure
 * - Zero external dependencies; safe for both client and server execution
 */

export interface InferredWidgetResult {
  widgetKey: string;
  displayName: string;
  label: string;
  db_fieldName: string;
  icon: string;
  required?: boolean;
  defaults?: Record<string, unknown>;
}

/** Converts an input string like "user_email" or "productPrice" into a clean Title Case label */
export function humanizeLabel(input: string): string {
  const clean = input.trim().replace(/[_-]+/g, " ");
  // Insert space before capital letters in camelCase
  const spaced = clean.replace(/([a-z])([A-Z])/g, "$1 $2");
  return (
    spaced
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ") || "Field"
  );
}

/** Sanitizes an input string into a safe database field identifier */
export function sanitizeDbFieldName(input: string): string {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || "field";
}

/**
 * Infer optimal widget type, clean label, and default configurations from a field name.
 *
 * @param input - The raw user input (e.g. "email", "total_price", "cover_photo", "author")
 * @param existingCollections - Optional list of known collection names for relation detection
 */
export function inferWidgetFromFieldName(
  input: string,
  existingCollections: string[] = [],
): InferredWidgetResult {
  const raw = input.trim();
  const lower = raw.toLowerCase().replace(/[^a-z0-9_]/g, "_");
  const label = humanizeLabel(raw);
  const db_fieldName = sanitizeDbFieldName(raw);

  // 1. Relational Matching: Check if field name matches or references an existing collection
  if (existingCollections.length > 0) {
    const singularMatches = existingCollections.find((c) => {
      const cLower = c.toLowerCase();
      return (
        lower === cLower ||
        lower === `${cLower}_id` ||
        lower.replace(/_id$/, "") === cLower ||
        lower.replace(/s$/, "") === cLower
      );
    });

    if (singularMatches) {
      return {
        widgetKey: "relation",
        displayName: `Relation to ${singularMatches}`,
        label,
        db_fieldName,
        icon: "mdi:relation-many-to-one",
        defaults: {
          relationCollection: singularMatches,
          displayField: "name",
        },
      };
    }
  }

  // 2. Email Pattern
  if (lower === "email" || lower.endsWith("_email") || lower.includes("email_address")) {
    return {
      widgetKey: "input",
      displayName: "Email (Input)",
      label,
      db_fieldName,
      icon: "mdi:email-outline",
      defaults: {
        type: "email",
        placeholder: "name@example.com",
      },
    };
  }

  // 3. Price / Currency Pattern
  if (
    lower === "price" ||
    lower.endsWith("_price") ||
    lower.startsWith("price_") ||
    lower === "cost" ||
    lower === "amount" ||
    lower === "fee" ||
    lower === "total" ||
    lower === "subtotal" ||
    lower === "salary"
  ) {
    return {
      widgetKey: "currency",
      displayName: "Currency / Price",
      label,
      db_fieldName,
      icon: "mdi:currency-usd",
      defaults: {
        currency: "USD",
      },
    };
  }

  // 4. Media / Image Pattern
  if (
    lower === "image" ||
    lower.endsWith("_image") ||
    lower === "photo" ||
    lower.endsWith("_photo") ||
    lower === "cover" ||
    lower.endsWith("_cover") ||
    lower === "avatar" ||
    lower === "thumbnail" ||
    lower === "banner" ||
    lower === "logo" ||
    lower === "media"
  ) {
    return {
      widgetKey: "media",
      displayName: "Image (Media)",
      label,
      db_fieldName,
      icon: "mdi:image-outline",
      defaults: {
        maxFiles: 1,
      },
    };
  }

  // 5. Rich Text / Markdown / Body Pattern
  if (
    lower === "content" ||
    lower.endsWith("_content") ||
    lower === "body" ||
    lower.endsWith("_body") ||
    lower === "description" ||
    lower.endsWith("_description") ||
    lower === "bio" ||
    lower === "notes" ||
    lower === "article" ||
    lower === "markdown" ||
    lower.includes("markdown") ||
    lower === "summary"
  ) {
    return {
      widgetKey: "markdown",
      displayName: "Markdown / Rich Text",
      label,
      db_fieldName,
      icon: "mdi:format-text",
      defaults: {},
    };
  }

  // 6. Boolean / Switch Pattern
  if (
    lower.startsWith("is_") ||
    lower.startsWith("has_") ||
    lower === "enabled" ||
    lower === "active" ||
    lower === "published" ||
    lower === "visible" ||
    lower === "draft" ||
    lower === "featured"
  ) {
    return {
      widgetKey: "boolean",
      displayName: "Boolean Switch",
      label,
      db_fieldName,
      icon: "mdi:toggle-switch-outline",
      defaults: {
        defaultValue: false,
      },
    };
  }

  // 7. Date & Time Pattern
  if (
    lower === "date" ||
    lower.endsWith("_date") ||
    lower.startsWith("date_") ||
    lower.endsWith("_at") ||
    lower === "deadline" ||
    lower === "dob" ||
    lower === "birthday" ||
    lower === "published_at" ||
    lower === "event_date"
  ) {
    return {
      widgetKey: "date",
      displayName: "Date / Time",
      label,
      db_fieldName,
      icon: "mdi:calendar-outline",
      defaults: {
        includeTime: lower.endsWith("_at") || lower.includes("time"),
      },
    };
  }

  // 8. Tags / Keywords / Labels Pattern
  if (lower === "tags" || lower === "keywords" || lower === "labels" || lower === "categories") {
    return {
      widgetKey: "tags",
      displayName: "Tags",
      label,
      db_fieldName,
      icon: "mdi:tag-multiple-outline",
      defaults: {},
    };
  }

  // 9. Phone Number Pattern
  if (
    lower === "phone" ||
    lower === "telephone" ||
    lower === "mobile" ||
    lower.endsWith("_phone") ||
    lower === "tel"
  ) {
    return {
      widgetKey: "phone-number",
      displayName: "Phone Number",
      label,
      db_fieldName,
      icon: "mdi:phone-outline",
      defaults: {},
    };
  }

  // 10. Rating / Score Pattern
  if (lower === "rating" || lower === "score" || lower === "stars" || lower === "grade") {
    return {
      widgetKey: "rating",
      displayName: "Rating",
      label,
      db_fieldName,
      icon: "mdi:star-outline",
      defaults: {
        maxRating: 5,
      },
    };
  }

  // 11. Address / Location Pattern
  if (
    lower === "address" ||
    lower === "location" ||
    lower === "city" ||
    lower === "street" ||
    lower === "coordinates"
  ) {
    return {
      widgetKey: "address",
      displayName: "Address",
      label,
      db_fieldName,
      icon: "mdi:map-marker-outline",
      defaults: {},
    };
  }

  // 12. SEO / Meta Pattern
  if (lower === "seo" || lower === "meta" || lower === "metadata") {
    return {
      widgetKey: "seo",
      displayName: "SEO Metadata",
      label,
      db_fieldName,
      icon: "mdi:search-web",
      defaults: {},
    };
  }

  // 13. Number / Quantity / Count Pattern
  if (
    lower === "quantity" ||
    lower === "count" ||
    lower === "stock" ||
    lower === "inventory" ||
    lower === "views" ||
    lower === "age" ||
    lower === "order" ||
    lower === "position" ||
    lower.endsWith("_count")
  ) {
    return {
      widgetKey: "number",
      displayName: "Number",
      label,
      db_fieldName,
      icon: "mdi:numeric",
      defaults: {},
    };
  }

  // Default fallback: Standard Text Input
  return {
    widgetKey: "input",
    displayName: "Text Input",
    label,
    db_fieldName,
    icon: "mdi:form-textbox",
    defaults: {},
  };
}
