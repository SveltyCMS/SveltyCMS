/**
 * @file src/routes/(app)/config/access-management/access.remote.ts
 * @description Access Management Remote Functions — token CRUD without manual fetch boilerplate.
 */

export interface TokenResult {
  success: boolean;
  message?: string;
  error?: string;
}

export async function generateToken(data: {
  name: string;
  permissions: string[];
  expiresAt: string;
}): Promise<TokenResult> {
  const r = await fetch("/api/website-tokens", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (r.status === 409) return { success: false, error: "Token name already exists." };
  const d = await r.json();
  return r.ok ? { success: true, message: "Token created" } : { success: false, error: d.message };
}

export async function deleteWebsiteToken(id: string): Promise<TokenResult> {
  const r = await fetch(`/api/website-tokens/${id}`, { method: "DELETE" });
  const d = await r.json();
  return r.ok ? { success: true, message: "Token deleted" } : { success: false, error: d.message };
}

export async function bulkDeleteTokens(
  ids: string[],
): Promise<{ success: boolean; deleted: number; error?: string }> {
  const results = await Promise.all(
    ids.map((id) => fetch(`/api/website-tokens/${id}`, { method: "DELETE" })),
  );
  const deleted = results.filter((r) => r.ok).length;
  return deleted > 0
    ? { success: true, deleted }
    : { success: false, deleted: 0, error: "Failed to delete tokens" };
}
