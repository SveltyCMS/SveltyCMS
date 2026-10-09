/**
 * @file scripts/add-page-title-suffix-key.mjs
 * @description One-shot: insert the `page_title_suffix` brand key into all
 *   locale catalogs, right after `page_title_fav_remove` (preserves key order).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const locales = ["en", "de", "es", "fr", "it", "nl", "pl", "ar"];

for (const loc of locales) {
  const path = join(root, "src", "messages", `${loc}.json`);
  const raw = readFileSync(path, "utf8");
  if (raw.includes('"page_title_suffix"')) {
    console.log(`${loc}.json: key already present`);
    continue;
  }
  const lines = raw.split("\n");
  const idx = lines.findIndex((l) => l.includes('"page_title_fav_remove"'));
  if (idx === -1) {
    console.error(`FAIL: ${loc}.json has no page_title_fav_remove`);
    process.exitCode = 1;
    continue;
  }
  lines.splice(idx + 1, 0, '  "page_title_suffix": "- SveltyCMS",');
  writeFileSync(path, lines.join("\n"));
  console.log(`${loc}.json: inserted`);
}
