/**
 * @file src/utils/vite-plugin-agent/caps.ts
 * @description Single source of truth for the local agent dev loop: env flags, access gate, output caps.
 *
 * Every limit lives here so the middleware, the tools and the tests read the same
 * numbers. The caps are deliberately small: a local 4B/35B-class coding model has to
 * stay inside its prefill budget, so an oversized result is truncated (or replaced by
 * a narrower listing) instead of being handed to the model whole.
 */

/** Env flag that registers the dev-only agent plugin. Exactly "1" enables it. */
export const AGENT_ENV_FLAG = "SVELTY_AGENT";

/** Env var carrying a fixed per-session token. Never hardcoded, never defaulted. */
export const AGENT_TOKEN_ENV = "SVELTY_AGENT_TOKEN";

/** Header the client must send on tool calls. */
export const AGENT_TOKEN_HEADER = "x-svelty-agent-token";

export const AGENT_CAPS = {
  /** read_file: maximum lines returned per call. */
  readFileLines: 500,
  /** read_file / grep: maximum bytes read from a single file. */
  maxFileBytes: 256 * 1024,
  /** list_tree: maximum recursion depth. */
  listTreeDepth: 3,
  /** list_tree: maximum entries in one response. */
  listTreeEntries: 400,
  /** grep: files scanned before the walk stops. */
  grepScanFiles: 2000,
  /** grep: matches returned per file. */
  grepMatchesPerFile: 5,
  /** grep: files listed in one response. */
  grepMaxFiles: 20,
  /** grep: characters kept from the matching line. */
  grepLineChars: 300,
  /** grep: maximum pattern length (the pattern is compiled as a regular expression). */
  grepMaxPatternChars: 200,
  /** Request body ceiling for POST /agent/tools/<name>. */
  requestBodyBytes: 8 * 1024,
} as const;

/**
 * Access gate for the dev-only plugin. Anything other than exactly "1" keeps the
 * middleware unregistered — the flag is never inferred from NODE_ENV or TEST_MODE,
 * because a sniffed gate would also switch the plugin on inside its own unit tests.
 */
export function isAgentEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env[AGENT_ENV_FLAG] === "1";
}
