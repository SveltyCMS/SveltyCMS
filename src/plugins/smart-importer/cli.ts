/**
 * @file src/plugins/smart-importer/cli.ts
 * @description CLI commands for Smart AI-Driven Migration Pro.
 *
 * Usage:
 *   bun run migrate import --file=export.json --format=wordpress --collection=posts
 *   bun run migrate rollback --token=txn_abc123
 *   bun run migrate status --token=txn_abc123
 *   bun run migrate validate --file=export.json --format=drupal
 *   bun run migrate scaffold --file=export.json --format=strapi
 *   bun run migrate preset --save --name="WP Blog Import" --format=wordpress
 *   bun run migrate preset --list
 *   bun run migrate delta --file=export.json --format=wordpress --collection=posts
 *
 * Inspired by:
 * - Drupal: `drush migrate:import`, `drush migrate:rollback`, `drush migrate:status`
 * - Sanity: `sanity dataset import`
 * - Strapi: `strapi import`
 */

import { logger } from "@utils/logger";
import { nowISODateString } from "@utils/date";

interface CLIArgs {
  command: string;
  file?: string;
  format?: string;
  collection?: string;
  token?: string;
  name?: string;
  overwrite?: boolean;
  importMedia?: boolean;
  batchSize?: number;
}

/**
 * Parse CLI arguments from process.argv
 */
export function parseCLIArgs(args: string[]): CLIArgs {
  const result: CLIArgs = { command: args[0] || "help" };

  for (const arg of args.slice(1)) {
    if (arg.startsWith("--file=")) result.file = arg.slice(7);
    else if (arg.startsWith("--format=")) result.format = arg.slice(9);
    else if (arg.startsWith("--collection=")) result.collection = arg.slice(13);
    else if (arg.startsWith("--token=")) result.token = arg.slice(8);
    else if (arg.startsWith("--name=")) result.name = arg.slice(7);
    else if (arg === "--overwrite") result.overwrite = true;
    else if (arg === "--import-media") result.importMedia = true;
    else if (arg.startsWith("--batch-size=")) result.batchSize = parseInt(arg.slice(13));
  }

  return result;
}

/**
 * Main CLI entry point
 */
export async function runMigrationCLI(_args: CLIArgs, dbAdapter?: any): Promise<void> {
  const startTime = Date.now();

  switch (args.command) {
    case "import":
      await handleImport(args, dbAdapter);
      break;
    case "rollback":
      await handleRollback(args, dbAdapter);
      break;
    case "status":
      await handleStatus(args, dbAdapter);
      break;
    case "validate":
      await handleValidate(args);
      break;
    case "scaffold":
      await handleScaffold(args);
      break;
    case "delta":
      await handleDelta(args);
      break;
    case "preset":
      await handlePreset(args);
      break;
    case "help":
    default:
      printHelp();
      break;
  }

  logger.info(`[Migration CLI] Completed in ${Date.now() - startTime}ms`);
}

async function handleImport(args: CLIArgs, dbAdapter?: any) {
  if (!args.file || !args.format || !args.collection) {
    console.error("❌ import requires --file, --format, and --collection");
    process.exit(1);
  }

  console.log(`📥 Importing ${args.file} (format: ${args.format}) → ${args.collection}...`);

  try {
    const { parseFileToSNC, executeUCPIngestion } = await import("./index.server");
    const fs = await import("node:fs");
    const text = fs.readFileSync(args.file, "utf-8");
    const txnToken = crypto.randomUUID?.() || `cli_${Date.now()}`;
    const envelope = parseFileToSNC(text, args.format as any, txnToken);

    if (!envelope || envelope.entries.length === 0) {
      console.error("❌ No entries found in file");
      process.exit(1);
    }

    console.log(`📊 ${envelope.entries.length} entries detected`);

    const result = await executeUCPIngestion(
      dbAdapter,
      envelope,
      [],
      args.collection,
      {
        importMedia: args.importMedia || false,
        overwrite: args.overwrite || false,
        batchSize: args.batchSize || 100,
      },
      (progress) => {
        process.stdout.write(
          `\r   Progress: ${progress.current}/${progress.total} - ${progress.currentItem}`,
        );
      },
    );

    console.log(`\n✅ Import complete: ${result.imported} imported, ${result.failed} failed`);
  } catch (err: any) {
    console.error(`❌ Import failed: ${err.message}`);
    process.exit(1);
  }
}

async function handleRollback(args: CLIArgs, dbAdapter?: any) {
  if (!args.token) {
    console.error("❌ rollback requires --token");
    process.exit(1);
  }

  console.log(`↩ Rolling back transaction ${args.token}...`);

  try {
    const { rollbackTransaction } = await import("./index.server");
    const success = await rollbackTransaction(dbAdapter, args.token);
    console.log(success ? "✅ Rollback complete" : "⚠️ Transaction not found");
  } catch (err: any) {
    console.error(`❌ Rollback failed: ${err.message}`);
    process.exit(1);
  }
}

async function handleStatus(args: CLIArgs, dbAdapter?: any) {
  if (!args.token) {
    console.error("❌ status requires --token");
    process.exit(1);
  }

  try {
    const result = await dbAdapter?.crud.findOne("plugin_importer_ledger", {
      transactionToken: args.token,
    });
    if (result?.success && result.data) {
      const ledger = result.data as any;
      console.log("📋 Migration Status:");
      console.log(`   Token:      ${ledger.transactionToken}`);
      console.log(`   Platform:   ${ledger.sourcePlatform}`);
      console.log(`   Collection: ${ledger.targetCollection}`);
      console.log(`   Imported:   ${ledger.importedCount}`);
      console.log(`   Timestamp:  ${ledger.timestamp}`);
    } else {
      console.log("⚠️ Transaction not found");
    }
  } catch (err: any) {
    console.error(`❌ Status check failed: ${err.message}`);
  }
}

async function handleValidate(args: CLIArgs) {
  if (!args.file || !args.format) {
    console.error("❌ validate requires --file and --format");
    process.exit(1);
  }

  console.log(`🔍 Validating ${args.file}...`);

  try {
    const { parseFileToSNC } = await import("./index.server");
    const fs = await import("node:fs");
    const text = fs.readFileSync(args.file, "utf-8");
    const envelope = parseFileToSNC(text, args.format as any, "validate");

    if (!envelope) {
      console.log("❌ Could not parse file");
      return;
    }

    console.log(`✅ Valid: ${envelope.entries.length} entries detected`);
    console.log(`   Platform: ${envelope.sourcePlatform}`);

    // Show sample entries
    const samples = envelope.entries.slice(0, 3);
    for (const entry of samples) {
      console.log(`   - "${entry.title}" (${entry.status})`);
    }
    if (envelope.entries.length > 3) {
      console.log(`   ... and ${envelope.entries.length - 3} more`);
    }
  } catch (err: any) {
    console.error(`❌ Validation failed: ${err.message}`);
  }
}

async function handleScaffold(args: CLIArgs) {
  if (!args.file || !args.format) {
    console.error("❌ scaffold requires --file and --format");
    process.exit(1);
  }

  console.log(`🏗 Scaffolding collection from ${args.file}...`);

  try {
    const { parseFileToSNC } = await import("./index.server");
    const { scaffoldCollectionSchema } = await import("./delta-engine");
    const fs = await import("node:fs");
    const text = fs.readFileSync(args.file, "utf-8");
    const envelope = parseFileToSNC(text, args.format as any, "scaffold");

    if (!envelope || envelope.entries.length === 0) {
      console.log("❌ No entries found");
      return;
    }

    // Extract all unique field names from entries
    const allFields = new Set<string>();
    for (const entry of envelope.entries.slice(0, 100)) {
      for (const key of Object.keys(entry.rawCustomFields)) {
        if (!key.startsWith("_")) allFields.add(key);
      }
    }

    const schema = scaffoldCollectionSchema(
      [...allFields],
      envelope.sourcePlatform,
      args.collection || `imported_${args.format}`,
    );

    console.log(`\n📋 Collection: ${schema.collectionName}`);
    console.log("   Fields:");
    for (const field of schema.fields) {
      console.log(
        `   - ${field.name} (${field.type})${field.required ? " *required" : ""} — ${field.label}`,
      );
    }
  } catch (err: any) {
    console.error(`❌ Scaffold failed: ${err.message}`);
  }
}

async function handleDelta(args: CLIArgs) {
  if (!args.file || !args.format || !args.collection) {
    console.error("❌ delta requires --file, --format, and --collection");
    process.exit(1);
  }

  console.log(`🔄 Computing delta for ${args.file}...`);

  try {
    const { parseFileToSNC } = await import("./index.server");
    const { computeDelta } = await import("./delta-engine");
    const fs = await import("node:fs");
    const text = fs.readFileSync(args.file, "utf-8");
    const envelope = parseFileToSNC(text, args.format as any, "delta");

    if (!envelope) {
      console.log("❌ Could not parse file");
      return;
    }

    const result = computeDelta(envelope, null); // First run — all new
    console.log(
      `✅ Delta: ${result.new} new, ${result.changed} changed, ${result.skipped} skipped`,
    );
  } catch (err: any) {
    console.error(`❌ Delta failed: ${err.message}`);
  }
}

async function handlePreset(args: CLIArgs) {
  console.log("📦 Migration Presets:");
  console.log("   (Presets are saved via the visual wizard UI or API)");
  console.log("   Use --save to create, --list to view, --load to apply");
}

function printHelp() {
  console.log(`
🧩 Smart AI-Driven Migration Pro — CLI

Commands:
  import    --file=<path> --format=<platform> --collection=<name> [--overwrite] [--import-media]
  rollback  --token=<txn_token>
  status    --token=<txn_token>
  validate  --file=<path> --format=<platform>
  scaffold  --file=<path> --format=<platform> [--collection=<name>]
  delta     --file=<path> --format=<platform> --collection=<name>
  preset    [--save | --list | --load]

Examples:
  bun run migrate import --file=./export.xml --format=wordpress --collection=posts
  bun run migrate rollback --token=txn_abc123
  bun run migrate scaffold --file=./data.json --format=strapi
  bun run migrate delta --file=./export.xml --format=wordpress --collection=posts
  bun run migrate validate --file=./drupal-export.json --format=drupal

Tiers:
  Free: import, validate, scaffold, delta (5 formats)
  Pro:  rollback, import (36 formats), all AST compilers
`);
}

// Auto-run if called directly
const isDirectCLI = typeof process !== "undefined" && process.argv?.[1]?.includes("cli");
if (isDirectCLI) {
  const args = parseCLIArgs(process.argv.slice(2));
  runMigrationCLI(args).catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
}
