#!/usr/bin/env bun
/**
 * @file scripts/codemods/01-migrate-collection-schema-v2.ts
 * @description Migrate collection schemas to v2 (2026 format)
 */

import { type ObjectLiteralExpression } from "ts-morph";
import path from "node:path";
import { pc } from "../../src/utils/native-utils";
import {
  createCodemodProject,
  isCollectionSchema,
  getDefaultExportedObject,
  backupFile,
  upsertProperty,
  renameProperty,
} from "./_utils";

interface MigrationRule {
  name: string;
  apply: (obj: ObjectLiteralExpression) => boolean; // returns true if modified
}

const MIGRATION_VERSION = 2;

const rules: MigrationRule[] = [
  {
    name: "Add version field",
    apply: (obj) => upsertProperty(obj, "version", MIGRATION_VERSION.toString()),
  },
  {
    name: "Rename old_prop → new_prop",
    apply: (obj) => renameProperty(obj, "old_prop", "new_prop"),
  },
];

async function run() {
  const isDryRun = process.argv.includes("--dry-run");
  const project = createCodemodProject();
  const collectionsDir = path.join(process.cwd(), "config", "collections");

  console.log(pc.bold(pc.blue("\n🚀 Running 2026 Schema Migration Codemod (v2)")));
  if (isDryRun) {
    console.log(pc.yellow("   DRY-RUN MODE — No files will be modified\n"));
  }

  try {
    // Add all collection schema files
    project.addSourceFilesAtPaths(path.join(collectionsDir, "**/*.ts"));

    const sourceFiles = project.getSourceFiles();
    let modifiedCount = 0;
    let totalProcessed = 0;

    for (const sourceFile of sourceFiles) {
      totalProcessed++;

      if (!isCollectionSchema(sourceFile)) continue;

      const schemaObj = getDefaultExportedObject(sourceFile);
      if (!schemaObj) continue;

      let fileModified = false;
      const changes: string[] = [];

      console.log(pc.cyan(`\nProcessing: ${sourceFile.getBaseName()}`));

      // Apply all migration rules
      for (const rule of rules) {
        const wasModified = rule.apply(schemaObj);
        if (wasModified) {
          fileModified = true;
          changes.push(rule.name);
        }
      }

      if (fileModified) {
        modifiedCount++;

        if (isDryRun) {
          console.log(pc.yellow(`   [DRY] Would apply: ${changes.join(", ")}`));
        } else {
          await backupFile(sourceFile.getFilePath());
          await sourceFile.save();
          console.log(pc.green(`   ✅ Migrated: ${changes.join(", ")}`));
        }
      } else {
        console.log(pc.dim(`   No changes needed`));
      }
    }

    // Final summary
    console.log(pc.bold("\n" + "=".repeat(60)));
    console.log(pc.bold(pc.blue("Migration Summary")));
    console.log(pc.bold("=".repeat(60)));

    console.log(`Total files processed : ${totalProcessed}`);
    console.log(`Schemas modified      : ${modifiedCount}`);

    if (isDryRun) {
      console.log(pc.yellow("\nDry run completed — no files were changed."));
      console.log(pc.dim("Run without --dry-run to apply changes."));
    } else if (modifiedCount > 0) {
      console.log(pc.green(`\n🎉 Successfully migrated ${modifiedCount} schema(s).`));
      console.log(pc.dim("Don't forget to review changes and commit them."));
    } else {
      console.log(pc.green("\n✨ All schemas are already up to date!"));
    }
  } catch (err: any) {
    console.error(pc.red("\n❌ Migration failed:"), err.message);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(pc.red("\n💥 Unexpected error in codemod:"), err);
  process.exit(1);
});
