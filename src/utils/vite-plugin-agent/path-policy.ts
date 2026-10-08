/**
 * @file src/utils/vite-plugin-agent/path-policy.ts
 * @description Path fence for the local agent dev loop.
 *
 * Every path passes two checks: a lexical one (the resolved path must stay inside the
 * repository root; dot-segments and a deny list are rejected) and a physical one (the
 * deepest existing ancestor is realpath'd and must still be inside the root). The
 * second check closes the symlink escape a purely lexical comparison would miss.
 */

import fs from "node:fs";
import path from "node:path";

/** Directory names that are never addressable. */
export const DENIED_SEGMENTS = [
  ".git",
  ".svelte-kit",
  ".vitest",
  "build",
  "dist",
  "logs",
  "mediaFolder",
  "node_modules",
];

/** Repo-relative patterns (posix separators) that stay closed. */
export const DENIED_PATHS = [/^config\/private/i, /^\.env/i, /\.pem$/i];

export type PathDecision = { ok: true; abs: string; rel: string } | { ok: false; error: string };

/** True when a directory entry is neither hidden nor on the deny list. */
export function isAddressableName(name: string): boolean {
  return !name.startsWith(".") && !DENIED_SEGMENTS.includes(name);
}

/**
 * Resolve a repo-relative path and decide whether the agent may address it.
 *
 * @param root - Repository root (already resolved by the caller).
 * @param candidate - Repo-relative path from the tool call.
 */
export function resolveInsideRoot(root: string, candidate: string): PathDecision {
  if (typeof candidate !== "string" || candidate.trim().length === 0) {
    return { ok: false, error: "path is required" };
  }
  if (candidate.includes("\u0000")) {
    return { ok: false, error: "path contains a null byte" };
  }

  const abs = path.resolve(root, candidate);
  const rel = path.relative(root, abs);
  if (rel.length === 0) {
    return { ok: false, error: "the repository root itself is not addressable" };
  }
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return { ok: false, error: "path escapes the repository root" };
  }

  const posixRel = rel.split(path.sep).join("/");
  for (const segment of posixRel.split("/")) {
    if (segment.startsWith(".")) {
      return { ok: false, error: `dot-segment "${segment}" is not addressable` };
    }
    if (DENIED_SEGMENTS.includes(segment)) {
      return { ok: false, error: `"${segment}" is not addressable` };
    }
  }
  for (const pattern of DENIED_PATHS) {
    if (pattern.test(posixRel)) {
      return { ok: false, error: "path matches a denied pattern" };
    }
  }

  const physical = physicalFence(root, abs);
  if (!physical.ok) {
    return physical;
  }
  return { ok: true, abs, rel: posixRel };
}

/** Symlink fence: realpath the deepest existing ancestor and keep it inside the root. */
function physicalFence(root: string, abs: string): { ok: true } | { ok: false; error: string } {
  let probe = abs;
  while (!fs.existsSync(probe)) {
    const parent = path.dirname(probe);
    if (parent === probe) {
      break;
    }
    probe = parent;
  }

  let realProbe: string;
  let realRoot: string;
  try {
    realProbe = fs.realpathSync(probe);
    realRoot = fs.realpathSync(root);
  } catch {
    return { ok: false, error: "path cannot be resolved" };
  }

  const rel = path.relative(realRoot, realProbe);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return { ok: false, error: "path resolves outside the repository root" };
  }
  return { ok: true };
}
