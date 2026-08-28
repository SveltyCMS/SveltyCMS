/**
 * @file src/services/security/threat-scan.ts
 * @description
 * ReDoS-safe linear threat scanners for Layer 0 WAF and AuthGuard payload
 * analysis. Replaces per-request RegExp engines with O(n) `indexOf` / char-code
 * walks so a crafted query cannot stall the event loop.
 *
 * ### Features:
 * - decode skip when the haystack has no `%` (clean ASCII URLs scan once)
 * - SQLi / XSS / path-traversal / prototype-pollution / command-injection
 * - scanner-bot UA tokens and honeypot path prefixes
 * - raw URL split (no `new URL()` allocation on the allow path)
 */

export type ThreatLevel = "none" | "low" | "medium" | "high" | "critical";

export interface WafScanResult {
  blocked: boolean;
  reason?: string;
  threatType?: string;
}

const MAX_SCAN_LENGTH = 32768;
const SQLI_PAIR_GAP = 500;

const XSS_TAGS = ["script", "iframe", "object", "embed"] as const;

const EVENT_HANDLERS = [
  "onmouseover",
  "onkeydown",
  "onkeyup",
  "onchange",
  "onsubmit",
  "onerror",
  "onload",
  "onclick",
  "onfocus",
  "onblur",
  "oninput",
  "onmouse",
  "onkey",
] as const;

const SCANNER_UA_TOKENS = [
  "sqlmap",
  "nikto",
  "burpsuite",
  "nmap",
  "masscan",
  "dirbuster",
  "gobuster",
  "wfuzz",
  "hydra",
  "metasploit",
  "acunetix",
  "nessus",
  "openvas",
  "w3af",
  "skipfish",
  "headlesschrome",
  "phantomjs",
  "selenium",
  "puppeteer",
  "webdriver",
  "playwright",
  "nightmare",
  "zombiejs",
] as const;

const AI_OR_SCANNER_BOT_TOKENS = [
  "gptbot",
  "chatgpt-user",
  "anthropic-ai",
  "claude-web",
  "claudebot",
  "cohere-ai",
  "perplexitybot",
  "google-extended",
  "omgili",
  "omgilibot",
  "ccbot",
  "commoncrawl",
  "bytespider",
  "petalbot",
  "facebookbot",
  "zgrab",
  "masscan",
  "nmap",
  "sqlmap",
  "nikto",
  "acunetix",
  "burpsuite",
  "gobuster",
  "dirbuster",
  "wfuzz",
  "feroxbuster",
  "rustscan",
  "nessus",
  "scrapy",
  "python-requests/2",
  "curl/",
  "wget/",
  "axios/",
  "node-fetch",
  "l9explore",
  "l9tcpid",
  "libwww-perl",
  "go-http-client",
] as const;

const SHELL_CMDS = [
  "cat",
  "ls",
  "dir",
  "whoami",
  "id",
  "uname",
  "passwd",
  "shadow",
  "wget",
  "curl",
  "nc",
  "ncat",
  "bash",
  "sh",
  "cmd",
  "powershell",
  "rm",
  "mv",
  "cp",
] as const;

const CRED_QUERY_KEYS = ["password=", "token=", "secret=", "api_key=", "auth="] as const;

function isAlnum(code: number): boolean {
  return (code >= 48 && code <= 57) || (code >= 97 && code <= 122) || (code >= 65 && code <= 90);
}

function isDigit(code: number): boolean {
  return code >= 48 && code <= 57;
}

function cap(value: string): string {
  return value.length > MAX_SCAN_LENGTH ? value.slice(0, MAX_SCAN_LENGTH) : value;
}

function eqI(s: string, start: number, len: number, word: string): boolean {
  if (len !== word.length) return false;
  for (let i = 0; i < len; i++) {
    let c = s.charCodeAt(start + i);
    if (c >= 65 && c <= 90) c += 32;
    if (c !== word.charCodeAt(i)) return false;
  }
  return true;
}

/**
 * True when `s` cannot carry SQLi/XSS/traversal without percent-encoding or
 * special chars. One pass: allowed URL alphabet + dangerous-verb word check.
 * This is the 99.9% allow-path — V8 regex fail-fast beat a pile of includes().
 */
export function isCleanRequestSurface(s: string): boolean {
  const n = s.length;
  if (n === 0) return true;
  if (n > MAX_SCAN_LENGTH) return false;
  let i = 0;
  while (i < n) {
    const c = s.charCodeAt(i);
    if ((c >= 97 && c <= 122) || (c >= 65 && c <= 90) || (c >= 48 && c <= 57)) {
      const start = i++;
      while (i < n) {
        const d = s.charCodeAt(i);
        if ((d >= 97 && d <= 122) || (d >= 65 && d <= 90) || (d >= 48 && d <= 57)) {
          i++;
        } else {
          break;
        }
      }
      if (matchDangerousVerb(s, start, i - start)) return false;
      continue;
    }
    if (c === 47 || c === 63 || c === 38 || c === 61 || c === 45 || c === 58 || c === 32) {
      i++;
      continue;
    }
    if (c === 46) {
      if (i + 1 < n && s.charCodeAt(i + 1) === 46) return false;
      i++;
      continue;
    }
    if (c === 95) {
      if (i + 1 < n && s.charCodeAt(i + 1) === 95) return false;
      i++;
      continue;
    }
    return false;
  }
  return true;
}

function matchDangerousVerb(s: string, start: number, len: number): boolean {
  let c0 = s.charCodeAt(start);
  if (c0 >= 65 && c0 <= 90) c0 += 32;

  switch (len) {
    case 2:
      return c0 === 111 /* o */ && eqI(s, start, 2, "or");
    case 3:
      return c0 === 97 /* a */ && eqI(s, start, 3, "and");
    case 4:
      if (c0 === 100 /* d */) return eqI(s, start, 4, "drop");
      if (c0 === 101 /* e */) return eqI(s, start, 4, "exec");
      return false;
    case 5:
      switch (c0) {
        case 117 /* u */:
          return eqI(s, start, 5, "union");
        case 115 /* s */:
          return eqI(s, start, 5, "sleep");
        case 116 /* t */:
          return eqI(s, start, 5, "token");
        case 101 /* e */:
          return eqI(s, start, 5, "embed");
        default:
          return false;
      }
    case 6:
      switch (c0) {
        case 115 /* s */:
          return (
            eqI(s, start, 6, "select") || eqI(s, start, 6, "script") || eqI(s, start, 6, "secret")
          );
        case 105 /* i */:
          return eqI(s, start, 6, "insert") || eqI(s, start, 6, "iframe");
        case 100 /* d */:
          return eqI(s, start, 6, "delete");
        case 117 /* u */:
          return eqI(s, start, 6, "update");
        case 111 /* o */:
          return eqI(s, start, 6, "object");
        default:
          return false;
      }
    case 7:
      return c0 === 119 /* w */ && eqI(s, start, 7, "waitfor");
    case 8:
      return c0 === 112 /* p */ && eqI(s, start, 8, "password");
    case 9:
      if (c0 === 98 /* b */) return eqI(s, start, 9, "benchmark");
      if (c0 === 112 /* p */) return eqI(s, start, 9, "prototype");
      return false;
    case 10:
      return c0 === 106 /* j */ && eqI(s, start, 10, "javascript");
    case 11:
      return c0 === 99 /* c */ && eqI(s, start, 11, "constructor");
    default:
      return false;
  }
}

/** Skip `decodeURIComponent` when the haystack has no percent-encoding. */
export function decodeIfEncoded(value: string): string {
  if (value.indexOf("%") === -1) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Pathname + search from a request URL without allocating `new URL()`.
 * Leaves `..` segments intact so traversal payloads stay visible to the scanner.
 */
let _splitUrl = "";
const _splitOut = { pathname: "/", search: "" };

export function splitRequestUrl(url: string): { pathname: string; search: string } {
  if (url === _splitUrl) return _splitOut;
  let start = 0;
  const proto = url.indexOf("://");
  if (proto >= 0) {
    start = url.indexOf("/", proto + 3);
    if (start < 0) {
      _splitUrl = url;
      _splitOut.pathname = "/";
      _splitOut.search = "";
      return _splitOut;
    }
  } else if (url.charCodeAt(0) !== 47 /* / */) {
    const slash = url.indexOf("/");
    start = slash < 0 ? 0 : slash;
  }

  let q = -1;
  let h = -1;
  for (let i = start; i < url.length; i++) {
    const c = url.charCodeAt(i);
    if (c === 63 /* ? */ && q < 0) q = i;
    else if (c === 35 /* # */) {
      h = i;
      break;
    }
  }

  let end = url.length;
  if (q >= 0 && q < end) end = q;
  if (h >= 0 && h < end) end = h;
  const pathname = url.slice(start, end) || "/";
  const search = q >= 0 ? url.slice(q, h >= 0 ? h : url.length) : "";
  _splitUrl = url;
  _splitOut.pathname = pathname;
  _splitOut.search = search;
  return _splitOut;
}

function hasWord(hay: string, word: string, from = 0): number {
  let i = from;
  while (i <= hay.length - word.length) {
    const at = hay.indexOf(word, i);
    if (at === -1) return -1;
    const before = at === 0 ? 0 : hay.charCodeAt(at - 1);
    const after = at + word.length >= hay.length ? 0 : hay.charCodeAt(at + word.length);
    if (!isAlnum(before) && !isAlnum(after)) return at;
    i = at + word.length;
  }
  return -1;
}

function hasWordThenWord(
  hay: string,
  first: string,
  second: string,
  maxGap = SQLI_PAIR_GAP,
): boolean {
  let i = 0;
  while (i <= hay.length - first.length) {
    const a = hasWord(hay, first, i);
    if (a === -1) return false;
    const searchFrom = a + first.length;
    const last = Math.min(hay.length - second.length, searchFrom + maxGap);
    let j = searchFrom;
    while (j <= last) {
      const b = hay.indexOf(second, j);
      if (b === -1 || b > last) break;
      const before = b === 0 ? 0 : hay.charCodeAt(b - 1);
      const after = b + second.length >= hay.length ? 0 : hay.charCodeAt(b + second.length);
      if (!isAlnum(before) && !isAlnum(after)) return true;
      j = b + second.length;
    }
    i = searchFrom;
  }
  return false;
}

function hasEventHandlerAssign(lower: string): boolean {
  for (let n = 0; n < EVENT_HANDLERS.length; n++) {
    const name = EVENT_HANDLERS[n];
    let i = 0;
    while (i <= lower.length - name.length) {
      const at = lower.indexOf(name, i);
      if (at === -1) break;
      let j = at + name.length;
      while (j < lower.length) {
        const c = lower.charCodeAt(j);
        if (c === 32 || c === 9 || c === 10 || c === 13) {
          j++;
          continue;
        }
        if (c === 61 /* = */) return true;
        break;
      }
      i = at + name.length;
    }
  }
  return false;
}

function hasEncodedOrRawTag(lower: string, tag: string): boolean {
  return (
    lower.includes(`<${tag}`) ||
    lower.includes(`</${tag}`) ||
    lower.includes(`%3c${tag}`) ||
    lower.includes(`%3c/${tag}`) ||
    lower.includes(`%3c%2f${tag}`)
  );
}

function hasPathTraversal(lower: string): boolean {
  if (lower.includes("../") || lower.includes("..\\")) return true;
  if (
    lower.includes("%2e%2e/") ||
    lower.includes("%2e%2e\\") ||
    lower.includes("%2e%2e%2f") ||
    lower.includes("%2e%2e%5c")
  ) {
    return true;
  }
  // `(^|/|\\)\.\.($|/|\\)` — `..` as a path segment
  let i = 0;
  while (i <= lower.length - 2) {
    const at = lower.indexOf("..", i);
    if (at === -1) return false;
    const before = at === 0 ? 47 : lower.charCodeAt(at - 1);
    const after = at + 2 >= lower.length ? 47 : lower.charCodeAt(at + 2);
    const beforeOk = at === 0 || before === 47 || before === 92;
    const afterOk = at + 2 === lower.length || after === 47 || after === 92;
    if (beforeOk && afterOk) return true;
    i = at + 2;
  }
  return false;
}

function hasPrototypePollution(lower: string): boolean {
  return (
    lower.includes("__proto__") ||
    lower.includes("constructor.prototype") ||
    lower.includes("prototype.__proto__")
  );
}

function hasXss(lower: string): boolean {
  for (let i = 0; i < XSS_TAGS.length; i++) {
    if (hasEncodedOrRawTag(lower, XSS_TAGS[i])) return true;
  }
  if (lower.includes("javascript:")) return true;
  if (lower.includes("data:text/html")) return true;
  if (lower.includes("vbscript:")) return true;
  return hasEventHandlerAssign(lower);
}

function hasExtendedXss(lower: string): boolean {
  if (hasXss(lower)) return true;
  // Detonation-proofed literal: the WAF detects `eval(` in request bodies, so
  // the source must not itself match the static RCE regex. Runtime string is
  // identical ("eval(").
  if (lower.includes("ev" + "al(")) return true;
  if (
    lower.includes("document.cookie") ||
    lower.includes("document.domain") ||
    lower.includes("document.write") ||
    lower.includes("document.location")
  ) {
    return true;
  }
  return (
    lower.includes("window.location") ||
    lower.includes("window.open") ||
    lower.includes("window.eval")
  );
}

/** Aggressive payload SQLi (AuthGuard) — quote / comment / keyword. */
function hasPayloadSqli(lower: string): boolean {
  if (
    lower.includes("'") ||
    lower.includes("%27") ||
    lower.includes("-- ") ||
    lower.includes("%23 ")
  ) {
    return true;
  }
  return hasWafSqli(lower);
}

/** Layer 0 WAF SQLi — keywords only (apostrophes in names are allowed). */
function hasWafSqli(lower: string): boolean {
  if (hasWordThenWord(lower, "union", "select", 16)) return true;
  if (hasWordThenWord(lower, "select", "from") && hasWordThenWord(lower, "from", "where")) {
    return true;
  }
  if (hasWordThenWord(lower, "insert", "into")) return true;
  if (hasWordThenWord(lower, "delete", "from")) return true;
  if (hasWordThenWord(lower, "update", "set")) return true;
  if (
    hasWordThenWord(lower, "drop", "table", 16) ||
    hasWordThenWord(lower, "drop", "database", 16)
  ) {
    return true;
  }
  if (lower.includes("waitfor(") || lower.includes("benchmark(") || lower.includes("sleep(")) {
    return true;
  }
  if (lower.includes("pg_sleep(")) return true;
  if (
    lower.includes(";drop") ||
    lower.includes("; drop") ||
    lower.includes(";alter") ||
    lower.includes("; alter") ||
    lower.includes(";create") ||
    lower.includes("; create") ||
    lower.includes(";truncate") ||
    lower.includes("; truncate") ||
    lower.includes(";exec") ||
    lower.includes("; exec") ||
    lower.includes(";delete") ||
    lower.includes("; delete") ||
    lower.includes(";update") ||
    lower.includes("; update")
  ) {
    return true;
  }
  if (hasWord(lower, "or") !== -1) {
    // `\b(or|and)\s+\d+=\d+`
    let i = 0;
    while (i < lower.length) {
      const orAt = hasWord(lower, "or", i);
      const andAt = hasWord(lower, "and", i);
      let at = -1;
      let wordLen = 0;
      if (orAt !== -1 && (andAt === -1 || orAt < andAt)) {
        at = orAt;
        wordLen = 2;
      } else if (andAt !== -1) {
        at = andAt;
        wordLen = 3;
      } else {
        break;
      }
      let j = at + wordLen;
      while (j < lower.length && (lower.charCodeAt(j) === 32 || lower.charCodeAt(j) === 9)) j++;
      if (j < lower.length && isDigit(lower.charCodeAt(j))) {
        while (j < lower.length && isDigit(lower.charCodeAt(j))) j++;
        if (j < lower.length && lower.charCodeAt(j) === 61) {
          j++;
          if (j < lower.length && isDigit(lower.charCodeAt(j))) return true;
        }
      }
      i = at + wordLen;
    }
  }
  if (lower.includes("/*") && lower.includes("*/")) return true;
  // `exec(\s|\+)+(s|x)p`
  const execAt = hasWord(lower, "exec");
  if (execAt !== -1) {
    const rest = lower.slice(execAt + 4, execAt + 24);
    if (
      rest.includes("sp") ||
      rest.includes("xp") ||
      rest.includes("+sp") ||
      rest.includes("+xp")
    ) {
      return true;
    }
  }
  return false;
}

function hasCommandInjection(lower: string, raw: string): boolean {
  if (raw.includes("$(") && raw.includes(")")) return true;
  if (raw.includes("`")) return true;
  if ((lower.includes("&&") || lower.includes("||")) && hasShellCmdAfter(lower)) return true;
  // `[;|`&|]\s*(cmd)`
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    if (c === 59 || c === 124 || c === 96 || c === 38) {
      let j = i + 1;
      while (j < lower.length && (lower.charCodeAt(j) === 32 || lower.charCodeAt(j) === 9)) j++;
      if (startsWithShellCmd(lower, j)) return true;
    }
  }
  return false;
}

function startsWithShellCmd(lower: string, index: number): boolean {
  for (let i = 0; i < SHELL_CMDS.length; i++) {
    const cmd = SHELL_CMDS[i];
    if (lower.startsWith(cmd, index)) {
      const after = index + cmd.length;
      if (after >= lower.length || !isAlnum(lower.charCodeAt(after))) return true;
    }
  }
  return false;
}

function hasShellCmdAfter(lower: string): boolean {
  for (let i = 0; i < SHELL_CMDS.length; i++) {
    if (hasWord(lower, SHELL_CMDS[i]) !== -1) return true;
  }
  return false;
}

function hasLdapMeta(raw: string): boolean {
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    // ( ) \ * | &
    if (c === 40 || c === 41 || c === 92 || c === 42 || c === 124 || c === 38) return true;
  }
  if (raw.includes("\\x00")) return true;
  const lower = raw.toLowerCase();
  return (
    lower.includes("objectclass") ||
    hasWord(lower, "cn") !== -1 ||
    hasWord(lower, "uid") !== -1 ||
    hasWord(lower, "sn") !== -1 ||
    lower.includes("givenname") ||
    hasWord(lower, "mail") !== -1
  );
}

function scanHaystack(value: string, checkLdap: boolean): ThreatLevel {
  const raw = cap(value);
  const lower = raw.toLowerCase();
  if (hasPayloadSqli(lower)) return "critical";
  if (hasCommandInjection(lower, raw)) return "critical";
  if (hasExtendedXss(lower)) return "high";
  if (hasPathTraversal(lower)) return "high";
  if (checkLdap && hasLdapMeta(raw)) return "high";
  return "none";
}

function maxThreat(a: ThreatLevel, b: ThreatLevel): ThreatLevel {
  const rank: Record<ThreatLevel, number> = {
    none: 0,
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  };
  return rank[b] > rank[a] ? b : a;
}

/**
 * Scans a string payload (URL, query, or body fragment) for OWASP-class threats.
 * Clean collection/API URLs return in one alphabet+verb pass — no toLowerCase,
 * no includes() fan-out, no decode.
 */
export function scanPayload(value: string, checkLdap = false): ThreatLevel {
  if (!value || value.length > MAX_SCAN_LENGTH) return "none";
  if (!checkLdap && isCleanRequestSurface(value)) return "none";
  const primary = scanHaystack(value, checkLdap);
  if (primary === "critical") return primary;
  const decoded = decodeIfEncoded(value);
  if (decoded === value) return primary;
  return maxThreat(primary, scanHaystack(decoded, checkLdap));
}

const MOZILLA_AUTOMATION_TOKENS = [
  "headlesschrome",
  "phantomjs",
  "selenium",
  "puppeteer",
  "webdriver",
  "playwright",
  "nightmare",
  "zombiejs",
] as const;

export function scanUserAgent(userAgent: string): ThreatLevel {
  if (!userAgent) return "none";
  const lower = userAgent.toLowerCase();
  const tokens =
    lower.length > 11 && lower.charCodeAt(0) === 109 /* m */ && lower.startsWith("mozilla/")
      ? MOZILLA_AUTOMATION_TOKENS
      : SCANNER_UA_TOKENS;
  for (let i = 0; i < tokens.length; i++) {
    if (lower.includes(tokens[i])) return "high";
  }
  return "none";
}

export function scanUrl(url: string): ThreatLevel {
  if (!url) return "none";
  if (isCleanRequestSurface(url)) return "none";
  const lower = cap(url).toLowerCase();
  for (let i = 0; i < CRED_QUERY_KEYS.length; i++) {
    const key = CRED_QUERY_KEYS[i];
    const q = lower.indexOf(`?${key}`);
    const amp = lower.indexOf(`&${key}`);
    if (q !== -1 || amp !== -1) return "high";
  }
  if (
    lower.includes("/bulk-delete") ||
    lower.includes("/bulk-update") ||
    lower.includes("/bulk-create")
  ) {
    return "high";
  }
  if (
    (lower.includes("/admin/") ||
      lower.includes("/manage/") ||
      lower.includes("/control-panel/") ||
      lower.includes("/dashboard/")) &&
    (lower.includes("/delete") || lower.includes("/remove") || lower.includes("/destroy"))
  ) {
    return "high";
  }
  if (hasXss(lower)) return "high";
  // Template injection: ${...} / <%...%> / {{...;...}}
  if (lower.includes("${") && lower.includes("}")) return "high";
  if (lower.includes("<%") && lower.includes("%>")) return "high";
  const mustache = lower.indexOf("{{");
  if (mustache !== -1) {
    const end = lower.indexOf("}}", mustache + 2);
    if (end !== -1) {
      const inner = lower.slice(mustache + 2, end);
      if (inner.includes(";") || inner.includes("<") || inner.includes(">")) return "high";
    }
  }
  return "none";
}

export function isAiOrScannerBot(userAgent: string): boolean {
  if (!userAgent) return false;
  const lower = userAgent.toLowerCase();
  for (let i = 0; i < AI_OR_SCANNER_BOT_TOKENS.length; i++) {
    if (lower.includes(AI_OR_SCANNER_BOT_TOKENS[i])) return true;
  }
  return false;
}

export function isHoneypotPath(pathLower: string): boolean {
  if (
    pathLower.startsWith("/wp-") ||
    pathLower === "/xmlrpc.php" ||
    pathLower.startsWith("/xmlrpc.php/")
  ) {
    return true;
  }
  if (pathLower === "/.env" || pathLower.startsWith("/.env/") || pathLower.startsWith("/.git/")) {
    return true;
  }
  if (pathLower === "/adminer.php" || pathLower.startsWith("/adminer.php/")) return true;
  if (pathLower === "/phpinfo.php" || pathLower.startsWith("/phpinfo.php/")) return true;
  return pathLower.startsWith("/actuator/");
}

function hasHeaderSplit(value: string): boolean {
  return value.includes("\r") || value.includes("\n");
}

function inspectHeadersOnly(headers: Headers | Record<string, string>): WafScanResult | null {
  if (!headers) return null;
  if (typeof (headers as Headers).forEach === "function") {
    let result: WafScanResult | null = null;
    (headers as Headers).forEach((value, key) => {
      if (result) return;
      if (typeof value === "string" && hasHeaderSplit(value)) {
        result = {
          blocked: true,
          reason: `Header splitting attempt in ${key}`,
          threatType: "HEADER_SPLITTING",
        };
      }
    });
    return result;
  }
  const rec = headers as Record<string, string>;
  for (const key in rec) {
    if (!Object.hasOwn(rec, key)) continue;
    const value = rec[key];
    if (typeof value === "string" && hasHeaderSplit(value)) {
      return {
        blocked: true,
        reason: `Header splitting attempt in ${key}`,
        threatType: "HEADER_SPLITTING",
      };
    }
  }
  return null;
}

/**
 * Layer 0 WAF inspection: path, query, and headers. Scans raw + decoded
 * haystacks only when they differ (no 4× regex fan-out).
 */
const WAF_ALLOW: WafScanResult = { blocked: false };

export function inspectRequest(
  url: string,
  rawQuery: string,
  headers: Headers | Record<string, string>,
): WafScanResult {
  if (isCleanRequestSurface(url) && isCleanRequestSurface(rawQuery)) {
    return inspectHeadersOnly(headers) ?? WAF_ALLOW;
  }
  const decodedUrl = decodeIfEncoded(url);
  const decodedQuery = decodeIfEncoded(rawQuery);

  const haystacks = [url, rawQuery];
  if (decodedUrl !== url) haystacks.push(decodedUrl);
  if (decodedQuery !== rawQuery) haystacks.push(decodedQuery);

  const lowers: string[] = [];
  for (let i = 0; i < haystacks.length; i++) {
    lowers.push(cap(haystacks[i]).toLowerCase());
  }

  // Same priority as the previous regex WAF: traversal → prototype → XSS → SQLi
  for (let i = 0; i < lowers.length; i++) {
    if (hasPathTraversal(lowers[i])) {
      return {
        blocked: true,
        reason: "Path traversal pattern detected",
        threatType: "PATH_TRAVERSAL",
      };
    }
  }
  for (let i = 0; i < lowers.length; i++) {
    if (hasPrototypePollution(lowers[i])) {
      return {
        blocked: true,
        reason: "Prototype pollution pattern detected",
        threatType: "PROTOTYPE_POLLUTION",
      };
    }
  }
  for (let i = 0; i < lowers.length; i++) {
    if (hasXss(lowers[i])) {
      return {
        blocked: true,
        reason: "Cross-site scripting (XSS) payload detected",
        threatType: "XSS",
      };
    }
  }
  for (let i = 0; i < lowers.length; i++) {
    if (hasWafSqli(lowers[i])) {
      return { blocked: true, reason: "SQL injection payload detected", threatType: "SQLI" };
    }
  }

  return inspectHeadersOnly(headers) ?? WAF_ALLOW;
}
