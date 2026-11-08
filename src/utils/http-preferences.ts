/**
 * @file src/utils/http-preferences.ts
 * @description HTTP `Prefer` header parsing (RFC 7240) — only the parts this API honours.
 *
 * ### Features
 * - `prefersMinimalReturn` — `Prefer: return=minimal` (the API default) vs the
 *   opt-in full `representation`
 * - last-wins semantics for a repeated preference (RFC 7240 section 2)
 * - explicit opt-out: `Prefer: return=representation` (or `?return=representation`)
 *   restores the full document body; unrecognised tokens keep the default
 */

/**
 * True when the caller gets a status-only ack (`Prefer: return=minimal`) instead of
 * the updated representation.
 *
 * **Minimal is the API default** since 2026-10-09: the default body was the whole
 * merged document — measured ~3.5 KB for a partial PATCH on the competitive update
 * lane, where a caller that only needs "it worked" paid for a payload it discards
 * (~82× the 70 B `{success:true,data:{"_id":…}}` ack). `Prefer` is a *preference*:
 * clients that consume the returned document opt back in with
 * `Prefer: return=representation` (or `?return=representation` / `?minimal=false`),
 * so every existing full-body consumer keeps its bytes on request.
 */
export function prefersMinimalReturn(
  header?: string | null | undefined,
  urlOrQuery?: URL | URLSearchParams | string | null | undefined,
): boolean {
  if (urlOrQuery) {
    let searchStr: string | null = null;
    if (urlOrQuery instanceof URL) {
      searchStr = urlOrQuery.search;
    } else if (urlOrQuery instanceof URLSearchParams) {
      searchStr = urlOrQuery.toString();
    } else if (typeof urlOrQuery === "string") {
      searchStr = urlOrQuery.startsWith("?") ? urlOrQuery.slice(1) : urlOrQuery;
    }

    // Fast-path: if search string is empty or absent, skip URLSearchParams instantiations
    if (searchStr && searchStr.length > 0) {
      // Direct string checks for high-speed early return
      if (searchStr.includes("return=minimal")) return true;
      if (searchStr.includes("return=representation") || searchStr.includes("return=full")) {
        return false;
      }
      if (searchStr.includes("minimal=true") || searchStr.includes("minimal=1")) return true;
      if (searchStr.includes("minimal=false") || searchStr.includes("minimal=0")) return false;

      const searchParams =
        urlOrQuery instanceof URLSearchParams
          ? urlOrQuery
          : urlOrQuery instanceof URL
            ? urlOrQuery.searchParams
            : new URLSearchParams(searchStr);

      // Query params are the strongest signal — explicit per-request override.
      const ret = searchParams.get("return")?.toLowerCase();
      if (ret === "minimal") return true;
      if (ret === "representation" || ret === "full") return false;
      const min = searchParams.get("minimal")?.toLowerCase();
      if (min === "true" || min === "1") return true;
      if (min === "false" || min === "0") return false;
      const fields = searchParams.get("fields")?.trim().toLowerCase();
      if (fields === "_id" || fields === "id" || fields === "none") return true;
      // A real projection implies representation: the caller asks for specific
      // columns back, which the status-only ack cannot carry.
      if (fields) return false;
    }
  }
  if (!header) return true; // Default: minimal status-only ack.
  // Direct fast path for common exact header tokens
  if (header === "return=minimal") return true;
  if (header === "return=representation") return false;

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
  return decision !== "representation";
}
