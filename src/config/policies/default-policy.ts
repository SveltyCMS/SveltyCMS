/**
 * @file src/config/policies/default-policy.ts
 * @description
 * Git-versioned default Policy-as-Code (PaC) rules for SveltyCMS.
 *
 * Defines system roles, resource permission action rules, and dynamic predicate constraints
 * compiled at boot into CPU memory for microsecond permission evaluation.
 *
 * ### Features:
 * - Declarative system role definitions
 * - Immutable base permission actions
 * - Fine-grained dynamic resource predicates
 */

export interface PolicyRule {
  id: string;
  roles: string[];
  resources: string[];
  actions: string[];
  effect: "allow" | "deny";
  condition?: (user: Record<string, unknown>, context?: Record<string, unknown>) => boolean;
}

export interface PolicyDefinition {
  version: string;
  name: string;
  description: string;
  rules: PolicyRule[];
}

export const defaultPolicy: PolicyDefinition = {
  version: "1.0.0",
  name: "Default System Policy",
  description: "Base policy rules for core system access, user management, and content collections",
  rules: [
    {
      id: "admin-super-access",
      roles: ["admin", "super-admin"],
      resources: ["*"],
      actions: ["*"],
      effect: "allow",
    },
    {
      id: "editor-content-manage",
      roles: ["editor"],
      resources: ["collection:*", "media:*"],
      actions: ["read", "write", "update", "create"],
      effect: "allow",
    },
    {
      id: "author-own-content",
      roles: ["author"],
      resources: ["collection:*"],
      actions: ["read", "create", "update"],
      effect: "allow",
      condition: (user, context) => {
        if (!context || !context.authorId) return true;
        return context.authorId === user._id || context.authorId === user.id;
      },
    },
    {
      id: "viewer-read-only",
      roles: ["viewer", "guest"],
      resources: ["collection:*"],
      actions: ["read"],
      effect: "allow",
    },
    {
      id: "user-self-profile",
      roles: ["*"],
      resources: ["user:self"],
      actions: ["read", "update"],
      effect: "allow",
      condition: (user, context) => {
        if (!context || !context.targetUserId) return true;
        return context.targetUserId === user._id || context.targetUserId === user.id;
      },
    },
  ],
};
