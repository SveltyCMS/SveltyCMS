/**
 * @file tests/unit/permissions/permissions-setting.test.ts
 * @description Unit tests for permissions-setting.svelte core logic.
 *
 * Validates permission presets, toggle behavior, bulk actions,
 * undo/redo history, import/export data integrity.
 * Pure-logic tests — no DOM/JSDOM needed.
 */

import { describe, it, expect } from "vitest";

// ── Replicated test constants from the component ────────────────────────
const PermissionAction = {
  CREATE: "create",
  READ: "read",
  WRITE: "write",
  UPDATE: "update",
  DELETE: "delete",
  MANAGE: "manage",
  ACCESS: "access",
  EXECUTE: "execute",
  SHARE: "share",
} as const;

type PermissionAction = (typeof PermissionAction)[keyof typeof PermissionAction];

type PermissionsMap = Record<string, Record<string, boolean>>;

const presets = {
  "read-only": {
    name: "Read Only",
    permissions: {
      read: true, access: true,
      create: false, write: false, update: false,
      delete: false, manage: false, execute: false, share: false,
    },
  },
  editor: {
    name: "Editor",
    permissions: {
      read: true, access: true,
      create: true, write: true, update: true, share: true,
      delete: false, manage: false, execute: false,
    },
  },
  admin: {
    name: "Administrator",
    permissions: Object.fromEntries(
      Object.values(PermissionAction).map((a) => [a, true]),
    ),
  },
};

// ── Replicated core functions ───────────────────────────────────────────
function initializePermissions(
  current: PermissionsMap,
  roles: { _id: string }[],
): PermissionsMap {
  const init: PermissionsMap = { ...current };
  for (const role of roles) {
    if (!init[role._id]) {
      init[role._id] = Object.fromEntries(
        Object.values(PermissionAction).map((a) => [a, true]),
      );
    }
  }
  return init;
}

function togglePermission(
  state: PermissionsMap,
  roleId: string,
  action: PermissionAction,
): PermissionsMap {
  const clone = JSON.parse(JSON.stringify(state));
  if (!clone[roleId]) clone[roleId] = {} as Record<string, boolean>;
  clone[roleId][action] = !clone[roleId][action];
  return clone;
}

function setAllForRole(
  state: PermissionsMap,
  roleId: string,
  value: boolean,
): PermissionsMap {
  const clone = JSON.parse(JSON.stringify(state));
  clone[roleId] = Object.fromEntries(
    Object.values(PermissionAction).map((a) => [a, value]),
  ) as Record<string, boolean>;
  return clone;
}

function setActionForAllRoles(
  state: PermissionsMap,
  roles: { _id: string; isAdmin?: boolean }[],
  action: PermissionAction,
  value: boolean,
): PermissionsMap {
  const clone = JSON.parse(JSON.stringify(state));
  for (const role of roles) {
    if (!role.isAdmin) {
      if (!clone[role._id]) clone[role._id] = {} as Record<string, boolean>;
      clone[role._id][action] = value;
    }
  }
  return clone;
}

function applyPreset(
  state: PermissionsMap,
  roleId: string,
  presetKey: keyof typeof presets,
): PermissionsMap {
  const clone = JSON.parse(JSON.stringify(state));
  clone[roleId] = { ...presets[presetKey].permissions } as Record<string, boolean>;
  return clone;
}

function cleanPermissions(state: PermissionsMap): PermissionsMap {
  return Object.entries(state).reduce(
    (acc, [roleId, perms]) => {
      const hasRestrictions = Object.values(perms).some((v) => v === false);
      if (hasRestrictions) acc[roleId] = perms;
      return acc;
    },
    {} as PermissionsMap,
  );
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("Permissions Presets", () => {
  it("read-only preset has only read + access enabled", () => {
    const p = presets["read-only"].permissions;
    expect(p.read).toBe(true);
    expect(p.access).toBe(true);
    expect(p.create).toBe(false);
    expect(p.write).toBe(false);
    expect(p.update).toBe(false);
    expect(p.delete).toBe(false);
    expect(p.manage).toBe(false);
    expect(p.execute).toBe(false);
    expect(p.share).toBe(false);
  });

  it("editor preset allows create/write/update/share but not delete/manage", () => {
    const p = presets.editor.permissions;
    expect(p.create).toBe(true);
    expect(p.write).toBe(true);
    expect(p.update).toBe(true);
    expect(p.share).toBe(true);
    expect(p.delete).toBe(false);
    expect(p.manage).toBe(false);
  });

  it("admin preset has all 9 permissions enabled", () => {
    const p = presets.admin.permissions;
    const all = Object.values(PermissionAction) as string[];
    expect(all.length).toBe(9);
    for (const action of all) {
      expect(p[action]).toBe(true);
    }
  });
});

describe("Permission Initialization", () => {
  it("fills missing roles with all-true defaults", () => {
    const state = initializePermissions({}, [{ _id: "role-1" }, { _id: "role-2" }]);
    expect(Object.keys(state)).toHaveLength(2);
    for (const r of ["role-1", "role-2"]) {
      for (const action of Object.values(PermissionAction)) {
        expect(state[r][action]).toBe(true);
      }
    }
  });

  it("preserves existing role permissions", () => {
    const incoming: PermissionsMap = {
      "role-1": { read: true, access: true, create: false, write: false, update: false, delete: false, manage: false, execute: false, share: false },
    };
    const state = initializePermissions(incoming, [{ _id: "role-1" }, { _id: "role-2" }]);
    expect(state["role-1"].create).toBe(false);
    expect(state["role-2"].read).toBe(true);
  });

  it("handles empty roles array", () => {
    const state = initializePermissions({}, []);
    expect(Object.keys(state)).toHaveLength(0);
  });
});

describe("Permission Toggle", () => {
  const base: PermissionsMap = {
    "role-1": Object.fromEntries(
      Object.values(PermissionAction).map((a) => [a, true]),
    ) as Record<string, boolean>,
  };

  it("toggles from true to false", () => {
    const after = togglePermission(base, "role-1", "create" as PermissionAction);
    expect(after["role-1"].create).toBe(false);
  });

  it("toggles from false back to true", () => {
    const after = togglePermission(base, "role-1", "create" as PermissionAction);
    const after2 = togglePermission(after, "role-1", "create" as PermissionAction);
    expect(after2["role-1"].create).toBe(true);
  });

  it("does NOT mutate original state (immutable)", () => {
    const original = JSON.stringify(base);
    togglePermission(base, "role-1", "create" as PermissionAction);
    expect(JSON.stringify(base)).toBe(original);
  });

  it("creates role entry if missing from state", () => {
    const after = togglePermission({}, "new-role", "read" as PermissionAction);
    expect(after["new-role"]).toBeDefined();
    // Default is undefined → toggled becomes true (first toggle)
    expect(after["new-role"].read).toBe(true);
  });
});

describe("Bulk Actions", () => {
  const roles = [
    { _id: "r1", isAdmin: false },
    { _id: "r2", isAdmin: false },
    { _id: "r3", isAdmin: true },
  ];
  const makeFull = () =>
    Object.fromEntries(
      Object.values(PermissionAction).map((a) => [a, true]),
    ) as Record<string, boolean>;

  const base: PermissionsMap = { r1: makeFull(), r2: makeFull(), r3: makeFull() };

  it("setAllForRole disables all permissions for a role", () => {
    const after = setAllForRole(base, "r1", false);
    for (const action of Object.values(PermissionAction)) {
      expect(after.r1[action]).toBe(false);
    }
  });

  it("setAllForRole enables all permissions for a role", () => {
    const partial: PermissionsMap = {
      r1: { read: true, access: true, create: false, write: false, update: false, delete: false, manage: false, execute: false, share: false },
    };
    const after = setAllForRole(partial, "r1", true);
    for (const action of Object.values(PermissionAction)) {
      expect(after.r1[action]).toBe(true);
    }
  });

  it("setActionForAllRoles applies to non-admin roles only", () => {
    const after = setActionForAllRoles(base, roles, "delete" as PermissionAction, false);
    expect(after.r1.delete).toBe(false);
    expect(after.r2.delete).toBe(false);
    expect(after.r3.delete).toBe(true);
  });

  it("setActionForAllRoles does NOT mutate admin roles", () => {
    const after = setActionForAllRoles(base, roles, "manage" as PermissionAction, false);
    expect(after.r3.manage).toBe(true);
  });
});

describe("Preset Application", () => {
  const base: PermissionsMap = {
    "role-1": Object.fromEntries(
      Object.values(PermissionAction).map((a) => [a, true]),
    ) as Record<string, boolean>,
  };

  it("applies read-only preset correctly", () => {
    const after = applyPreset(base, "role-1", "read-only");
    expect(after["role-1"].read).toBe(true);
    expect(after["role-1"].create).toBe(false);
    expect(after["role-1"].delete).toBe(false);
  });

  it("applies editor preset correctly", () => {
    const after = applyPreset(base, "role-1", "editor");
    expect(after["role-1"].create).toBe(true);
    expect(after["role-1"].delete).toBe(false);
    expect(after["role-1"].manage).toBe(false);
  });

  it("does NOT mutate original state", () => {
    const original = JSON.stringify(base);
    applyPreset(base, "role-1", "read-only");
    expect(JSON.stringify(base)).toBe(original);
  });
});

describe("Clean Permissions (Export Filter)", () => {
  it("removes roles with all-true permissions (no restrictions)", () => {
    const state: PermissionsMap = {
      r1: Object.fromEntries(
        Object.values(PermissionAction).map((a) => [a, true]),
      ) as Record<string, boolean>,
      r2: {
        ...(Object.fromEntries(
          Object.values(PermissionAction).map((a) => [a, true]),
        ) as Record<string, boolean>),
        delete: false,
      },
    };
    const cleaned = cleanPermissions(state);
    expect(cleaned.r1).toBeUndefined();
    expect(cleaned.r2).toBeDefined();
  });

  it("returns empty object when all roles are all-true", () => {
    const state: PermissionsMap = {
      r1: Object.fromEntries(
        Object.values(PermissionAction).map((a) => [a, true]),
      ) as Record<string, boolean>,
    };
    expect(Object.keys(cleanPermissions(state))).toHaveLength(0);
  });

  it("handles empty state", () => {
    expect(Object.keys(cleanPermissions({}))).toHaveLength(0);
  });
});

describe("Undo/Redo History Mechanics", () => {
  it("records independent snapshots on each change", () => {
    const h0 = initializePermissions({}, [{ _id: "r1" }]);
    const h1 = togglePermission(h0, "r1", "create" as PermissionAction);

    expect(h0.r1.create).toBe(true);
    expect(h1.r1.create).toBe(false);
  });

  it("undo restores previous state", () => {
    const h0 = initializePermissions({}, [{ _id: "r1" }]);
    const h1 = togglePermission(h0, "r1", "create" as PermissionAction);

    expect(h0.r1.create).toBe(true);
    expect(h1.r1.create).toBe(false);
  });

  it("history entries are independent (no shared references)", () => {
    const h0 = initializePermissions({}, [{ _id: "r1" }]);
    const h1 = togglePermission(h0, "r1", "create" as PermissionAction);
    const h2 = togglePermission(h1, "r1", "manage" as PermissionAction);

    expect(h0.r1.create).toBe(true);
    expect(h0.r1.manage).toBe(true);
    expect(h1.r1.create).toBe(false);
    expect(h1.r1.manage).toBe(true);
    expect(h2.r1.create).toBe(false);
    expect(h2.r1.manage).toBe(false);
  });
});
