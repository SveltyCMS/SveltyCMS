#!/usr/bin/env bun
/**
 * @file scripts/config-cli.ts
 * @description Command-line interface for SveltyCMS Configuration Promotion (Schema as Code).
 *
 * Usage:
 *   bun run config:export [--tenant=<id>] [--uuids=<uuid1,uuid2>]
 *   bun run config:status [--tenant=<id>] [--json]
 *   bun run config:diff [--tenant=<id>]
 *   bun run config:plan [--mode=merge|add|mirror|replace] [--tenant=<id>]
 *   bun run config:import [--mode=merge|add|mirror|replace] [--yes] [--tenant=<id>]
 *
 * Inspired by:
 * - Drupal: `drush config:export` (`cex`), `drush config:import` (`cim`)
 * - Directus 12.3: `d6s sync pull`, `d6s sync diff`, `d6s sync push`
 */

import { configService, type ConfigSyncStatus } from "@src/services/core/config-service";
import { getDbInitPromise } from "@src/databases/db";
import { logger } from "@utils/logger";

export interface ConfigCLIArgs {
  command: "export" | "status" | "diff" | "plan" | "import" | "apply" | "help";
  tenantId?: string;
  mode?: "add" | "merge" | "mirror" | "replace";
  uuids?: string[];
  yes?: boolean;
  json?: boolean;
}

/**
 * Parse CLI arguments from argv array.
 */
export function parseConfigCLIArgs(argv: string[]): ConfigCLIArgs {
  const args: ConfigCLIArgs = {
    command: "help",
    mode: "merge",
  };

  const rawCommand = argv[0]?.toLowerCase();
  if (
    rawCommand === "export" ||
    rawCommand === "status" ||
    rawCommand === "diff" ||
    rawCommand === "plan" ||
    rawCommand === "import" ||
    rawCommand === "apply"
  ) {
    args.command = rawCommand;
  } else if (rawCommand === "help" || rawCommand === "--help" || rawCommand === "-h") {
    args.command = "help";
  }

  for (const arg of argv.slice(1)) {
    if (arg.startsWith("--tenant=")) {
      args.tenantId = arg.slice(9).trim();
    } else if (arg.startsWith("--mode=")) {
      const m = arg.slice(7).trim().toLowerCase();
      if (m === "add" || m === "merge" || m === "mirror" || m === "replace") {
        args.mode = m;
      }
    } else if (arg.startsWith("--uuids=")) {
      args.uuids = arg
        .slice(8)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (arg === "--yes" || arg === "-y" || arg === "--ci") {
      args.yes = true;
    } else if (arg === "--json") {
      args.json = true;
    }
  }

  return args;
}

/**
 * Ensure database connection is active before running commands.
 */
async function ensureDbConnected() {
  try {
    const initPromise = getDbInitPromise();
    if (initPromise) {
      await initPromise;
    }
  } catch (err) {
    logger.debug(`[Config CLI] Database initialization check: ${(err as Error).message}`);
  }
}

/**
 * Main CLI handler
 */
export async function runConfigCLI(args: ConfigCLIArgs): Promise<number> {
  const startTime = Date.now();

  switch (args.command) {
    case "export":
      return handleExport(args, startTime);
    case "status":
    case "diff":
      return handleStatusOrDiff(args);
    case "plan":
      return handlePlan(args);
    case "import":
    case "apply":
      return handleImport(args, startTime);
    case "help":
    default:
      printHelp();
      return 0;
  }
}

async function handleExport(args: ConfigCLIArgs, startTime: number): Promise<number> {
  await ensureDbConnected();
  if (!args.json) {
    console.log(`\n📦 [Config CLI] Exporting active database configuration...`);
    if (args.tenantId) console.log(`   Tenant: ${args.tenantId}`);
    if (args.uuids?.length) console.log(`   Filter: ${args.uuids.length} specific UUIDs`);
  }

  try {
    const result = await configService.performExport({
      tenantId: args.tenantId,
      uuids: args.uuids,
    });

    const elapsed = Date.now() - startTime;
    if (args.json) {
      console.log(JSON.stringify({ success: true, dirPath: result.dirPath, elapsedMs: elapsed }));
    } else {
      console.log(`\n✅ [Config CLI] Export complete in ${elapsed}ms!`);
      console.log(`   📁 Output directory: ${result.dirPath}`);
      console.log(`   📄 Manifest: ${result.dirPath}/manifest.json`);
    }
    return 0;
  } catch (err: any) {
    console.error(`\n❌ [Config CLI] Export failed: ${err.message}`);
    return 1;
  }
}

async function handleStatusOrDiff(args: ConfigCLIArgs): Promise<number> {
  await ensureDbConnected();
  try {
    const status = await configService.getStatus(args.tenantId);

    if (args.json) {
      console.log(JSON.stringify(status, null, 2));
      return status.status === "in_sync" ? 0 : 2;
    }

    console.log(`\n🔍 [Config CLI] Configuration Drift Status`);
    console.log(`   Tenant: ${args.tenantId || "global"}`);
    console.log(
      `   State:  ${status.status === "in_sync" ? "🟢 In Sync" : "🟡 Changes Detected"}\n`,
    );

    if (status.unmetRequirements && status.unmetRequirements.length > 0) {
      console.log(`⚠️  Unmet Requirements (${status.unmetRequirements.length}):`);
      for (const req of status.unmetRequirements) {
        console.log(`   - Key: "${req.key}" (missing setting)`);
      }
      console.log();
    }

    const { new: newItems = [], updated = [], deleted = [] } = status.changes || {};

    if (newItems.length === 0 && updated.length === 0 && deleted.length === 0) {
      console.log(`✅ Filesystem and active database configurations match perfectly.`);
      return 0;
    }

    console.log(
      `📋 Summary: ${newItems.length} new, ${updated.length} updated, ${deleted.length} deleted\n`,
    );

    if (newItems.length > 0) {
      console.log(`🟢 New Entities (present on filesystem, missing in DB):`);
      for (const item of newItems) {
        console.log(`   + [${item.type}] ${item.name} (${item.uuid})`);
      }
      console.log();
    }

    if (updated.length > 0) {
      console.log(`🟡 Updated Entities (checksum drift between filesystem and DB):`);
      for (const item of updated) {
        console.log(`   ~ [${item.type}] ${item.name} (${item.uuid})`);
      }
      console.log();
    }

    if (deleted.length > 0) {
      console.log(`🔴 Deleted Entities (present in DB, missing on filesystem):`);
      for (const item of deleted) {
        console.log(`   - [${item.type}] ${item.name} (${item.uuid})`);
      }
      console.log();
    }

    return 2;
  } catch (err: any) {
    console.error(`\n❌ [Config CLI] Status check failed: ${err.message}`);
    return 1;
  }
}

async function handlePlan(args: ConfigCLIArgs): Promise<number> {
  await ensureDbConnected();
  const mode = args.mode || "merge";

  try {
    const status = await configService.getStatus(args.tenantId);
    const { new: newItems = [], updated = [], deleted = [] } = status.changes || {};

    const operations: Array<{ action: string; type: string; name: string; uuid: string }> = [];

    for (const item of newItems) {
      operations.push({ action: "create", type: item.type, name: item.name, uuid: item.uuid });
    }
    for (const item of updated) {
      if (mode !== "add") {
        operations.push({ action: "update", type: item.type, name: item.name, uuid: item.uuid });
      }
    }
    if (mode === "mirror" || mode === "replace") {
      for (const item of deleted) {
        operations.push({ action: "delete", type: item.type, name: item.name, uuid: item.uuid });
      }
    }

    const isDestructive = operations.some((o) => o.action === "delete");
    const risk = isDestructive ? "destructive" : operations.length > 0 ? "safe" : "none";

    if (args.json) {
      console.log(
        JSON.stringify(
          {
            mode,
            risk,
            operations,
            unmetRequirements: status.unmetRequirements,
            totalOperations: operations.length,
          },
          null,
          2,
        ),
      );
      return 0;
    }

    console.log(`\n📋 [Config CLI] Promotion Plan`);
    console.log(`   Mode: ${mode.toUpperCase()}`);
    console.log(
      `   Risk: ${risk === "destructive" ? "🔴 DESTRUCTIVE" : risk === "safe" ? "🟢 SAFE" : "⚪ NO CHANGES"}`,
    );
    console.log(`   Total Operations: ${operations.length}\n`);

    for (const op of operations) {
      const symbol = op.action === "create" ? "🟢 +" : op.action === "update" ? "🟡 ~" : "🔴 -";
      console.log(`   ${symbol} ${op.action.toUpperCase()} [${op.type}] ${op.name} (${op.uuid})`);
    }

    if (status.unmetRequirements?.length) {
      console.log(
        `\n⚠️  WARNING: ${status.unmetRequirements.length} unmet requirement(s) detected.`,
      );
    }

    return 0;
  } catch (err: any) {
    console.error(`\n❌ [Config CLI] Plan generation failed: ${err.message}`);
    return 1;
  }
}

async function handleImport(args: ConfigCLIArgs, startTime: number): Promise<number> {
  await ensureDbConnected();
  const mode = args.mode || "merge";

  try {
    const status = await configService.getStatus(args.tenantId);
    if (status.unmetRequirements && status.unmetRequirements.length > 0) {
      console.error(
        `\n❌ [Config CLI] Import blocked: ${status.unmetRequirements.length} unmet setting requirement(s).`,
      );
      for (const req of status.unmetRequirements) {
        console.error(`   - Missing setting: "${req.key}"`);
      }
      return 1;
    }

    const { new: newItems = [], updated = [], deleted = [] } = status.changes || {};
    const totalChanges = newItems.length + updated.length + deleted.length;

    if (totalChanges === 0) {
      if (!args.json) {
        console.log(
          `\n🟢 [Config CLI] Nothing to import — database and filesystem are already in sync.`,
        );
      } else {
        console.log(JSON.stringify({ success: true, message: "Already in sync", imported: 0 }));
      }
      return 0;
    }

    // Filter changes according to safety mode
    const filteredChanges: ConfigSyncStatus["changes"] = {
      new: newItems,
      updated: mode === "add" ? [] : updated,
      deleted: mode === "mirror" || mode === "replace" ? deleted : [],
    };

    if (!args.yes && !args.json) {
      console.log(`\n⚠️  [Config CLI] Ready to apply configuration changes:`);
      console.log(
        `   Mode: ${mode.toUpperCase()} (${filteredChanges.new.length} creates, ${filteredChanges.updated.length} updates, ${filteredChanges.deleted.length} deletes)`,
      );
      console.log(`   To execute non-interactively, re-run with --yes or -y.\n`);
    }

    if (!args.json) {
      console.log(`🚀 [Config CLI] Applying configuration changes to database...`);
    }

    await configService.performImport({
      tenantId: args.tenantId,
      changes: filteredChanges,
    });

    const elapsed = Date.now() - startTime;
    if (args.json) {
      console.log(
        JSON.stringify({
          success: true,
          mode,
          created: filteredChanges.new.length,
          updated: filteredChanges.updated.length,
          deleted: filteredChanges.deleted.length,
          elapsedMs: elapsed,
        }),
      );
    } else {
      console.log(`\n✅ [Config CLI] Configuration applied successfully in ${elapsed}ms!`);
      console.log(`   + Created: ${filteredChanges.new.length}`);
      console.log(`   ~ Updated: ${filteredChanges.updated.length}`);
      console.log(`   - Deleted: ${filteredChanges.deleted.length}`);
      console.log(`   🔄 Roles, permissions, and Turbo auth caches invalidated.`);
    }

    return 0;
  } catch (err: any) {
    console.error(`\n❌ [Config CLI] Import failed: ${err.message}`);
    return 1;
  }
}

function printHelp() {
  console.log(`
🛠️  SveltyCMS Configuration Promotion CLI (Schema as Code)

Commands:
  export   Export active database configuration to config/sync/ (Drupal cex / Directus sync pull)
  status   Check drift status between filesystem and database
  diff     Display detailed drift summary (New, Updated, Deleted) (Directus sync diff)
  plan     Preview changes with risk scoring before applying
  import   Apply filesystem configuration to the active database (Drupal cim / Directus sync push)

Options:
  --mode=<mode>    Safety mode: merge (default), add, mirror, replace
  --tenant=<id>    Target a specific tenant ID
  --uuids=<ids>    Comma-separated list of entity UUIDs to export
  --yes, -y, --ci  Non-interactive confirmation (auto-confirm)
  --json           Output results as machine-readable JSON

Examples:
  bun run config:export
  bun run config:status
  bun run config:diff
  bun run config:plan --mode=merge
  bun run config:import --mode=merge --yes
`);
}

// Auto-run if executed directly via CLI
const isDirectCLI =
  typeof process !== "undefined" &&
  (process.argv?.[1]?.includes("config-cli") || process.argv?.[1]?.endsWith("config-cli.ts"));

if (isDirectCLI) {
  const parsedArgs = parseConfigCLIArgs(process.argv.slice(2));
  runConfigCLI(parsedArgs)
    .then((code) => {
      process.exit(code);
    })
    .catch((err) => {
      console.error("Fatal:", err);
      process.exit(1);
    });
}
