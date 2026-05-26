/**
 * @file src/routes/(app)/config/redirects/redirects.remote.ts
 * @description Redirect Manager Remote Functions — isomorphic fetch wrappers for client-side use.
 *
 * ### Features:
 * - save (upsert) a redirect rule via SvelteKit form action
 * - delete a redirect rule via SvelteKit form action
 *
 * @remarks All exports must be plain async functions (no RequestEvent, no server imports).
 */

export interface RedirectResult {
  success: boolean;
  error?: string;
}

export async function saveRedirectRemote(rule: {
  id?: string;
  from: string;
  to: string;
  type: number;
  active: boolean;
  isRegex: boolean;
}): Promise<RedirectResult> {
  const fd = new FormData();
  if (rule.id) fd.set("id", rule.id);
  fd.set("from", rule.from);
  fd.set("to", rule.to);
  fd.set("type", String(rule.type));
  fd.set("active", String(rule.active));
  if (rule.isRegex) fd.set("isRegex", "on");

  const r = await fetch("?/save", { method: "POST", body: fd });
  const d = await r.json().catch(() => ({}));
  return r.ok ? { success: true } : { success: false, error: d?.message ?? "Save failed" };
}

export async function deleteRedirectRemote(id: string): Promise<RedirectResult> {
  const fd = new FormData();
  fd.set("id", id);

  const r = await fetch("?/delete", { method: "POST", body: fd });
  const d = await r.json().catch(() => ({}));
  return r.ok ? { success: true } : { success: false, error: d?.message ?? "Delete failed" };
}
