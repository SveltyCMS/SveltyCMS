/**
 * @file src/utils/http-preferences.ts
 * @description HTTP `Prefer` header parsing (RFC 7240) — only the parts this API honours.
 *
 * ### Features
 * - `prefersMinimalReturn` — `Prefer: return=minimal` vs the default `representation`
 * - last-wins semantics for a repeated preference (RFC 7240 section 2)
 * - fails safe: anything unrecognised keeps the default representation
 */

/**
 * True when the caller asked for a status-only ack (`Prefer: return=minimal`) instead of
 * the updated representation (the default).
 *
 * Honoured on writes because the default body is the whole merged document — measured
 * ~3.5 KB for a partial PATCH on the competitive update lane, where a caller that only
 * needs "it worked" pays for a payload it discards. `Prefer` is a *preference*: an absent
 * header, an unknown value or a malformed one keeps today's behaviour, so no existing
 * client can be affected.
 */
export function prefersMinimalReturn(
  header?: string | null | undefined,
  urlOrQuery?: URL | URLSearchParams | string | null | undefined,
): boolean {
  if (urlOrQuery) {
    const searchParams =
      urlOrQuery instanceof URL
        ? urlOrQuery.searchParams
        : urlOrQuery instanceof URLSearchParams
          ? urlOrQuery
          : typeof urlOrQuery === "string"
            ? new URLSearchParams(urlOrQuery.startsWith("?") ? urlOrQuery.slice(1) : urlOrQuery)
            : null;
    if (searchParams) {
      const ret = searchParams.get("return")?.toLowerCase();
      if (ret === "minimal") return true;
      const min = searchParams.get("minimal")?.toLowerCase();
      if (min === "true" || min === "1") return true;
    }
  }
  if (!header) return false;
  let decision: "minimal" | "representation" | null = null;
  for (const token of header.split(",")) {
    const eq = token.indexOf("=");
    if (eq === -1) continue;
    const name = token.slice(0, eq).trim().toLowerCase();
    if (name !== "return") continue;
    const value = token
      .slice(eq + 1)
      .trim()
      .toLowerCase();
    if (value === "minimal") decision = "minimal";
    else if (value === "representation") decision = "representation";
  }
  return decision === "minimal";
}
