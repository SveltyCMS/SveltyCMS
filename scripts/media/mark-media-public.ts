#!/usr/bin/env bun
/**
 * @file scripts/media/mark-media-public.ts
 * @description Mark existing media rows `access: "public"` so
 * `MEDIA_ENFORCE_PRIVATE_ACCESS` can be enabled without locking out a library.
 *
 * Features:
 * - Dry run by default; `--apply` writes
 * - `access` is a top-level media column, so this uses the adapter CRUD update
 *   (`media.updateMetadata` only patches the `metadata` JSON blob)
 * - Optional `--tenant` and `--limit`; every write is tenant-scoped
 * - Pages the root plus every media folder, de-duplicated across pages
 * - Per-row isolation: one failed write is counted and logged, never aborts the sweep
 */

import type { DatabaseId, IDBAdapter, MediaItem } from "@src/databases/db-interface";

const PAGE_SIZE = 100;
const MEDIA_COLLECTION = "media_items";

export interface MarkArgs {
  apply: boolean;
  help: boolean;
  tenantId?: DatabaseId;
  limit: number | null;
}

export interface MarkStats {
  failed: number;
  marked: number;
  scanned: number;
}

function installBunRuneStubs(): void {
  const runes = globalThis as unknown as Record<string, unknown>;
  if (typeof runes.$state === "undefined") {
    const identity = <T>(value: T): T => value;
    runes.$state = Object.assign(identity, { raw: identity });
  }
  if (typeof runes.$derived === "undefined") {
    runes.$derived = <T>(value: T): T => value;
  }
}

export function parseArgs(argv: readonly string[]): MarkArgs {
  const args: MarkArgs = { apply: false, help: false, limit: null };
  for (const raw of argv) {
    if (raw === "--help" || raw === "-h") {
      args.help = true;
    } else if (raw === "--apply") {
      args.apply = true;
    } else if (raw.startsWith("--tenant=")) {
      const value = raw.slice("--tenant=".length).trim();
      if (!value) throw new Error("--tenant requires a value");
      args.tenantId = value as DatabaseId;
    } else if (raw.startsWith("--limit=")) {
      const value = Number(raw.slice("--limit=".length));
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error("--limit requires a positive integer");
      }
      args.limit = value;
    } else {
      throw new Error(`unknown argument: ${raw}`);
    }
  }
  return args;
}

function printHelp(): void {
  console.log(`Usage: bun run scripts/media/mark-media-public.ts [options]

  --apply             Write access="public" (default: dry run)
  --tenant=<id>       Restrict the sweep to one tenant
  --limit=<n>         Stop after n marked rows
  --help              Show this help

Run this BEFORE enabling MEDIA_ENFORCE_PRIVATE_ACCESS: uploads default to
"public" now, so only rows created earlier need the migration.`);
}

/** Walk every media folder (root included) and mark `private` rows public. */
export async function markMediaPublic(db: IDBAdapter, args: MarkArgs): Promise<MarkStats> {
  const stats: MarkStats = { failed: 0, marked: 0, scanned: 0 };
  const seen = new Set<string>();
  const tenantOptions = { tenantId: args.tenantId };

  const folders = await db.media.folders.getTree(undefined, tenantOptions);
  if (!folders.success) {
    throw new Error(folders.message || "could not list media folders");
  }

  const folderIds: Array<DatabaseId | undefined> = [
    undefined,
    ...folders.data.map((folder) => folder._id),
  ];

  let limitReached = false;
  scan: for (const folderId of folderIds) {
    let page = 1;
    for (;;) {
      const result = await db.media.files.getByFolder(folderId, {
        ...tenantOptions,
        page,
        pageSize: PAGE_SIZE,
        sortField: "createdAt",
        sortDirection: "asc",
      });
      if (!result.success) {
        throw new Error(
          result.message || `could not list media (folder "${String(folderId ?? "root")}")`,
        );
      }

      for (const row of result.data.items) {
        const rowId = String(row._id);
        if (seen.has(rowId)) continue;
        seen.add(rowId);
        stats.scanned += 1;

        if (row.access === "public") continue;

        const label = typeof row.filename === "string" && row.filename ? row.filename : rowId;
        if (!args.apply) {
          stats.marked += 1;
          if (stats.marked <= 20)
            console.log(`  • ${label}: would mark public (was ${row.access})`);
        } else {
          try {
            const updated = await db.crud.update<MediaItem>(
              MEDIA_COLLECTION,
              row._id,
              { access: "public" },
              tenantOptions,
            );
            if (!updated.success) throw new Error(updated.message || "update failed");
            stats.marked += 1;
          } catch (err) {
            stats.failed += 1;
            console.error(`  ✖ ${label}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        if (args.limit !== null && stats.marked >= args.limit) {
          limitReached = true;
          break scan;
        }
      }

      if (!result.data.hasNextPage) break;
      page += 1;
    }
  }

  if (limitReached) console.log(`  (stopped at --limit=${args.limit})`);
  return stats;
}

export async function main(argv: readonly string[]): Promise<number> {
  let args: MarkArgs;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.error(`[media:mark-public] ${err instanceof Error ? err.message : String(err)}`);
    printHelp();
    return 1;
  }
  if (args.help) {
    printHelp();
    return 0;
  }

  installBunRuneStubs();

  let db: IDBAdapter;
  try {
    const [{ loadAdapters }, dbModule, configState] = await Promise.all([
      import("@src/databases/db-init"),
      import("@src/databases/db"),
      import("@src/databases/config-state"),
    ]);
    const config = dbModule.loadPrivateConfig();
    const adapter = await loadAdapters(config);
    if (!adapter) throw new Error("could not load a database adapter");
    const connected = await adapter.connect(configState.getDatabaseConnectionString());
    if (!connected.success) throw new Error(connected.message || "database connection failed");
    db = adapter;
  } catch (err) {
    console.error(`[media:mark-public] fatal: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  try {
    console.log(
      `\n[media:mark-public] mode=${args.apply ? "APPLY" : "DRY RUN"} tenant=${args.tenantId ?? "all"}\n`,
    );
    const stats = await markMediaPublic(db, args);
    console.log(
      `\n  scanned ${stats.scanned} · ${args.apply ? "marked" : "would mark"} ${stats.marked} · failed ${stats.failed}`,
    );
    if (!args.apply) console.log("  re-run with --apply to persist\n");
    return stats.failed > 0 ? 2 : 0;
  } finally {
    await db.disconnect?.();
  }
}

const isDirectCLI =
  typeof process !== "undefined" &&
  (process.argv?.[1]?.includes("mark-media-public") ??
    process.argv?.[1]?.endsWith("mark-media-public.ts") ??
    false);

if (isDirectCLI) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exit(code);
    })
    .catch((err) => {
      console.error("Fatal:", err);
      process.exit(1);
    });
}
