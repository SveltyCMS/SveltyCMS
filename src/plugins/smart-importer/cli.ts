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
export async function runMigrationCLI(args: CLIArgs, dbAdapter?: any): Promise<void> {
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
      await handleScaffold(args, dbAdapter);
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
    const { runMigrationImport } = await import("./import-runner");
    const { getKnownMappingsForFormat } = await import("./known-mappings");
    const { inferTargetCollectionFromMigration } = await import("./infer-collection");
    const { parseFileToSNC } = await import("./index.server");
    const fs = await import("node:fs");
    const text = fs.readFileSync(args.file, "utf-8");
    const mappings = getKnownMappingsForFormat(args.format);
    const envelope = await parseFileToSNC(text, args.format as never, "cli_import");
    const targetCollection =
      args.collection ||
      inferTargetCollectionFromMigration({
        format: args.format,
        entries: envelope?.entries,
      });

    const result = await runMigrationImport({
      dbAdapter,
      fileText: text,
      format: args.format,
      targetCollection,
      licenseTier: "free",
      mappingsRaw: mappings.length ? JSON.stringify(mappings) : null,
      importMedia: args.importMedia ?? false,
      onProgress: (progress) => {
        process.stdout.write(
          `\r   Progress: ${progress.current}/${progress.total} - ${progress.currentItem}`,
        );
      },
    });

    if (result.scaffold?.created) {
      console.log(
        `\n🏗 Created collection "${result.scaffold.collectionId}" (${result.scaffold.fieldCount} fields)`,
      );
    }
    console.log(`\n✅ Import complete: ${result.imported} imported, ${result.failed} failed`);
    if (result.transactionToken) {
      console.log(`   Transaction: ${result.transactionToken}`);
    }
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
    const envelope = await parseFileToSNC(text, args.format as any, "validate");

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

async function handleScaffold(args: CLIArgs, dbAdapter?: any) {
  if (!args.file || !args.format) {
    console.error("❌ scaffold requires --file and --format");
    process.exit(1);
  }

  const { parseFileToSNC } = await import("./index.server");
  const { inferTargetCollectionFromMigration } = await import("./infer-collection");
  const fs = await import("node:fs");
  const text = fs.readFileSync(args.file!, "utf-8");
  const envelope = await parseFileToSNC(text, args.format as never, "cli_scaffold");
  const collectionName =
    args.collection ||
    inferTargetCollectionFromMigration({
      format: args.format!,
      entries: envelope?.entries,
    });
  console.log(`🏗 Scaffolding collection "${collectionName}" from ${args.file}...`);

  try {
    const { getKnownMappingsForFormat } = await import("./known-mappings");
    const {
      buildCollectionSchemaFromMappings,
      normalizeCollectionId,
      provisionCollectionFromMappings,
    } = await import("./collection-scaffold");

    const mappings = getKnownMappingsForFormat(args.format);
    if (!mappings.length) {
      console.error(`❌ No default mappings for format "${args.format}"`);
      process.exit(1);
    }

    if (dbAdapter) {
      const result = await provisionCollectionFromMappings(
        dbAdapter,
        null,
        collectionName,
        mappings,
        args.format,
      );
      console.log(
        result.created
          ? `✅ Created collection "${result.collectionId}" with ${result.fieldCount} fields`
          : `ℹ️ Collection "${result.collectionId}" already exists (${result.fieldCount} fields)`,
      );
      if (result.filePath) console.log(`   File: ${result.filePath}`);
      return;
    }

    const collectionId = normalizeCollectionId(collectionName);
    const schema = buildCollectionSchemaFromMappings(collectionId, mappings, args.format);
    console.log(`\n📋 Collection: ${schema._id} (preview — pass dbAdapter to write)`);
    console.log("   Fields:");
    for (const field of schema.fields) {
      if (!("db_fieldName" in field)) continue;
      const widget = field.widget as { Name: string };
      console.log(
        `   - ${field.db_fieldName} (${widget.Name})${field.required ? " *required" : ""} — ${field.label}`,
      );
    }
  } catch (err: any) {
    console.error(`❌ Scaffold failed: ${err.message}`);
    process.exit(1);
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
    const envelope = await parseFileToSNC(text, args.format as any, "delta");

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

async function handlePreset(_args: CLIArgs) {
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
