#!/usr/bin/env bun
/**
 * @file scripts/codemods/01-migrate-collection-schema-v2.ts
 */
import path from "node:path";
import { pc } from "../../src/utils/native-utils";
import {
  createCodemodProject,
  isCollectionSchema,
  getDefaultExportedObject,
  backupFile,
  deepUpsertProperty,
  renameProperty,
  MigrationManager,
  validateSchema,
} from "./_utils";

const MIGRATION_VERSION = 2;

const manager = new MigrationManager()
  .addRule({
    name: "Add version field",
    apply: (obj) =>
      deepUpsertProperty(obj, "version", MIGRATION_VERSION.toString()),
  })
  .addRule({
    name: "Rename old_prop → new_prop",
    apply: (obj) => renameProperty(obj, "old_prop", "new_prop"),
  });

async function run() {
  const isDryRun = process.argv.includes("--dry-run");
  const project = createCodemodProject();
  const collectionsDir = path.join(process.cwd(), "config/collections");

  console.log(
    pc.bold(pc.blue("\n🚀 Running 2026 Schema Migration Codemod (v2)")),
  );
  if (isDryRun)
    console.log(pc.yellow(" DRY-RUN MODE — No files will be modified\n"));

  try {
    project.addSourceFilesAtPaths(path.join(collectionsDir, "**/*.ts"));
    const sourceFiles = project.getSourceFiles();
    let modifiedCount = 0;
    let totalProcessed = 0;

    for (const sourceFile of sourceFiles) {
      totalProcessed++;
      if (!isCollectionSchema(sourceFile)) continue;
      const schemaObj = getDefaultExportedObject(sourceFile);
      if (!schemaObj) continue;

      console.log(pc.cyan(`\nProcessing: ${sourceFile.getBaseName()}`));
      const wasModified = manager.applyAll(schemaObj);

      if (wasModified) {
        modifiedCount++;
        validateSchema(schemaObj);

        if (isDryRun) {
          console.log(
            pc.yellow(` [DRY] Would apply: ${manager.getChanges().join(", ")}`),
          );
        } else {
          await backupFile(sourceFile.getFilePath());
          await sourceFile.save();
          console.log(
            pc.green(` ✅ Migrated: ${manager.getChanges().join(", ")}`),
          );
        }
      } else {
        console.log(pc.dim(` No changes needed`));
      }
    }

    console.log(pc.bold("\n" + "=".repeat(60)));
    console.log(`Total files processed : ${totalProcessed}`);
    console.log(`Schemas modified      : ${modifiedCount}`);

    if (isDryRun) {
      console.log(pc.yellow("\nDry run completed — no files were changed."));
    } else if (modifiedCount > 0) {
      console.log(
        pc.green(`\n🎉 Successfully migrated ${modifiedCount} schema(s).`),
      );
    } else {
      console.log(pc.green("\n✨ All schemas are already up to date!"));
    }
  } catch (err: any) {
    console.error(pc.red("\n❌ Migration failed:"), err.message);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(pc.red("\n💥 Unexpected error:"), err);
  process.exit(1);
});
