#!/usr/bin/env bun
/**
 * @file scripts/codemods/03-add-soft-delete-fields.ts
 * @description Soft-delete injection: adds `isDeleted` field to all collection schemas.
 *
 * Scans all collection schema files and adds:
 *   isDeleted: { type: "boolean", defaultValue: false, label: "Soft Deleted" }
 *
 * Preserves existing isDeleted fields if already present.
 */

import { pc } from "../../src/utils/native-utils";
import {
  createCodemodProject,
  getDefaultExportedObject,
  isCollectionSchema,
  backupFile,
  sanitizeHeadlessCollectionName,
} from "./_utils";
import { SyntaxKind } from "ts-morph";
import path from "node:path";
import fs from "node:fs/promises";

const SOFT_DELETE_FIELD = {
  name: "isDeleted",
  type: "boolean",
  defaultValue: false,
  label: "Soft Deleted",
  description:
    "Soft-delete flag — entries with isDeleted=true are hidden from public APIs",
};

async function run(): Promise<void> {
  console.log(pc.bold(pc.blue("\n🚀 Running Add Soft-Delete Fields Codemod")));

  const project = createCodemodProject();
  const collectionsDir = path.join(process.cwd(), "config", "collections");

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
      pc.yellow("   ⚠️  No config/collections directory found. Skipping."),
    );
    return;
  }

  let injectedCount = 0;
  let skippedCount = 0;

  for (const filePath of files) {
    const sourceFile = project.addSourceFileAtPath(filePath);

    if (!isCollectionSchema(sourceFile)) {
      console.log(
        pc.dim(`   ⏭️  Skipping non-schema file: ${path.basename(filePath)}`),
      );
      skippedCount++;
      continue;
    }

    const obj = getDefaultExportedObject(sourceFile);
    if (!obj) {
      console.log(
        pc.dim(`   ⏭️  No default export found: ${path.basename(filePath)}`),
      );
      skippedCount++;
      continue;
    }

    // Find the fields array
    const fieldsProp = obj.getProperty("fields");
    if (!fieldsProp || !fieldsProp.isKind(SyntaxKind.PropertyAssignment)) {
      console.log(pc.dim(`   ⏭️  No fields array: ${path.basename(filePath)}`));
      skippedCount++;
      continue;
    }

    const fieldsArray = fieldsProp.getInitializerIfKind(
      SyntaxKind.ArrayLiteralExpression,
    );
    if (!fieldsArray) {
      console.log(
        pc.dim(`   ⏭️  Fields is not an array: ${path.basename(filePath)}`),
      );
      skippedCount++;
      continue;
    }

    // Check if isDeleted already exists
    const hasIsDeleted = fieldsArray.getElements().some((el) => {
      if (el.isKind(SyntaxKind.ObjectLiteralExpression)) {
        const nameProp = el.getProperty("name");
        return nameProp && nameProp.getText().includes("isDeleted");
      }
      return false;
    });

    if (hasIsDeleted) {
      console.log(
        pc.dim(`   ⏭️  isDeleted already present: ${path.basename(filePath)}`),
      );
      skippedCount++;
      continue;
    }

    // Add isDeleted field
    fieldsArray.addElement(JSON.stringify(SOFT_DELETE_FIELD));

    // Sanitize collection name for headless compatibility
    const nameProp = obj.getProperty("name");
    if (nameProp && nameProp.isKind(SyntaxKind.PropertyAssignment)) {
      const currentName =
        nameProp.getInitializer()?.getText().replace(/"/g, "") || "";
      const sanitized = sanitizeHeadlessCollectionName(currentName);
      if (sanitized !== currentName) {
        nameProp.setInitializer(`"${sanitized}"`);
        console.log(
          pc.cyan(`   🔧 Sanitized name: ${currentName} → ${sanitized}`),
        );
      }
    }

    await backupFile(filePath);
    await sourceFile.save();
    console.log(
      pc.green(`   ✅ Injected isDeleted: ${path.basename(filePath)}`),
    );
    injectedCount++;
  }

  console.log(
    pc.bold(
      `\n📊 Summary: ${pc.green(String(injectedCount))} injected, ${pc.dim(String(skippedCount))} skipped`,
    ),
  );
}

run().catch((err) => {
  console.error(pc.red("\n💥 Unexpected error in codemod:"), err);
  process.exit(1);
});
