#!/usr/bin/env node
/**
 * @file scripts/check-dashboard-widget-packages.mjs
 * @description Validates dashboard widget package folders are marketplace-ready.
 *
 * Every folder under `src/routes/(app)/dashboard/widgets/<id>/` must contain:
 * - exactly one `.svelte` component — `index.svelte` (preferred for new
 *   packages) or the folder-named `{id}.svelte` / `{id}-widget.svelte` legacy form,
 * - a valid `widget.json` manifest (required fields),
 * - a REQUIRED co-located `.mdx` marketplace description.
 *
 * Runs as part of `bun run check` (via `lint:widgets`). Exit code 1 on failure.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const WIDGETS_DIR = "src/routes/(app)/dashboard/widgets";

const REQUIRED_MANIFEST_FIELDS = [
  "id",
  "name",
  "icon",
  "version",
  "type",
  "author",
  "license",
  "component",
  "defaultSize",
];

const VALID_LICENSES = ["free", "freemium", "paid"];
const VALID_TYPES = ["dashboard-widget"];
const VALID_CATEGORIES = ["monitoring", "logs", "content", "static"];

let failures = 0;

function fail(msg) {
  failures += 1;
  console.error(`FAIL  ${msg}`);
}

function ok(msg) {
  console.log(`OK    ${msg}`);
}

const entries = readdirSync(WIDGETS_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .sort((a, b) => a.name.localeCompare(b.name));

if (entries.length === 0) {
  console.error(`No dashboard widget packages found under ${WIDGETS_DIR}`);
  process.exit(1);
}

for (const entry of entries) {
  const folder = entry.name;
  const dir = join(WIDGETS_DIR, folder);

  // 1. Folder must be kebab-case
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(folder)) {
    fail(`${folder}/ folder is not kebab-case`);
  }

  // 2. Exactly one .svelte component — must be `index.svelte`
  const svelteFiles = readdirSync(dir).filter((f) => f.endsWith(".svelte"));
  if (svelteFiles.length !== 1) {
    fail(`${folder}/ must contain exactly one .svelte component (found ${svelteFiles.length})`);
  } else if (svelteFiles[0] !== "index.svelte") {
    fail(
      `${folder}/${svelteFiles[0]} must be named \`index.svelte\` (folder id is the package identity)`,
    );
  }

  // 3. widget.json manifest — present, valid JSON, required fields
  const manifestPath = join(dir, "widget.json");
  if (!existsSync(manifestPath)) {
    fail(`${folder}/ missing widget.json manifest`);
  } else {
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    } catch (err) {
      fail(`${folder}/widget.json is not valid JSON: ${err.message}`);
      continue;
    }
    for (const field of REQUIRED_MANIFEST_FIELDS) {
      if (!(field in manifest)) {
        fail(`${folder}/widget.json missing required field "${field}"`);
      }
    }
    if (manifest.id !== folder) {
      fail(`${folder}/widget.json "id" (${manifest.id}) must match folder name`);
    }
    if (svelteFiles.length === 1 && manifest.component !== svelteFiles[0].replace(".svelte", "")) {
      fail(`${folder}/widget.json "component" must match the .svelte filename`);
    }
    if (!VALID_LICENSES.includes(manifest.license)) {
      fail(`${folder}/widget.json invalid license "${manifest.license}"`);
    }
    if (!VALID_TYPES.includes(manifest.type)) {
      fail(`${folder}/widget.json invalid type "${manifest.type}"`);
    }
    if (manifest.category && !VALID_CATEGORIES.includes(manifest.category)) {
      fail(`${folder}/widget.json invalid category "${manifest.category}"`);
    }
    if (manifest.defaultSize && typeof manifest.defaultSize.w !== "number") {
      fail(`${folder}/widget.json defaultSize.w must be a number`);
    }
  }

  // 4. REQUIRED co-located readme.mdx marketplace description
  const mdxFiles = readdirSync(dir).filter((f) => f.endsWith(".mdx"));
  if (mdxFiles.length !== 1 || mdxFiles[0] !== "readme.mdx") {
    fail(
      `${folder}/ must contain exactly one \`readme.mdx\` marketplace description (found: ${mdxFiles.join(", ") || "none"})`,
    );
  } else {
    ok(`${folder}/ manifest + ${svelteFiles.length} svelte + ${mdxFiles.length} mdx`);
  }
}

console.log(`\nTOTAL ${entries.length}  OK ${entries.length - failures}  FAIL ${failures}`);
process.exit(failures > 0 ? 1 : 0);
