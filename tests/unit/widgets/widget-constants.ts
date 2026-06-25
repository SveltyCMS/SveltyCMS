/**
 * @file tests/unit/widget-constants.ts
 * @description Centralized widget registry for test mocks to ensure consistency with production.
 */

export const CORE_WIDGETS = [
  "Checkbox",
  "Date",
  "Email",
  "Group",
  "Input",
  "MediaUpload",
  "Number",
  "Radio",
  "Relation",
  "RichText",
  "Select",
  "Slug",
];

export const CUSTOM_WIDGETS = [
  "AIEnrichment",
  "Address",
  "ColorPicker",
  "Currency",
  "DateRange",
  "Geolocation",
  "JsonEditor",
  "Markdown",
  "MegaMenu",
  "PhoneNumber",
  "Price",
  "Rating",
  "RemoteVideo",
  "Repeater",
  "Seo",
  "Tags",
];

export const ALL_WIDGET_NAMES = [...CORE_WIDGETS, ...CUSTOM_WIDGETS];

/**
 * Maps directory names to canonical widget names.
 */
export const WIDGET_DIR_MAP: Record<string, string> = {
  checkbox: "Checkbox",
  date: "Date",
  email: "Email",
  group: "Group",
  input: "Input",
  "media-upload": "MediaUpload",
  number: "Number",
  radio: "Radio",
  relation: "Relation",
  "rich-text": "RichText",
  select: "Select",
  slug: "Slug",
  "ai-enrichment": "AIEnrichment",
  address: "Address",
  "color-picker": "ColorPicker",
  currency: "Currency",
  "date-range": "DateRange",
  geolocation: "Geolocation",
  "json-editor": "JsonEditor",
  markdown: "Markdown",
  "mega-menu": "MegaMenu",
  "phone-number": "PhoneNumber",
  price: "Price",
  rating: "Rating",
  "remote-video": "RemoteVideo",
  repeater: "Repeater",
  seo: "Seo",
  tags: "Tags",
};
