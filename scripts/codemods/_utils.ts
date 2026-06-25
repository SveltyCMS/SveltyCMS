/**
 * @file scripts/codemods/utils.ts
 * @description Shared utilities for SveltyCMS codemods using ts-morph.
 */

import {
  Project,
  type SourceFile,
  type ObjectLiteralExpression,
  SyntaxKind,
} from "ts-morph";
import path from "node:path";
import fs from "node:fs/promises";

/**
 * Creates a properly configured ts-morph Project for codemods.
 */
export function createCodemodProject(): Project {
  return new Project({
    tsConfigFilePath: path.join(process.cwd(), "tsconfig.json"),
    skipAddingFilesFromTsConfig: true,
    skipLoadingLibFiles: true,
    compilerOptions: {
      allowJs: true,
      strict: false, // Be lenient with legacy code during migrations
    },
    // Skip type checking for speed during codemods
    skipFileDependencyResolution: true,
  });
}

/**
 * Safely finds the default exported object literal in a file.
 * This is the most common pattern for collection schemas.
 */
export function getDefaultExportedObject(
  sourceFile: SourceFile,
): ObjectLiteralExpression | undefined {
  const exportAssignment = sourceFile.getExportAssignment(
    (exp: any) => !exp.isExportEquals(),
  );

  if (!exportAssignment) return undefined;

  return exportAssignment.getExpressionIfKind(
    SyntaxKind.ObjectLiteralExpression,
  );
}

/**
 * Determines if a source file likely contains a SveltyCMS Collection Schema.
 * More robust than simple string matching.
 */
export function isCollectionSchema(sourceFile: SourceFile): boolean {
  const filePath = sourceFile.getFilePath().toLowerCase();
  const fileName = path.basename(filePath);

  // Quick path-based filter
  if (fileName.includes("collection") || fileName.includes("schema")) {
    return true;
  }

  const text = sourceFile.getFullText().toLowerCase();

  // Stronger heuristic: look for typical collection schema markers
  const hasSchemaMarkers =
    text.includes("fields:") ||
    text.includes("permissions:") ||
    text.includes("collectiondef") ||
    (text.includes("name:") && text.includes("widget:"));

  return hasSchemaMarkers;
}

/**
 * Creates a backup of a file before modification (recommended for all codemods).
 */
export async function backupFile(filePath: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${filePath}.bak-${timestamp}`;

  await fs.copyFile(filePath, backupPath);
  console.log(`   📦 Backup created → ${path.basename(backupPath)}`);

  return backupPath;
}

/**
 * Safely adds or updates a property in an object literal.
 */
export function upsertProperty(
  obj: ObjectLiteralExpression,
  propertyName: string,
  initializer: string,
): boolean {
  const existing = obj.getProperty(propertyName);

  if (existing) {
    // Update existing property
    if (existing.isKind(SyntaxKind.PropertyAssignment)) {
      existing.setInitializer(initializer);
      return true;
    }
    return false; // Don't touch spread or other property types
  }

  // Add new property
  obj.addPropertyAssignment({
    name: propertyName,
    initializer,
  });
  return true;
}

/**
 * Renames a property safely.
 */
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

/**
 * Sanitizes a collection name for headless API compatibility.
 * - Replaces spaces and special chars with hyphens
 * - Lowercases the result
 * - Removes leading/trailing hyphens and underscores
 * - Collapses consecutive hyphens
 *
 * Example: "Blog Posts 2024!" → "blog-posts-2024"
 */
export function sanitizeHeadlessCollectionName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}
