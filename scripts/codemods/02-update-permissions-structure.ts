#!/usr/bin/env bun
/**
 * @file scripts/codemods/02-update-permissions-structure.ts
 * @description RBAC migration: converts legacy `publicAccess` fields to structured
 *              `permissions` objects with authenticated/public/apiKey scopes.
 *
 * Scans all collection schema files and transforms:
 *   publicAccess: true  →  permissions: { public: ["read"], authenticated: ["read","write"] }
 *   publicAccess: false →  permissions: { public: [], authenticated: ["read","write"] }
 *
 * Preserves existing permissions if already present.
 */

import { pc } from "../../src/utils/native-utils";
import {
  createCodemodProject,
  getDefaultExportedObject,
  isCollectionSchema,
  backupFile,
} from "./_utils";
import { SyntaxKind } from "ts-morph";
import path from "node:path";
import fs from "node:fs/promises";

interface StructuredPermissions {
  public?: string[];
  authenticated?: string[];
  apiKey?: string[];
}

async function run(): Promise<void> {
  console.log(pc.bold(pc.blue("\n🚀 Running Update Permissions Structure Codemod")));

  const project = createCodemodProject();
  const collectionsDir = path.join(process.cwd(), "config", "collections");

  let files: string[] = [];
  try {
    const entries = await fs.readdir(collectionsDir, { withFileTypes: true });
    files = entries
      .filter((e) => e.isFile() && (e.name.endsWith(".ts") || e.name.endsWith(".js")))
      .map((e) => path.join(collectionsDir, e.name));
  } catch {
    console.log(pc.yellow("   ⚠️  No config/collections directory found. Skipping."));
    return;
  }

  let migratedCount = 0;
  let skippedCount = 0;

  for (const filePath of files) {
    const sourceFile = project.addSourceFileAtPath(filePath);

    if (!isCollectionSchema(sourceFile)) {
      console.log(pc.dim(`   ⏭️  Skipping non-schema file: ${path.basename(filePath)}`));
      skippedCount++;
      continue;
    }

    const obj = getDefaultExportedObject(sourceFile);
    if (!obj) {
      console.log(pc.dim(`   ⏭️  No default export found: ${path.basename(filePath)}`));
      skippedCount++;
      continue;
    }

    // Check if permissions already exist
    const existingPerms = obj.getProperty("permissions");
    if (existingPerms && !existingPerms.isKind(SyntaxKind.ShorthandPropertyAssignment)) {
      console.log(pc.dim(`   ⏭️  Permissions already structured: ${path.basename(filePath)}`));
      skippedCount++;
      continue;
    }

    // Determine the new permissions structure
    const publicAccessProp = obj.getProperty("publicAccess");
    let newPermissions: StructuredPermissions;

    if (publicAccessProp && publicAccessProp.isKind(SyntaxKind.PropertyAssignment)) {
      const initText = publicAccessProp.getInitializer()?.getText() || "false";
      const isPublic = initText === "true";

      newPermissions = {
        public: isPublic ? ["read"] : [],
        authenticated: ["read", "write"],
        apiKey: [],
      };

      // Remove the legacy publicAccess field
      obj.removeProperty("publicAccess");
    } else {
      // No publicAccess — default to authenticated-only
      newPermissions = {
        public: [],
        authenticated: ["read", "write"],
        apiKey: [],
      };
    }

    // Add structured permissions
    obj.addPropertyAssignment({
      name: "permissions",
      initializer: JSON.stringify(newPermissions),
    });

    // Backup before saving
    await backupFile(filePath);
    await sourceFile.save();
    console.log(pc.green(`   ✅ Migrated permissions: ${path.basename(filePath)}`));
    migratedCount++;
  }

  console.log(
    pc.bold(
      `\n📊 Summary: ${pc.green(String(migratedCount))} migrated, ${pc.dim(String(skippedCount))} skipped`,
    ),
  );
}

run().catch((err) => {
  console.error(pc.red("\n💥 Unexpected error in codemod:"), err);
  process.exit(1);
});
