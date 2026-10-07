/**
 * @file src/utils/compilation/category-directories.ts
 * @description Turn a Collection Builder category path into a real directory.
 *
 * Features:
 * - Maps `/blog` and nested `/blog/news` onto a safe relative directory
 * - Places a category under its parent when the builder moves it
 * - Creates that directory under the source and compiled collection roots
 * - Records a folder a person created on disk as a category
 * - Removes it on delete only when it is empty
 * - Rejects traversal, absolute paths, and segments that are not URL slugs
 */

import fs from "node:fs/promises";
import path from "node:path";
import { assertLiveDataWriteAllowed } from "../benchmark-sandbox.ts";

/** One path segment from `uniquePathForCategory` (`blog`, `blog-posts`, `2024`). */
const SEGMENT = /^[a-z0-9][a-z0-9_-]*$/i;

export interface CategoryDirNode {
  _id?: unknown;
  parentId?: unknown;
  nodeType?: string;
  path?: string | null;
}

export interface CategoryDirMove {
  id: string;
  from: string;
  to: string;
  /** Node path after the folder moves (`/news/blog`). */
  path: string;
}

/**
 * Relative directory for a category path, using forward slashes.
 * Returns null when the path is empty or could leave the collection root.
 */
export function categoryRelativeDir(nodePath: string | null | undefined): string | null {
  if (!nodePath || typeof nodePath !== "string") return null;
  const segments = nodePath
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length === 0 || segments.length > 8) return null;
  if (segments.some((segment) => !SEGMENT.test(segment))) return null;
  return segments.join("/");
}

function isCategoryNode(node: CategoryDirNode): boolean {
  return node.nodeType === "category" || node.nodeType === "folder";
}

function indexCategoryNodes(nodes: readonly CategoryDirNode[]): Map<string, CategoryDirNode> {
  const byId = new Map<string, CategoryDirNode>();
  for (const node of nodes) {
    const id = node._id?.toString();
    if (id) byId.set(id, node);
  }
  return byId;
}

/**
 * Directory for a category. A root category keeps its stored path.
 * A category inside another category uses the parent's directory plus its own slug,
 * so dragging Blog under News moves `blog/` to `news/blog/`.
 */
export function desiredCategoryRelative(
  node: CategoryDirNode,
  byId: ReadonlyMap<string, CategoryDirNode>,
  seen: Set<string> = new Set(),
): string | null {
  const full = categoryRelativeDir(node.path);
  if (!full) return null;
  const id = node._id?.toString() ?? "";
  if (id) {
    if (seen.has(id)) return full;
    seen.add(id);
  }
  const parentId = node.parentId == null || node.parentId === "" ? "" : String(node.parentId);
  const parent = parentId ? byId.get(parentId) : undefined;
  if (!parent || !isCategoryNode(parent)) return full;
  const parentRelative = desiredCategoryRelative(parent, byId, seen);
  const slug = full.split("/").pop() ?? full;
  if (!parentRelative) return slug;
  return `${parentRelative}/${slug}`;
}

/** Relative directories the categories occupy, including a move under a new parent. */
export function placedCategoryDirs(nodes: readonly CategoryDirNode[]): string[] {
  const byId = indexCategoryNodes(nodes);
  const dirs: string[] = [];
  for (const node of nodes) {
    if (!isCategoryNode(node)) continue;
    const relative = desiredCategoryRelative(node, byId);
    if (relative) dirs.push(relative);
  }
  return dirs;
}

/**
 * Folders that must be renamed because their parent changed.
 * Sibling reorder keeps the same directory.
 */
export function planCategoryDirectoryMoves(nodes: readonly CategoryDirNode[]): CategoryDirMove[] {
  const byId = indexCategoryNodes(nodes);
  const moves: CategoryDirMove[] = [];
  for (const node of nodes) {
    if (!isCategoryNode(node)) continue;
    const id = node._id?.toString() ?? "";
    const from = categoryRelativeDir(node.path);
    const to = desiredCategoryRelative(node, byId);
    if (!id || !from || !to || from === to) continue;
    moves.push({ id, from, to, path: `/${to}` });
  }
  return moves;
}

/** Category directories that an empty-dir sweep must leave in place, including parents. */
export function categoryKeepDirs(nodes: readonly CategoryDirNode[]): Set<string> {
  const keep = new Set<string>();
  for (const relative of placedCategoryDirs(nodes)) {
    const parts = relative.split("/");
    let accumulated = "";
    for (const part of parts) {
      accumulated = accumulated ? `${accumulated}/${part}` : part;
      keep.add(accumulated);
    }
  }
  return keep;
}

/** Read `structureNodes` from a manifest without trusting the JSON shape. */
export function categoryNodesFromUnknown(nodes: unknown[] | undefined): CategoryDirNode[] {
  if (!nodes) return [];
  const parsed: CategoryDirNode[] = [];
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const record = node as {
      _id?: unknown;
      parentId?: unknown;
      nodeType?: unknown;
      path?: unknown;
    };
    parsed.push({
      _id: record._id,
      parentId: record.parentId,
      nodeType: typeof record.nodeType === "string" ? record.nodeType : undefined,
      path: typeof record.path === "string" ? record.path : null,
    });
  }
  return parsed;
}

function isInsideRoot(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function resolvedCategoryDir(root: string, relative: string): string | null {
  const base = path.resolve(root);
  const dir = path.resolve(base, ...relative.split("/"));
  return isInsideRoot(base, dir) ? dir : null;
}

/**
 * Create one directory per category under each root.
 * `mkdir` is recursive, so nested categories create their parents too.
 */
export async function ensureCategoryDirectories(
  nodes: readonly CategoryDirNode[],
  roots: readonly string[],
): Promise<void> {
  const relativeDirs = new Set(placedCategoryDirs(nodes));
  if (relativeDirs.size === 0) return;

  for (const root of roots) {
    for (const relative of relativeDirs) {
      const dir = resolvedCategoryDir(root, relative);
      if (!dir) continue;
      assertLiveDataWriteAllowed(dir);
      await fs.mkdir(dir, { recursive: true });
    }
  }
}

/**
 * Remove category directories that a delete left empty.
 * A directory that still holds a collection file is left untouched.
 */
export async function removeEmptyCategoryDirectories(
  nodes: readonly CategoryDirNode[],
  roots: readonly string[],
): Promise<void> {
  const relativeDirs = nodes
    .map((node) => categoryRelativeDir(node.path))
    .filter((relative): relative is string => !!relative)
    .sort((left, right) => right.length - left.length);
  if (relativeDirs.length === 0) return;

  for (const root of roots) {
    for (const relative of relativeDirs) {
      const dir = resolvedCategoryDir(root, relative);
      if (!dir) continue;
      try {
        const entries = await fs.readdir(dir);
        if (entries.length > 0) continue;
        assertLiveDataWriteAllowed(dir);
        await fs.rmdir(dir);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT" || code === "ENOTEMPTY") continue;
        throw error;
      }
    }
  }
}

function titleFromSegment(segment: string): string {
  return (
    segment
      .split("-")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ") || segment
  );
}

/** Subdirectories of a collection root. Hidden and unsafe names are skipped. */
export async function listCategoryRelativeDirs(root: string): Promise<string[]> {
  const found: string[] = [];
  const base = path.resolve(root);

  async function walk(dir: string, relative: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      if (!SEGMENT.test(entry.name)) continue;
      const rel = relative ? `${relative}/${entry.name}` : entry.name;
      const full = path.resolve(dir, entry.name);
      if (!isInsideRoot(base, full)) continue;
      found.push(rel);
      await walk(full, rel);
    }
  }

  await walk(base, "");
  return found;
}

/**
 * Add a category snapshot for each on-disk folder that the manifest does not
 * already name. Existing nodes are left unchanged.
 */
export function mergeDiscoveredCategories(
  existing: unknown[] | undefined,
  relativeDirs: readonly string[],
): unknown[] {
  const current = Array.isArray(existing) ? [...existing] : [];
  const known = new Set<string>();
  const idByRelative = new Map<string, string>();
  for (const raw of current) {
    if (!raw || typeof raw !== "object") continue;
    const record = raw as { _id?: unknown; path?: unknown };
    const relative = categoryRelativeDir(typeof record.path === "string" ? record.path : null);
    if (!relative) continue;
    known.add(relative);
    if (record._id != null) idByRelative.set(relative, String(record._id));
  }

  const sorted = [...relativeDirs].sort(
    (left, right) => left.split("/").length - right.split("/").length,
  );
  for (const relative of sorted) {
    if (!categoryRelativeDir(relative) || known.has(relative)) continue;
    const parentRelative = relative.includes("/")
      ? relative.slice(0, relative.lastIndexOf("/"))
      : "";
    const segment = relative.split("/").pop() ?? relative;
    const id = `fs_${relative.replace(/\//g, "_")}`;
    const parentId = parentRelative ? idByRelative.get(parentRelative) : undefined;
    current.push({
      _id: id,
      name: titleFromSegment(segment),
      nodeType: "category",
      path: `/${relative}`,
      ...(parentId ? { parentId } : {}),
      order: 999,
      icon: "mdi:folder",
      source: "filesystem",
    });
    known.add(relative);
    idByRelative.set(relative, id);
  }
  return current;
}

export function categoryPathsEqual(left: unknown[] | undefined, right: unknown[]): boolean {
  const paths = (nodes: unknown[] | undefined) =>
    new Set(
      categoryNodesFromUnknown(nodes)
        .map((node) => categoryRelativeDir(node.path))
        .filter((relative): relative is string => !!relative),
    );
  const a = paths(left);
  const b = paths(right);
  if (a.size !== b.size) return false;
  for (const relative of a) if (!b.has(relative)) return false;
  return true;
}

async function relocateCategoryDir(root: string, fromRel: string, toRel: string): Promise<boolean> {
  const from = resolvedCategoryDir(root, fromRel);
  const to = resolvedCategoryDir(root, toRel);
  if (!from || !to) return false;
  if (path.resolve(from) === path.resolve(to)) return true;

  let source = from;
  let sourceExists = true;
  try {
    await fs.access(from);
  } catch {
    sourceExists = false;
  }

  assertLiveDataWriteAllowed(to);
  if (!sourceExists) {
    await fs.mkdir(to, { recursive: true });
    return true;
  }

  const intoItself = path.relative(from, to);
  const destinationInsideSource =
    intoItself !== "" && !intoItself.startsWith("..") && !path.isAbsolute(intoItself);
  if (destinationInsideSource) {
    const temp = path.join(path.dirname(from), `.moving-${path.basename(from)}`);
    assertLiveDataWriteAllowed(temp);
    await fs.rename(from, temp);
    source = temp;
  }

  await fs.mkdir(path.dirname(to), { recursive: true });
  try {
    let existing: string[] | null = null;
    try {
      existing = await fs.readdir(to);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (existing && existing.length > 0) {
      if (source !== from) await fs.rename(source, from);
      return false;
    }
    if (existing) await fs.rmdir(to);
    assertLiveDataWriteAllowed(source);
    await fs.rename(source, to);
    return true;
  } catch (error) {
    if (source !== from) await fs.rename(source, from).catch(() => undefined);
    throw error;
  }
}

/**
 * Rename category directories to their parent-based location.
 * A child folder that already lives inside a moved parent is carried along.
 * Returns the ids whose folder now sits at `to` on every root.
 */
export async function moveCategoryDirectories(
  moves: readonly CategoryDirMove[],
  roots: readonly string[],
): Promise<Set<string>> {
  const done = new Set(moves.map((move) => move.id));
  if (moves.length === 0) return done;

  const physical = moves
    .filter(
      (move) =>
        !moves.some((other) => other.id !== move.id && move.from.startsWith(`${other.from}/`)),
    )
    .sort((left, right) => left.from.split("/").length - right.from.split("/").length);

  for (const root of roots) {
    for (const move of physical) {
      const ok = await relocateCategoryDir(root, move.from, move.to);
      if (!ok) done.delete(move.id);
    }
  }

  for (const move of moves) {
    const carrierFailed = moves.some(
      (other) =>
        other.id !== move.id && move.from.startsWith(`${other.from}/`) && !done.has(other.id),
    );
    if (carrierFailed) done.delete(move.id);
  }
  return done;
}
