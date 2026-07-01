#!/usr/bin/env bun
/**
 * @file scripts/codemods/02-update-permissions-structure.ts
 */
import path from "node:path";
import fs from "node:fs/promises";
import { SyntaxKind } from "ts-morph";
import { pc } from "../../src/utils/native-utils";
import {
  createCodemodProject,
  getDefaultExportedObject,
  isCollectionSchema,
  backupFile,
  deepUpsertProperty,
  validateSchema,
} from "./_utils";

interface StructuredPermissions {
  public?: string[];
  authenticated?: string[];
  apiKey?: string[];
}

async function run(): Promise<void> {
  const isDryRun = process.argv.includes("--dry-run");
  console.log(
    pc.bold(pc.blue("\n🚀 Running Update Permissions Structure Codemod")),
  );
  if (isDryRun)
    console.log(pc.yellow(" DRY-RUN MODE — No files will be modified\n"));

  const project = createCodemodProject();
  const collectionsDir = path.join(process.cwd(), "config/collections");

  let files: string[] = [];
  try {
    const entries = await fs.readdir(collectionsDir, { withFileTypes: true });
    files = entries
      .filter(
        (e) => e.isFile() && (e.name.endsWith(".ts") || e.name.endsWith(".js")),
      )
      .map((e) => path.join(collectionsDir, e.name));
  } catch {
    console.log(
      pc.yellow(" ⚠️ No config/collections directory found. Skipping."),
    );
    return;
  }

  let migratedCount = 0;
  let skippedCount = 0;

  for (const filePath of files) {
    const sourceFile = project.addSourceFileAtPath(filePath);
    if (!isCollectionSchema(sourceFile)) {
      skippedCount++;
      continue;
    }
    const obj = getDefaultExportedObject(sourceFile);
    if (!obj) {
      skippedCount++;
      continue;
    }

    const existingPerms = obj.getProperty("permissions");
    if (existingPerms?.isKind(SyntaxKind.ObjectLiteralExpression)) {
      console.log(
        pc.dim(
          ` ⏭️ Permissions already structured: ${path.basename(filePath)}`,
        ),
      );
      skippedCount++;
      continue;
    }

    const publicAccessProp = obj.getProperty("publicAccess");
    let newPermissions: StructuredPermissions;

    if (publicAccessProp?.isKind(SyntaxKind.PropertyAssignment)) {
      const initText = publicAccessProp.getInitializer()?.getText() || "false";
      const isPublic = initText === "true";
      newPermissions = {
        public: isPublic ? ["read"] : [],
        authenticated: ["read", "write"],
        apiKey: [],
      };
      publicAccessProp.remove();
    } else {
      newPermissions = {
        public: [],
        authenticated: ["read", "write"],
        apiKey: [],
      };
    }

    // Merge if permissions object exists but is not properly structured
    if (existingPerms?.isKind(SyntaxKind.ObjectLiteralExpression)) {
      for (const [key, values] of Object.entries(newPermissions)) {
        const existingKey = existingPerms.getProperty(key);
        if (existingKey) {
          existingKey.setInitializer(JSON.stringify(values));
        } else {
          existingPerms.addPropertyAssignment({
            name: key,
            initializer: JSON.stringify(values),
          });
        }
      }
    } else {
      deepUpsertProperty(obj, "permissions", JSON.stringify(newPermissions));
    }

    validateSchema(obj);

    if (isDryRun) {
      console.log(
        pc.yellow(
          ` [DRY] Would migrate permissions: ${path.basename(filePath)}`,
        ),
      );
    } else {
      await backupFile(filePath);
      await sourceFile.save();
      console.log(
        pc.green(` ✅ Migrated permissions: ${path.basename(filePath)}`),
      );
    }
    migratedCount++;
  }

  console.log(
    pc.bold(
      `\n📊 Summary: ${pc.green(String(migratedCount))} migrated, ${pc.dim(String(skippedCount))} skipped`,
    ),
  );
}

run().catch((err) => {
  console.error(pc.red("\n💥 Unexpected error:"), err);
  process.exit(1);
});
