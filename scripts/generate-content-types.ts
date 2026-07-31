/**
 * @file scripts/generate-content-types.ts
 * @description Regenerates `src/content/types.generated.ts` from compiled collection schemas.
 *
 * Called from Vite HMR after a successful collection compile (when processed > 0).
 * Safe to call when no collections exist — writes a permissive union.
 *
 * ### Features:
 * - Scans the `.compiledCollections` directory tree for `*.js` files (and optional tenant subdirs)
 * - Builds `ContentTypes` string-union + `CollectionMap` field stubs
 * - Atomic write via temp file when content changes
 */

import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ViteDevServer } from "vite";

const GENERATED_PATH = path.resolve(process.cwd(), "src/content/types.generated.ts");
const COMPILED_DIR = path.resolve(process.cwd(), ".compiledCollections");

interface FieldStub {
  db_fieldName?: string;
  name?: string;
  type?: string;
}

interface SchemaStub {
  name?: string;
  _id?: string;
  fields?: FieldStub[];
}

async function walkJsFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "test-collections") continue;
      out.push(...(await walkJsFiles(full)));
    } else if (entry.isFile() && entry.name.endsWith(".js") && !entry.name.startsWith(".")) {
      out.push(full);
    }
  }
  return out;
}

async function loadSchemaStub(filePath: string): Promise<SchemaStub | null> {
  try {
    const url = pathToFileURL(filePath);
    url.search = `?v=${Date.now()}`;
    const mod = await import(/* @vite-ignore */ url.href);
    let schema = mod.default || mod.schema || mod;
    if (schema?.default) schema = schema.default;
    if (schema?.schema) schema = schema.schema;
    if (!schema || typeof schema !== "object") return null;
    return schema as SchemaStub;
  } catch {
    return null;
  }
}

function fieldTsType(_field: FieldStub): string {
  // Best-effort stubs for generated map — keep loose for dynamic CMS
  return "string";
}

function buildGeneratedSource(schemas: SchemaStub[]): string {
  const names = [
    ...new Set(
      schemas
        .map((s) => String(s.name || s._id || "").trim())
        .filter(Boolean)
        .map((n) => n.replace(/[^a-zA-Z0-9_]/g, "_")),
    ),
  ].sort();

  const union =
    names.length > 0
      ? names.map((n) => `"${n}"`).join(" | ") + " | (string & {})"
      : "(string & {})";

  const mapEntries = names
    .map((name) => {
      const schema = schemas.find(
        (s) => String(s.name || s._id || "").replace(/[^a-zA-Z0-9_]/g, "_") === name,
      );
      const fields = schema?.fields || [];
      const props = fields
        .map((f) => {
          const key = (f.db_fieldName || f.name || "").replace(/[^a-zA-Z0-9_]/g, "_");
          if (!key) return null;
          return `    ${key}: ${fieldTsType(f)};`;
        })
        .filter(Boolean)
        .join("\n");
      if (!props) {
        return `  ${name}: CollectionEntry & Record<string, any>;`;
      }
      return `  ${name}: CollectionEntry & {\n${props}\n  };`;
    })
    .join("\n");

  return `/**
 * @file src/content/types.generated.ts
 * @description Automatically generated collection and entry types for SveltyCMS.
 * This file is managed by the Vite build plugin and should NOT be edited manually.
 */

import type { CollectionEntry } from "./types";

/* AUTOGEN_START: ContentTypes */
export type ContentTypes = ${union};

export interface CollectionMap {
  [key: string]: CollectionEntry & Record<string, any>;
${mapEntries}
}
/* AUTOGEN_END: ContentTypes */
`;
}

/**
 * Scan compiled collections and rewrite types.generated.ts when the union changes.
 */
export async function generateContentTypes(_server?: ViteDevServer): Promise<{
  written: boolean;
  collectionCount: number;
}> {
  const files = await walkJsFiles(COMPILED_DIR);
  const schemas: SchemaStub[] = [];
  for (const file of files) {
    const stub = await loadSchemaStub(file);
    if (stub) schemas.push(stub);
  }

  const next = buildGeneratedSource(schemas);
  let prev = "";
  try {
    prev = await fs.readFile(GENERATED_PATH, "utf8");
  } catch {
    /* first write */
  }

  // Compare AUTOGEN block only to avoid thrashing on header edits
  const extract = (s: string) => {
    const m = s.match(
      /\/\* AUTOGEN_START: ContentTypes \*\/[\s\S]*\/\* AUTOGEN_END: ContentTypes \*\//,
    );
    return m?.[0] ?? s;
  };

  if (extract(prev) === extract(next)) {
    return { written: false, collectionCount: schemas.length };
  }

  const dir = path.dirname(GENERATED_PATH);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${GENERATED_PATH}.${process.pid}.tmp`;
  await fs.writeFile(tmp, next, "utf8");
  await fs.rename(tmp, GENERATED_PATH).catch(async () => {
    await fs.copyFile(tmp, GENERATED_PATH);
    await fs.unlink(tmp).catch(() => undefined);
  });

  return { written: true, collectionCount: schemas.length };
}

export default generateContentTypes;
