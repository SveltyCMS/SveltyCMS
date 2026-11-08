#!/usr/bin/env bun
/**
 * @file scripts/media/backfill-previews.ts
 * @description Backfill gallery previews for document media rows created before
 * the document-preview pipeline.
 *
 * Features:
 * - Dry run by default; `--apply` persists `thumbnails` + `updatedAt`
 * - Scans the root plus every media folder in 50-row pages
 * - Tenant, document-kind and row-count filters
 * - Per-row isolation: missing originals, malformed documents and storage
 *   failures are counted and logged without aborting the sweep
 * - Lazy DB/storage imports so the pure helpers stay unit-testable without a DB
 */

import { logger } from "@utils/logger";
import { nowISODateString } from "@src/utils/date";
import type {
  DatabaseId,
  EntityUpdate,
  IDBAdapter,
  ISODateString,
  MediaItem,
} from "@src/databases/db-interface";
import type { DocumentPreviewKind } from "@src/utils/media/media-storage.server";

/** Document families the backfill can render. `csv` maps to `delimited`. */
export type BackfillKindFilter = "pdf" | "csv" | "office" | "all";

export interface BackfillArgs {
  /** Write `thumbnails` + `updatedAt`; false means dry run. */
  apply: boolean;
  help: boolean;
  kind: BackfillKindFilter;
  /** Maximum candidate rows processed in this run; `null` means no cap. */
  limit: number | null;
  tenantId?: DatabaseId;
}

export interface BackfillStats {
  candidates: number;
  failed: number;
  repaired: number;
  scanned: number;
  skipped: number;
}

type StorageModule = typeof import("@src/utils/media/media-storage.server");
type MediaUtilsModule = typeof import("@src/utils/media/media-utils");

/** `updatedAt` is adapter-managed on SQL/Mongo but stays part of the backfill contract. */
type MediaBackfillPatch = EntityUpdate<MediaItem> & { updatedAt: ISODateString };

const PAGE_SIZE = 50;
const KIND_FILTERS: readonly BackfillKindFilter[] = ["pdf", "csv", "office", "all"];

function isBackfillKind(value: string): value is BackfillKindFilter {
  return (KIND_FILTERS as readonly string[]).includes(value);
}

/**
 * Parse CLI arguments. Throws on invalid values so `main()` can print usage and
 * exit non-zero before touching the database.
 */
export function parseBackfillArgs(argv: readonly string[]): BackfillArgs {
  const args: BackfillArgs = {
    apply: false,
    help: false,
    kind: "all",
    limit: null,
  };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--dry-run") {
      args.apply = false;
    } else if (arg === "--apply") {
      args.apply = true;
    } else if (arg.startsWith("--limit=")) {
      const raw = arg.slice("--limit=".length).trim();
      if (!/^\d+$/.test(raw)) {
        throw new Error(`--limit must be a positive integer (received "${raw}")`);
      }
      const value = Number(raw);
      if (!Number.isSafeInteger(value) || value <= 0) {
        throw new Error(`--limit must be a positive integer (received "${raw}")`);
      }
      args.limit = value;
    } else if (arg === "--limit") {
      throw new Error("--limit requires a value: --limit=N");
    } else if (arg.startsWith("--tenant=")) {
      const tenantId = arg.slice("--tenant=".length).trim();
      if (!tenantId) throw new Error("--tenant requires a non-empty tenant id");
      args.tenantId = tenantId as DatabaseId;
    } else if (arg === "--tenant") {
      throw new Error("--tenant requires a value: --tenant=<id>");
    } else if (arg.startsWith("--kind=")) {
      const kind = arg.slice("--kind=".length).trim().toLowerCase();
      if (!isBackfillKind(kind)) {
        throw new Error(`--kind must be one of ${KIND_FILTERS.join(", ")} (received "${kind}")`);
      }
      args.kind = kind;
    } else if (arg === "--kind") {
      throw new Error("--kind requires a value: --kind=pdf|csv|office|all");
    }
    // Unknown flags are ignored so the command stays forward-compatible.
  }

  return args;
}

/**
 * Whether a media row still needs a document preview.
 *
 * `kind` is the result of `detectDocumentPreviewKind()`: `null` means image,
 * video, audio or any other asset with its own derivative path. `csv` is the
 * operator-facing name for the detector's `delimited` family.
 */
export function needsBackfill(
  kind: DocumentPreviewKind | null,
  thumbnails: Record<string, unknown> | null | undefined,
  filter: BackfillKindFilter = "all",
): boolean {
  if (!kind) return false;
  if (filter !== "all") {
    const matches = filter === "csv" ? kind === "delimited" : kind === filter;
    if (!matches) return false;
  }
  return Object.keys(thumbnails ?? {}).length === 0;
}

/**
 * Plain Bun cannot execute the `.svelte.ts` rune modules that CMS internals pull
 * in (`media-utils` → `global-settings.svelte.ts`). The CLI only calls server-side
 * functions, which never read the reactive store, so inert stubs are enough for
 * the lazy imports to resolve. SvelteKit builds compile the real runes and never
 * execute this path.
 */
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

async function backfillRow(
  row: MediaItem,
  kind: DocumentPreviewKind,
  args: BackfillArgs,
  db: IDBAdapter,
  storage: StorageModule,
  mediaUtils: MediaUtilsModule,
  stats: BackfillStats,
): Promise<void> {
  const label = typeof row.filename === "string" && row.filename ? row.filename : String(row._id);

  if (
    typeof row.filename !== "string" ||
    typeof row.mimeType !== "string" ||
    typeof row.hash !== "string" ||
    typeof row.path !== "string"
  ) {
    stats.failed += 1;
    console.warn(`  ✖ ${label}: row is missing filename/mimeType/hash/path`);
    return;
  }

  try {
    const relPath = mediaUtils.resolveMediaRelPath(row);
    if (!relPath) throw new Error("stored path is empty");

    const buffer = await storage.getFile(relPath);

    if (!args.apply) {
      // Render-only: do not write derivative files in a dry run.
      const rendered = await storage.renderDocumentPreview(buffer, row.filename, row.mimeType);
      if (!rendered) {
        stats.skipped += 1;
        console.log(
          `  - ${label}: no preview produced (${kind}; unsupported, malformed or converter missing)`,
        );
        return;
      }
      stats.repaired += 1;
      console.log(`  • ${label}: would generate preview`);
      return;
    }

    const preview = await storage.buildDocumentPreview(
      buffer,
      row.hash,
      row.filename,
      row.mimeType,
      row.tenantId ?? args.tenantId ?? null,
    );

    const previewCount = Object.keys(preview.thumbnails ?? {}).length;
    if (previewCount === 0) {
      stats.skipped += 1;
      console.log(`  - ${label}: no preview produced (${kind}; unsupported or malformed)`);
      return;
    }

    const patch: MediaBackfillPatch = {
      thumbnails: preview.thumbnails,
      updatedAt: nowISODateString(),
    };
    const result = await db.crud.update<MediaItem>("media", row._id, patch, {
      tenantId: row.tenantId !== undefined ? row.tenantId : args.tenantId,
    });
    if (!result.success) throw new Error(result.message || "database update failed");

    stats.repaired += 1;
    console.log(`  ✔ ${label}: wrote ${previewCount} preview size(s)`);
  } catch (err) {
    stats.failed += 1;
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`  ✖ ${label}: ${message}`);
    logger.debug("[media:backfill-previews] row failed", { id: row._id, error: message });
  }
}

async function runBackfill(
  db: IDBAdapter,
  args: BackfillArgs,
  storage: StorageModule,
  mediaUtils: MediaUtilsModule,
): Promise<{ stats: BackfillStats; limitReached: boolean }> {
  const stats: BackfillStats = {
    candidates: 0,
    failed: 0,
    repaired: 0,
    scanned: 0,
    skipped: 0,
  };
  const seen = new Set<string>();
  const tenantOptions = { tenantId: args.tenantId };

  const folders = await db.media.folders.getTree(undefined, tenantOptions);
  if (!folders.success) {
    throw new Error(folders.message || "could not list media folders");
  }

  // `getByFolder(undefined)` is the root folder; every virtual folder is paged
  // separately so rows moved out of the root are not missed.
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
        // SQL adapters only paginate deterministically when a sort is supplied.
        sortField: "createdAt",
        sortDirection: "asc",
      });
      if (!result.success) {
        throw new Error(
          result.message || `could not list media items (folder "${String(folderId ?? "root")}")`,
        );
      }

      for (const row of result.data.items) {
        const rowId = String(row._id);
        if (seen.has(rowId)) continue;
        seen.add(rowId);
        stats.scanned += 1;

        const kind = storage.detectDocumentPreviewKind(row.filename ?? "", row.mimeType ?? "");
        if (!kind || !needsBackfill(kind, row.thumbnails, args.kind)) continue;

        stats.candidates += 1;
        await backfillRow(row, kind, args, db, storage, mediaUtils, stats);

        if (args.limit !== null && stats.candidates >= args.limit) {
          limitReached = true;
          break scan;
        }
      }

      if (!result.data.hasNextPage) break;
      page += 1;
    }
  }

  return { stats, limitReached };
}

function printSummary(args: BackfillArgs, stats: BackfillStats, limitReached: boolean): void {
  console.log("\nSummary");
  console.log(`  scanned:    ${stats.scanned}`);
  console.log(`  candidates: ${stats.candidates}`);
  console.log(`  repaired:   ${stats.repaired}${args.apply ? "" : " (dry run — no rows updated)"}`);
  console.log(`  skipped:    ${stats.skipped}`);
  console.log(`  failed:     ${stats.failed}`);

  if (limitReached) {
    console.log(`\nStopped after --limit=${String(args.limit)}; re-run to continue the sweep.`);
  }

  if (!args.apply) {
    const filters = [
      args.tenantId ? `--tenant=${args.tenantId}` : "",
      args.kind !== "all" ? `--kind=${args.kind}` : "",
    ].filter(Boolean);
    console.log("\nRe-run with --apply to persist the previews:");
    console.log(
      `  bun run media:backfill-previews --apply${filters.length > 0 ? ` ${filters.join(" ")}` : ""}`,
    );
  }
}

function printHelp(): void {
  console.log(`
Usage: bun run media:backfill-previews [options]

Repair document previews for media rows uploaded before the preview pipeline.

Options:
  --dry-run         Report what would change (default)
  --apply           Write thumbnails + updatedAt to each candidate row
  --limit=N         Stop after N candidate rows (default: no limit)
  --tenant=<id>     Scope the sweep to one tenant
  --kind=<family>   pdf | csv | office | all (default: all)
  --help, -h        Show this help

Exit codes:
  0  Sweep completed (per-row skips and failures are counted, not fatal)
  1  Fatal boot/list/argument error
`);
}

/**
 * CLI entry point. Exported so the orchestration can be exercised in integration
 * harnesses; the direct-run guard below keeps unit-test imports side-effect free.
 */
export async function main(argv: readonly string[]): Promise<number> {
  let args: BackfillArgs;
  try {
    args = parseBackfillArgs(argv);
  } catch (err) {
    console.error(`[media:backfill-previews] ${err instanceof Error ? err.message : String(err)}`);
    printHelp();
    return 1;
  }

  if (args.help) {
    printHelp();
    return 0;
  }

  installBunRuneStubs();

  let db: IDBAdapter;
  let storage: StorageModule;
  let mediaUtils: MediaUtilsModule;
  try {
    // Boot only the database adapter. The full `initializeDatabase()` registry
    // pulls the content service, which imports SvelteKit's virtual `$app`
    // module — unavailable under plain Bun. The media namespace is initialized
    // by the adapter's own connect(), which is all this sweep needs.
    const [{ loadAdapters }, dbModule, configState] = await Promise.all([
      import("@src/databases/db-init"),
      import("@src/databases/db"),
      import("@src/databases/config-state"),
    ]);
    const config = dbModule.loadPrivateConfig();
    const adapter = await loadAdapters(config);
    if (!adapter) throw new Error("could not load a database adapter");
    // `loadPrivateConfig()` populated config-state; pass the resolved string
    // explicitly instead of relying on the adapter's internal no-arg fallback.
    const connected = await adapter.connect(configState.getDatabaseConnectionString());
    if (!connected.success) {
      throw new Error(connected.message || "database connection failed");
    }
    db = adapter;

    // Import after boot: media-storage resolves the configured IMAGE_SIZES ladder
    // from the settings cache when the module is evaluated.
    storage = await import("@src/utils/media/media-storage.server");
    mediaUtils = await import("@src/utils/media/media-utils");
  } catch (err) {
    console.error(
      `[media:backfill-previews] fatal: ${err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }

  const scope = [
    `kind=${args.kind}`,
    `tenant=${args.tenantId ?? "(default)"}`,
    `limit=${args.limit ?? "none"}`,
  ].join(" ");
  console.log(`[media:backfill-previews] ${args.apply ? "APPLY" : "DRY RUN"} (${scope})\n`);

  try {
    const { stats, limitReached } = await runBackfill(db, args, storage, mediaUtils);
    printSummary(args, stats, limitReached);
    return 0;
  } catch (err) {
    console.error(
      `[media:backfill-previews] fatal: ${err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }
}

// Auto-run only when executed directly (Vitest sets a different argv[1]).
const isDirectCLI =
  typeof process !== "undefined" &&
  (process.argv?.[1]?.includes("backfill-previews") ||
    process.argv?.[1]?.endsWith("backfill-previews.ts"));

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
