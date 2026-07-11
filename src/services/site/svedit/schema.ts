/**
 * @file src/services/site/svedit/schema.ts
 * @description Svedit document schema for site starter pages (hero, paragraph, CTA blocks).
 */

import { define_document_schema } from "svedit";

export const sitePageDocumentSchema = define_document_schema({
  page: {
    kind: "document",
    properties: {
      body: {
        type: "node_array",
        node_types: ["hero", "paragraph", "cta"],
        default_node_type: "paragraph",
      },
    },
  },
  hero: {
    kind: "block",
    properties: {
      heading: {
        type: "text",
        allow_newlines: false,
      },
      subheading: {
        type: "text",
        allow_newlines: true,
      },
    },
  },
  paragraph: {
    kind: "text",
    properties: {
      content: {
        type: "text",
        allow_newlines: true,
      },
    },
  },
  cta: {
    kind: "block",
    properties: {
      label: {
        type: "text",
        allow_newlines: false,
      },
      href: { type: "string", default: "#" },
    },
  },
});
