#!/usr/bin/env bun
/**
 * @file scripts/codemods/2026-migrate-schema.ts
 * @description Enhanced Codemod: Migrate collection schemas to 2026 format
 *
 * Features:
 * - Safe file backup before modification
 * - Dry-run support
 * - Detailed reporting
 * - Robust AST transformations using ts-morph
 * - Extensible migration rules
 * - Better error handling and logging
 */

import { Project, SyntaxKind, type ObjectLiteralExpression, type SourceFile } from "ts-morph";
import fs from "node:fs/promises";
import path from "node:path";
import { pc } from "../../src/utils/native-utils";

interface MigrationRule {
  name: string;
  apply: (obj: ObjectLiteralExpression) => boolean; // returns true if modified
}

const MIGRATION_VERSION = 1;

const rules: MigrationRule[] = [
  {
    name: "Add version field",
    apply: (obj) => {
      if (obj.getProperty("version")) return false;

      obj.addPropertyAssignment({
        name: "version",
        initializer: MIGRATION_VERSION.toString(),
      });
      return true;
    },
  },
  {
    name: "Rename old_prop → new_prop",
    apply: (obj) => {
      const oldProp = obj.getProperty("old_prop");
      if (!oldProp || !oldProp.isKind(SyntaxKind.PropertyAssignment)) return false;

      oldProp.getNameNode().replaceWithText("new_prop");
      return true;
    },
  },
  // Add more rules here as needed (e.g. field structure changes, permission updates, etc.)
];

function createProject(): Project {
  return new Project({
    tsConfigFilePath: path.join(process.cwd(), "tsconfig.json"),
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { allowJs: true },
  });
}

async function backupFile(filePath: string): Promise<void> {
  const backupPath = `${filePath}.bak.${Date.now()}`;
  await fs.copyFile(filePath, backupPath);
  console.log(pc.dim(`   Backup created: ${path.basename(backupPath)}`));
}

async function run() {
  const isDryRun = process.argv.includes("--dry-run");
  const project = createProject();
  const collectionsDir = path.join(process.cwd(), "config", "collections");

  console.log(pc.bold(pc.blue("\n🚀 Running 2026 Schema Migration Codemod")));
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

      const defaultExport = sourceFile.getExportAssignment((exp) => !exp.isExportEquals());
      if (!defaultExport) continue;

      const schemaObj = defaultExport.getExpressionIfKind(SyntaxKind.ObjectLiteralExpression);
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

/** Helper to identify collection schema files */
function isCollectionSchema(sourceFile: SourceFile): boolean {
  const text = sourceFile.getFullText().toLowerCase();
  return (
    text.includes("collection") ||
    text.includes("schema") ||
    text.includes("fields") ||
    text.includes("permissions")
  );
}

run().catch((err) => {
  console.error(pc.red("\n💥 Unexpected error in codemod:"), err);
  process.exit(1);
});
