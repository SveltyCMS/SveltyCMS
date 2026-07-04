/**
 * @file scripts/codemods/_utils.ts
 * @description Shared utilities for SveltyCMS codemods using ts-morph.
 */
import { Project, type SourceFile, type ObjectLiteralExpression, SyntaxKind } from "ts-morph";
import path from "node:path";
import fs from "node:fs/promises";

export function createCodemodProject(): Project {
  return new Project({
    tsConfigFilePath: path.join(process.cwd(), "tsconfig.json"),
    skipAddingFilesFromTsConfig: true,
    skipLoadingLibFiles: true,
    compilerOptions: { allowJs: true, strict: false },
    skipFileDependencyResolution: true,
  });
}

export function getDefaultExportedObject(
  sourceFile: SourceFile,
): ObjectLiteralExpression | undefined {
  const exportAssignment = sourceFile.getExportAssignment((exp: any) => !exp.isExportEquals());
  if (!exportAssignment) return undefined;
  return exportAssignment.getExpressionIfKind(SyntaxKind.ObjectLiteralExpression);
}

export function isCollectionSchema(sourceFile: SourceFile): boolean {
  const filePath = sourceFile.getFilePath().toLowerCase();
  const fileName = path.basename(filePath);

  if (fileName.includes("collection") || fileName.includes("schema")) return true;

  const text = sourceFile.getFullText().toLowerCase();
  return (
    text.includes("fields:") ||
    text.includes("permissions:") ||
    text.includes("collectiondef") ||
    (text.includes("name:") && text.includes("widget:"))
  );
}

export async function backupFile(filePath: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${filePath}.bak-${timestamp}`;
  await fs.copyFile(filePath, backupPath);
  console.log(` 📦 Backup created → ${path.basename(backupPath)}`);
  return backupPath;
}

export function upsertProperty(
  obj: ObjectLiteralExpression,
  propertyName: string,
  initializer: string,
): boolean {
  const existing = obj.getProperty(propertyName);
  if (existing?.isKind(SyntaxKind.PropertyAssignment)) {
    existing.setInitializer(initializer);
    return true;
  }
  if (!existing) {
    obj.addPropertyAssignment({ name: propertyName, initializer });
    return true;
  }
  return false;
}

export function renameProperty(
  obj: ObjectLiteralExpression,
  oldName: string,
  newName: string,
): boolean {
  const prop = obj.getProperty(oldName);
  if (!prop || !prop.isKind(SyntaxKind.PropertyAssignment)) return false;
  prop.getNameNode().replaceWithText(newName);
  return true;
}

export function deepUpsertProperty(
  obj: ObjectLiteralExpression,
  path: string,
  initializer: string,
): boolean {
  const parts = path.split(".");
  let current = obj;
  let modified = false;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const isLast = i === parts.length - 1;
    const existing = current.getProperty(part);

    if (isLast) {
      return upsertProperty(current, part, initializer) || modified;
    }

    if (!existing || !existing.isKind(SyntaxKind.ObjectLiteralExpression)) {
      if (existing) existing.remove();
      current.addPropertyAssignment({ name: part, initializer: "{}" });
      modified = true;
    }

    const next = current.getProperty(part);
    if (next?.isKind(SyntaxKind.ObjectLiteralExpression)) {
      current = next;
    } else {
      return false;
    }
  }
  return modified;
}

export function validateSchema(obj: ObjectLiteralExpression): boolean {
  const required = ["name", "fields"];
  let valid = true;
  for (const field of required) {
    if (!obj.getProperty(field)) {
      console.warn(` ⚠️ Validation Warning: Missing required field "${field}"`);
      valid = false;
    }
  }
  return valid;
}

export interface MigrationRule {
  name: string;
  apply: (obj: ObjectLiteralExpression) => boolean;
}

export class MigrationManager {
  private rules: MigrationRule[] = [];
  private changes: string[] = [];

  addRule(rule: MigrationRule) {
    this.rules.push(rule);
    return this;
  }

  applyAll(obj: ObjectLiteralExpression): boolean {
    this.changes = [];
    let modified = false;
    for (const rule of this.rules) {
      if (rule.apply(obj)) {
        modified = true;
        this.changes.push(rule.name);
      }
    }
    return modified;
  }

  getChanges() {
    return this.changes;
  }
}

export function sanitizeHeadlessCollectionName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}
