/**
 * @file tests/unit/compilation/fixtures/collections/posts.ts
 * @description Real regression fixture for the v6 composite-transformer fix.
 * Features: canonical GUI/file collection shape — widget factory calls nested
 * under an exported `schema.fields` (including a nested group), a relative
 * helper import, and module-level code. Compiled output must rewrite
 * `widgets.*` to `globalThis.widgets.*` and inject a deterministic `uuid`
 * into every widget call argument (previously skipped by the schema
 * injection early-return).
 */
// @ts-ignore virtual widget manager export for collection compilation
import { widgets } from "@widgets/widget-manager.svelte";
import { slugify } from "./helpers";
import type { Schema } from "@src/content/types";

export const schema: Schema = {
  icon: "mdi:post",
  status: "publish",
  description: "Widget regression fixture",
  slug: "posts",
  fields: [
    widgets.text({ db_fieldName: "title", label: "Title", required: true }),
    widgets.group({
      db_fieldName: "seo",
      label: "SEO",
      fields: [
        widgets.textarea({
          db_fieldName: "metaDescription",
          label: "Meta description",
          required: false,
        }),
      ],
    }),
  ],
};

export function makeSlug(s: string): string {
  return slugify(s);
}
