/**
 * @file src/utils/vite-plugin-agent/tools-server.ts
 * @description Read-only file tools for the local agent dev loop.
 *
 * The executor runs inside the Vite dev server process, so every path is fenced by
 * `resolveInsideRoot()` and every result is capped by `AGENT_CAPS`. Results are plain
 * data (never HTML) and carry `truncated`, so a caller can narrow its target instead
 * of pulling a whole tree into the model context.
 */

import fs from "node:fs";
import path from "node:path";
import { AGENT_CAPS } from "./caps.ts";
import { DENIED_SEGMENTS, isAddressableName, resolveInsideRoot } from "./path-policy.ts";

export interface AgentToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  truncated?: boolean;
}

export interface AgentToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, string>;
  readOnly: boolean;
}

/** Tools of this increment. Write tools are deliberately absent. */
export const AGENT_TOOLS: AgentToolDefinition[] = [
  {
    name: "read_file",
    description: "Read a UTF-8 source file inside the repository (line window, capped).",
    parameters: {
      path: "repo-relative path",
      offset: "0-based first line (default 0)",
      limit: "maximum lines (default 500)",
    },
    readOnly: true,
  },
  {
    name: "list_tree",
    description: "List a directory tree inside the repository (depth-capped, deny list skipped).",
    parameters: {
      path: "repo-relative directory (default: repository root)",
      depth: "maximum depth (default 3)",
    },
    readOnly: true,
  },
  {
    name: "grep",
    description: "Search repository text files for a regular expression (file- and match-capped).",
    parameters: {
      pattern: "regular expression",
      glob: "optional filename suffix filter, e.g. .svelte",
    },
    readOnly: true,
  },
  {
    name: "file_exists",
    description: "Report whether a repository path exists and whether it is a directory.",
    parameters: { path: "repo-relative path" },
    readOnly: true,
  },
];

const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".js",
  ".mjs",
  ".cjs",
  ".svelte",
  ".json",
  ".md",
  ".mdx",
  ".css",
  ".html",
  ".yml",
  ".yaml",
  ".txt",
  ".sh",
  ".toml",
]);

/** Read a line window from one file. */
export function readFileTool(
  root: string,
  relPath: string,
  offset = 0,
  limit = AGENT_CAPS.readFileLines,
): AgentToolResult {
  const decision = resolveInsideRoot(root, relPath);
  if (!decision.ok) {
    return { ok: false, error: decision.error };
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(decision.abs);
  } catch {
    return { ok: false, error: "file not found" };
  }
  if (!stat.isFile()) {
    return { ok: false, error: "not a file" };
  }
  if (stat.size > AGENT_CAPS.maxFileBytes) {
    return {
      ok: false,
      error: `file exceeds ${AGENT_CAPS.maxFileBytes} bytes — locate the section with grep first`,
    };
  }

  const lines = fs.readFileSync(decision.abs, "utf8").split("\n");
  const start = Math.max(0, Math.trunc(offset));
  const windowSize = Math.max(1, Math.min(Math.trunc(limit), AGENT_CAPS.readFileLines));
  const window = lines.slice(start, start + windowSize);

  return {
    ok: true,
    data: { path: decision.rel, totalLines: lines.length, offset: start, lines: window },
    truncated: start + window.length < lines.length,
  };
}

/** List a directory tree, skipping denied and hidden entries. */
export function listTreeTool(
  root: string,
  relPath = "",
  depth = AGENT_CAPS.listTreeDepth,
): AgentToolResult {
  let baseAbs = root;
  let baseRel = "";
  if (relPath.trim().length > 0 && relPath.trim() !== ".") {
    const decision = resolveInsideRoot(root, relPath);
    if (!decision.ok) {
      return { ok: false, error: decision.error };
    }
    baseAbs = decision.abs;
    baseRel = decision.rel;
  }

  const maxDepth = Math.max(1, Math.min(Math.trunc(depth), 10));
  const entries: string[] = [];
  let truncated = false;

  const walk = (dirAbs: string, dirRel: string, level: number): void => {
    if (truncated || level > maxDepth) {
      return;
    }
    let dirents: fs.Dirent[];
    try {
      dirents = fs.readdirSync(dirAbs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const dirent of dirents.sort((left, right) => left.name.localeCompare(right.name))) {
      if (entries.length >= AGENT_CAPS.listTreeEntries) {
        truncated = true;
        return;
      }
      if (!isAddressableName(dirent.name)) {
        continue;
      }
      const childRel = dirRel.length === 0 ? dirent.name : `${dirRel}/${dirent.name}`;
      if (dirent.isDirectory()) {
        entries.push(`${childRel}/`);
        walk(path.join(dirAbs, dirent.name), childRel, level + 1);
      } else if (dirent.isFile()) {
        entries.push(childRel);
      }
    }
  };

  walk(baseAbs, baseRel, 1);

  return { ok: true, data: { path: baseRel, depth: maxDepth, entries }, truncated };
}

/** Search text files for a regular expression. */
export function grepTool(root: string, pattern: string, glob = ""): AgentToolResult {
  if (typeof pattern !== "string" || pattern.length === 0) {
    return { ok: false, error: "pattern is required" };
  }
  if (pattern.length > AGENT_CAPS.grepMaxPatternChars) {
    return { ok: false, error: `pattern exceeds ${AGENT_CAPS.grepMaxPatternChars} characters` };
  }

  let regex: RegExp;
  try {
    regex = new RegExp(pattern);
  } catch {
    return { ok: false, error: "invalid regular expression" };
  }

  const results: { path: string; matches: { line: number; text: string }[] }[] = [];
  let scannedFiles = 0;
  let truncated = false;

  const walk = (dirAbs: string, dirRel: string): void => {
    if (truncated || scannedFiles >= AGENT_CAPS.grepScanFiles) {
      return;
    }
    let dirents: fs.Dirent[];
    try {
      dirents = fs.readdirSync(dirAbs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const dirent of dirents.sort((left, right) => left.name.localeCompare(right.name))) {
      if (truncated) {
        return;
      }
      if (!isAddressableName(dirent.name)) {
        continue;
      }
      const childRel = dirRel.length === 0 ? dirent.name : `${dirRel}/${dirent.name}`;
      if (dirent.isDirectory()) {
        walk(path.join(dirAbs, dirent.name), childRel);
        continue;
      }
      if (!dirent.isFile() || !TEXT_EXTENSIONS.has(path.extname(dirent.name).toLowerCase())) {
        continue;
      }
      if (glob.length > 0 && !dirent.name.endsWith(glob)) {
        continue;
      }
      if (results.length >= AGENT_CAPS.grepMaxFiles) {
        truncated = true;
        return;
      }

      const abs = path.join(dirAbs, dirent.name);
      let text: string;
      try {
        if (fs.statSync(abs).size > AGENT_CAPS.maxFileBytes) {
          continue;
        }
        text = fs.readFileSync(abs, "utf8");
      } catch {
        continue;
      }
      scannedFiles += 1;

      const matches: { line: number; text: string }[] = [];
      const lines = text.split("\n");
      for (let index = 0; index < lines.length; index += 1) {
        if (matches.length >= AGENT_CAPS.grepMatchesPerFile) {
          break;
        }
        if (regex.test(lines[index])) {
          matches.push({
            line: index + 1,
            text: lines[index].slice(0, AGENT_CAPS.grepLineChars).trim(),
          });
        }
      }
      if (matches.length > 0) {
        results.push({ path: childRel, matches });
      }
    }
  };

  walk(root, "");

  return { ok: true, data: { pattern, glob, scannedFiles, results }, truncated };
}

/** Report existence and type of a path. */
export function fileExistsTool(root: string, relPath: string): AgentToolResult {
  const decision = resolveInsideRoot(root, relPath);
  if (!decision.ok) {
    return { ok: false, error: decision.error };
  }
  try {
    const stat = fs.statSync(decision.abs);
    return { ok: true, data: { path: decision.rel, exists: true, directory: stat.isDirectory() } };
  } catch {
    return { ok: true, data: { path: decision.rel, exists: false, directory: false } };
  }
}

/** Dispatch a tool call by name. Unknown names and bad arguments fail closed. */
export async function runAgentTool(
  name: string,
  root: string,
  args: Record<string, unknown> = {},
): Promise<AgentToolResult> {
  const asString = (key: string, fallback: string): string => {
    const value = args[key];
    return typeof value === "string" ? value : fallback;
  };
  const asNumber = (key: string, fallback: number): number => {
    const value = args[key];
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  };

  switch (name) {
    case "read_file":
      return readFileTool(
        root,
        asString("path", ""),
        asNumber("offset", 0),
        asNumber("limit", AGENT_CAPS.readFileLines),
      );
    case "list_tree":
      return listTreeTool(root, asString("path", ""), asNumber("depth", AGENT_CAPS.listTreeDepth));
    case "grep":
      return grepTool(root, asString("pattern", ""), asString("glob", ""));
    case "file_exists":
      return fileExistsTool(root, asString("path", ""));
    default:
      return { ok: false, error: `unknown tool "${name}"` };
  }
}

/** Deny list re-exported for the documentation snapshot in the unit tests. */
export { DENIED_SEGMENTS };
