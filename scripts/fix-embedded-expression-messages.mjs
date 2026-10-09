/**
 * @file scripts/fix-embedded-expression-messages.mjs
 * @description One-shot repair of the admin-copy i18n sweep artifacts:
 *   removes the dead `theme_total` key and collapses `theme_sidebar` /
 *   `theme_catalog_source` to plain labels (their computed parts already
 *   render in the calling markup). Targeted line edits only — all other
 *   lines stay byte-identical.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const locales = ["en", "de", "es", "fr", "it", "nl", "pl", "ar"];

for (const loc of locales) {
  const path = join(root, "src", "messages", `${loc}.json`);
  const raw = readFileSync(path, "utf8");
  const data = JSON.parse(raw);
  const out = [];

  for (const line of raw.split("\n")) {
    if (line.includes('"theme_total":')) continue; // dead key — drop
    let l = line;
    if (l.includes('"theme_sidebar":')) {
      l = l.replace(/\{.*$/, "{").replace(/,\s*$/, ","); // keep label only
      const label = JSON.stringify(
        data.theme_sidebar.slice(0, data.theme_sidebar.indexOf("{")).trimEnd(),
      );
      const indent = l.match(/^\s*/)[0];
      l = `${indent}"theme_sidebar": ${label},`;
    }
    if (l.includes('"theme_catalog_source":')) {
      const label = JSON.stringify(
        data.theme_catalog_source.slice(0, data.theme_catalog_source.indexOf("{")).trimEnd(),
      );
      const indent = l.match(/^\s*/)[0];
      l = `${indent}"theme_catalog_source": ${label},`;
    }
    out.push(l);
  }

  const fixed = out.join("\n");
  if (fixed === raw) {
    console.log(`${loc}.json: no change`);
    continue;
  }
  writeFileSync(path, fixed);
  const recheck = JSON.parse(fixed);
  const removed = !("theme_total" in recheck);
  console.log(
    `${loc}.json: fixed — theme_sidebar=${JSON.stringify(recheck.theme_sidebar)} theme_catalog_source=${JSON.stringify(recheck.theme_catalog_source)} theme_total_removed=${removed}`,
  );
}
