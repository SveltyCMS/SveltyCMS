/**
 * @file src/services/site/svedit/default-home-document.ts
 * @description Default Svedit homepage document seeded with the Website Starter preset.
 */

import type { SveditDocument } from "@src/services/site/svedit/types";

function emptyText(content: string) {
  return { content, marks: [] as [], annotations: [] as [] };
}

/** Builds the default published homepage Svedit document. */
export function createDefaultHomeDocument(siteName = "SveltyCMS"): SveditDocument {
  return {
    document_id: "page_home",
    nodes: {
      hero_home: {
        id: "hero_home",
        type: "hero",
        heading: emptyText(`Welcome to ${siteName}`),
        subheading: emptyText(
          "Design your frontpage visually with SvelteKit and Svedit — edit blocks directly on the live site.",
        ),
      },
      paragraph_home: {
        id: "paragraph_home",
        type: "paragraph",
        content: emptyText(
          "This homepage was created during setup. Use Live Preview in the CMS to edit inline, or refine blocks in the content field.",
        ),
      },
      cta_home: {
        id: "cta_home",
        type: "cta",
        label: emptyText("Open CMS"),
        href: "/login",
      },
      page_home: {
        id: "page_home",
        type: "page",
        body: {
          nodes: ["hero_home", "paragraph_home", "cta_home"],
          marks: [],
          annotations: [],
        },
      },
    },
  };
}

/** Serializes a Svedit document for storage in the pages `content` textarea field. */
export function serializeSveditContent(document: SveditDocument): string {
  return JSON.stringify(document);
}
