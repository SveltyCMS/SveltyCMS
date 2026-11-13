/**
 * @file src/utils/user-role-defaults.ts
 * @description Least-privilege default role for a newly minted invitation.
 *
 * Minting an invite pre-selected as Administrator grants the most privileged
 * account in the CMS by accident, so the default is resolved here rather than
 * inline in the dialog — the rule is testable and any other invite surface can
 * reuse it.
 */

export interface RoleOption {
  _id: string;
  name: string;
}

/** Preference order for the least-privileged default (most useful non-admin first). */
export const PREFERRED_NON_ADMIN_ROLES = ["editor", "user", "viewer"] as const;

/** True for the built-in administrator role, by id or by display name. */
export function isAdminRole(entry: Pick<RoleOption, "_id" | "name">): boolean {
  return /^(admin|administrator)$/i.test(entry._id) || /^(admin|administrator)$/i.test(entry.name);
}

/**
 * Resolves the default role for a NEW invitation.
 *
 * Prefers `editor` → `user` → `viewer` → the first non-admin role, and only
 * falls back to `admin` when it is the sole role available. Editing an existing
 * token passes its stored role explicitly, which wins over this default.
 */
export function resolveDefaultInviteRole(availableRoles: readonly RoleOption[]): string {
  for (const preferred of PREFERRED_NON_ADMIN_ROLES) {
    const match = availableRoles.find(
      (entry) => entry._id.toLowerCase() === preferred || entry.name.toLowerCase() === preferred,
    );
    if (match) return match._id;
  }
  const nonAdmin = availableRoles.find((entry) => !isAdminRole(entry));
  return (nonAdmin ?? availableRoles[0])?._id ?? "admin";
}
