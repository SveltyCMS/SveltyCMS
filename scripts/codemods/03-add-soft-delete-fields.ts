#!/usr/bin/env bun
/**
 * @file scripts/codemods/03-add-soft-delete-fields.ts
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
  sanitizeHeadlessCollectionName,
  validateSchema,
} from "./_utils";

const SOFT_DELETE_FIELD = {
  name: "isDeleted",
  type: "boolean",
  defaultValue: false,
  label: "Soft Deleted",
  description:
    "Soft-delete flag — entries with isDeleted=true are hidden from public APIs",
};

async function run(): Promise<void> {
  const isDryRun = process.argv.includes("--dry-run");
  console.log(pc.bold(pc.blue("\n🚀 Running Add Soft-Delete Fields Codemod")));
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

  let injectedCount = 0;
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

    const fieldsProp = obj.getProperty("fields");
    if (!fieldsProp?.isKind(SyntaxKind.PropertyAssignment)) {
      skippedCount++;
      continue;
    }

    const fieldsArray = fieldsProp.getInitializerIfKind(
      SyntaxKind.ArrayLiteralExpression,
    );
    if (!fieldsArray) {
      skippedCount++;
      continue;
    }

    const hasIsDeleted = fieldsArray.getElements().some((el) => {
      if (el.isKind(SyntaxKind.ObjectLiteralExpression)) {
        const nameProp = el.getProperty("name");
        return nameProp?.getText().includes("isDeleted");
      }
      return false;
    });

    if (hasIsDeleted) {
      skippedCount++;
      continue;
    }

    // Properly add object literal (not stringified)
    const fieldLiteral = `{
      name: "${SOFT_DELETE_FIELD.name}",
      type: "${SOFT_DELETE_FIELD.type}",
      defaultValue: ${SOFT_DELETE_FIELD.defaultValue},
      label: "${SOFT_DELETE_FIELD.label}",
      description: "${SOFT_DELETE_FIELD.description}"
    }`;

    fieldsArray.addElement(fieldLiteral);

    // Optional: sanitize collection name
    const nameProp = obj.getProperty("name");
    if (nameProp?.isKind(SyntaxKind.PropertyAssignment)) {
      const currentName =
        nameProp.getInitializer()?.getText().replace(/"/g, "") || "";
      const sanitized = sanitizeHeadlessCollectionName(currentName);
      if (sanitized !== currentName) {
        nameProp.setInitializer(`"${sanitized}"`);
        console.log(
          pc.cyan(` 🔧 Sanitized name: ${currentName} → ${sanitized}`),
        );
      }
    }

    validateSchema(obj);

    if (isDryRun) {
      console.log(
        pc.yellow(` [DRY] Would inject isDeleted: ${path.basename(filePath)}`),
      );
    } else {
      await backupFile(filePath);
      await sourceFile.save();
      console.log(
        pc.green(` ✅ Injected isDeleted: ${path.basename(filePath)}`),
      );
    }
    injectedCount++;
  }

  console.log(
    pc.bold(
      `\n📊 Summary: ${pc.green(String(injectedCount))} injected, ${pc.dim(String(skippedCount))} skipped`,
    ),
  );
}

run().catch((err) => {
  console.error(pc.red("\n💥 Unexpected error:"), err);
  process.exit(1);
});
