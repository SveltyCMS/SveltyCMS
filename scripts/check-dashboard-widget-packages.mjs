#!/usr/bin/env node
/**
 * @file scripts/check-dashboard-widget-packages.mjs
 * @description Validates dashboard widget package folders are marketplace-ready.
 *
 * Every folder under `src/routes/(app)/dashboard/widgets/<id>/` must contain:
 * - exactly one `.svelte` component — `index.svelte` (the folder id is the
 *   package identity; legacy `{id}.svelte` / `{id}-widget.svelte` names are
 *   NOT accepted — they are rejected so the manifest contract stays strict),
 * - a valid `widget.json` manifest (required fields; `id` must match the
 *   folder; `component` must match the .svelte filename; `defaultSize` must be
 *   positive; `version` must be semver),
 * - a REQUIRED co-located `readme.mdx` marketplace description.
 *
 * Runs as part of `bun run check` (via `lint:widgets`). Exit code 1 on failure.
 *
 * CI / quiet mode: summary + FAIL lines only (CI=true or --quiet / --ci).
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const WIDGETS_DIR = "src/routes/(app)/dashboard/widgets";
const argv = process.argv.slice(2);
const QUIET =
  process.env.CI === "true" ||
  process.env.CI === "1" ||
  argv.includes("--quiet") ||
  argv.includes("--ci") ||
  process.env.CI_QUIET === "1" ||
  process.env.CI_QUIET === "true";

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
let okCount = 0;

function fail(msg) {
  failures += 1;
  console.error(`FAIL  ${msg}`);
}

function ok(msg) {
  okCount += 1;
  if (!QUIET) console.log(`OK    ${msg}`);
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
  let packageOk = true;
  const failOnce = (msg) => {
    packageOk = false;
    fail(msg);
  };

  // 1. Folder must be kebab-case
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(folder)) {
    failOnce(`${folder}/ folder is not kebab-case`);
  }

  // 2. Exactly one .svelte component — must be `index.svelte`
  const svelteFiles = readdirSync(dir).filter((f) => f.endsWith(".svelte"));
  if (svelteFiles.length !== 1) {
    failOnce(`${folder}/ must contain exactly one .svelte component (found ${svelteFiles.length})`);
  } else if (svelteFiles[0] !== "index.svelte") {
    failOnce(
      `${folder}/${svelteFiles[0]} must be named \`index.svelte\` (folder id is the package identity)`,
    );
  }

  // 3. widget.json manifest — present, valid JSON, required fields
  const manifestPath = join(dir, "widget.json");
  if (!existsSync(manifestPath)) {
    failOnce(`${folder}/ missing widget.json manifest`);
  } else {
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    } catch (err) {
      failOnce(`${folder}/widget.json is not valid JSON: ${err.message}`);
      continue;
    }
    for (const field of REQUIRED_MANIFEST_FIELDS) {
      if (!(field in manifest)) {
        failOnce(`${folder}/widget.json missing required field "${field}"`);
      }
    }
    if (manifest.id !== folder) {
      failOnce(`${folder}/widget.json "id" (${manifest.id}) must match folder name`);
    }
    if (svelteFiles.length === 1 && manifest.component !== svelteFiles[0].replace(".svelte", "")) {
      failOnce(`${folder}/widget.json "component" must match the .svelte filename`);
    }
    if (!VALID_LICENSES.includes(manifest.license)) {
      failOnce(`${folder}/widget.json invalid license "${manifest.license}"`);
    }
    if (!VALID_TYPES.includes(manifest.type)) {
      failOnce(`${folder}/widget.json invalid type "${manifest.type}"`);
    }
    if (manifest.category && !VALID_CATEGORIES.includes(manifest.category)) {
      failOnce(`${folder}/widget.json invalid category "${manifest.category}"`);
    }
    if (manifest.defaultSize && typeof manifest.defaultSize.w !== "number") {
      failOnce(`${folder}/widget.json defaultSize.w must be a number`);
    }
    if (manifest.defaultSize && typeof manifest.defaultSize.h !== "number") {
      failOnce(`${folder}/widget.json defaultSize.h must be a number`);
    }
    if (manifest.defaultSize) {
      const { w, h } = manifest.defaultSize;
      if (typeof w === "number" && (!Number.isFinite(w) || w <= 0)) {
        failOnce(`${folder}/widget.json defaultSize.w must be a positive number`);
      }
      if (typeof h === "number" && (!Number.isFinite(h) || h <= 0)) {
        failOnce(`${folder}/widget.json defaultSize.h must be a positive number`);
      }
    }
    if (
      typeof manifest.version !== "string" ||
      !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(manifest.version)
    ) {
      failOnce(`${folder}/widget.json version must be semver (e.g. 1.0.0)`);
    }
  }

  // 4. REQUIRED co-located readme.mdx marketplace description
  const mdxFiles = readdirSync(dir).filter((f) => f.endsWith(".mdx"));
  if (mdxFiles.length !== 1 || mdxFiles[0] !== "readme.mdx") {
    failOnce(
      `${folder}/ must contain exactly one \`readme.mdx\` marketplace description (found: ${mdxFiles.join(", ") || "none"})`,
    );
  } else if (packageOk) {
    ok(`${folder}/ manifest + ${svelteFiles.length} svelte + ${mdxFiles.length} mdx`);
  }
}

console.log(`dashboard-widgets: TOTAL ${entries.length}  OK ${okCount}  FAIL ${failures}`);
if (QUIET && failures === 0) {
  console.log("dashboard-widgets: all packages OK");
}
process.exit(failures > 0 ? 1 : 0);
