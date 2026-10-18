/**
 * @file src/databases/auth/permission-bitmask.ts
 * @description 64-Bit Bitmask Security Engine for SveltyCMS (Phase 2).
 *
 * Features:
 * - Maps all granular permissions (ENDPOINT_PERMISSIONS and core system permissions)
 *   to a fixed 64-bit BigInt bitset table for single-instruction CPU register evaluation ((mask & req) !== 0n).
 * - Supports atomic cross-worker in-memory role bitset invalidation via SharedArrayBuffer/Atomics and BroadcastChannel.
 * - Provides forward-compatible extension hooks for future field-based access control (FLAC).
 */

import type { Role, User } from "./types";
import { isAdmin } from "./constants";
import { PERMISSION_CATALOG, resolvePermissionId } from "./permission-catalog";

/**
 * 64-bit bitmask definitions derived from the canonical permission catalog.
 * Fixed bit assignment guarantees zero-drift across workers and restarts;
 * alias ids (`users:read`, `collections:create`, …) share their canonical bit.
 */
export const PERMISSION_BITS: Record<string, bigint> = (() => {
  const bits: Record<string, bigint> = {};
  for (const permission of PERMISSION_CATALOG) {
    if (permission.bitIndex === undefined) continue;
    const bit = 1n << BigInt(permission.bitIndex);
    bits[permission.id] = bit;
    for (const alias of permission.aliases ?? []) {
      bits[alias] = bit;
    }
  }
  return bits;
})();

/** All 64 bits set — root admin super-mask */
export const ADMIN_PERM_MASK: bigint = 0xffff_ffff_ffff_ffffn;
export const EMPTY_PERM_MASK: bigint = 0n;

/**
 * Bit 63 is a PRESENCE INDICATOR, never a grant: it is set when a role or user holds at
 * least one `field:*` permission so the 64-bit mask can signal "this principal has
 * field-level grants". No authorization path may read it as "all field permissions" —
 * a `field:*` id resolves to `0n` in `getPermissionBit` (so `hasPermissionBitmask`
 * stays fail-closed) and field-level access control is string-based in
 * `field-permission-service.ts`.
 */
export const FIELD_PERMISSION_OVERFLOW_BIT: bigint = 1n << 63n;

// Dynamic permission bit registry (for dynamically registered permissions).
// Allocate after the highest statically assigned catalog bit (bits 45..62 today)
// so a dynamic id can never collide with `ai:use`/`ai:admin` or any future bit.
const _dynamicPermBits = new Map<string, bigint>();
let _nextDynamicBit = (() => {
  let next = 0n;
  for (const permission of PERMISSION_CATALOG) {
    if (permission.bitIndex !== undefined && BigInt(permission.bitIndex) >= next) {
      next = BigInt(permission.bitIndex) + 1n;
    }
  }
  return next;
})();

/**
 * Returns the 64-bit BigInt mask for a permission ID.
 * Returns 0n if the permission is unmapped or field-specific.
 */
export function getPermissionBit(permissionId: string): bigint {
  const staticBit =
    PERMISSION_BITS[permissionId] ?? PERMISSION_BITS[resolvePermissionId(permissionId)];
  if (staticBit !== undefined) return staticBit;

  const dynamicBit = _dynamicPermBits.get(permissionId);
  if (dynamicBit !== undefined) return dynamicBit;

  // Dynamically allocate if within the 64-bit window (bits 45..62)
  if (_nextDynamicBit < 63n && !permissionId.startsWith("field:")) {
    const bit = 1n << _nextDynamicBit;
    _nextDynamicBit += 1n;
    _dynamicPermBits.set(permissionId, bit);
    return bit;
  }

  return 0n;
}

/**
 * Registers a dynamic permission into the bitmask table.
 */
export function registerBitmaskPermission(permissionId: string): bigint {
  return getPermissionBit(permissionId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Atomic in-memory role bitset invalidation across worker threads
// ─────────────────────────────────────────────────────────────────────────────

// Shared buffer with atomic version counter for sub-microsecond cross-thread invalidation
const _sharedBuffer =
  typeof SharedArrayBuffer !== "undefined" ? new SharedArrayBuffer(4) : new ArrayBuffer(4);
const _roleVersionArray = new Int32Array(_sharedBuffer);

// WeakMap cache: Role -> { version: number; mask: bigint }
const _roleBitmaskCache = new WeakMap<object, { version: number; mask: bigint }>();

let _roleBroadcastChannel: BroadcastChannel | null = null;
if (typeof globalThis.BroadcastChannel !== "undefined") {
  try {
    _roleBroadcastChannel = new globalThis.BroadcastChannel("sveltycms:roles");
    _roleBroadcastChannel.onmessage = (event) => {
      if (event.data?.type === "INVALIDATE_ROLE_BITSETS") {
        Atomics.add(_roleVersionArray, 0, 1);
      }
    };
  } catch {
    // Non-fatal if BroadcastChannel isn't supported in worker environment
  }
}

/**
 * Atomically invalidates cached role bitsets across all worker threads.
 */
export function invalidateRoleBitsetsGlobally(): void {
  Atomics.add(_roleVersionArray, 0, 1);
  if (_roleBroadcastChannel) {
    try {
      _roleBroadcastChannel.postMessage({ type: "INVALIDATE_ROLE_BITSETS" });
    } catch {
      // Non-fatal
    }
  }
}

const DEFAULT_ROLE_NAMES: Record<string, string> = {
  admin: "Administrator",
  developer: "Developer",
  editor: "Editor",
  author: "Author",
};

/**
 * Compiles a role's permissions into a single 64-bit BigInt mask.
 * Cached in WeakMap and invalidated atomically when roles are modified.
 */
export function getRolePermMask(role: Role): bigint {
  if (role.isAdmin) return ADMIN_PERM_MASK;

  const currentVersion = Atomics.load(_roleVersionArray, 0);
  const cached = _roleBitmaskCache.get(role);
  if (cached && cached.version === currentVersion) {
    return cached.mask;
  }

  let mask = 0n;
  for (const permId of role.permissions || []) {
    const bit = getPermissionBit(permId);
    if (bit !== 0n) {
      mask |= bit;
    } else if (permId.startsWith("field:")) {
      mask |= FIELD_PERMISSION_OVERFLOW_BIT;
    }
  }

  _roleBitmaskCache.set(role, { version: currentVersion, mask });
  return mask;
}

/**
 * Computes the total combined 64-bit permission mask for a user across all assigned roles.
 */
export function computeUserPermMask(user: User, roles: Role[] = []): bigint {
  if (isAdmin(user)) return ADMIN_PERM_MASK;

  let userMask = 0n;

  // Direct user-level permissions override
  if (Array.isArray(user.permissions)) {
    for (const p of user.permissions) {
      const bit = getPermissionBit(p);
      if (bit !== 0n) userMask |= bit;
      else if (p.startsWith("field:")) userMask |= FIELD_PERMISSION_OVERFLOW_BIT;
    }
  }

  const userRoleLower = (user.role || "").toLowerCase();
  const defaultRoleName = DEFAULT_ROLE_NAMES[userRoleLower];

  for (let i = 0; i < roles.length; i++) {
    const role = roles[i];
    const matches =
      role._id === user.role || (defaultRoleName ? role.name === defaultRoleName : false);
    if (!matches) continue;
    if (role.isAdmin) return ADMIN_PERM_MASK;

    userMask |= getRolePermMask(role);
  }

  return userMask;
}

/**
 * High-performance bitwise evaluation: single CPU register operation ((mask & req) !== 0n).
 * Accepts either a pre-computed BigInt bit or a permission string ID.
 */
export function hasPermissionBitmask(userMask: bigint, reqBit: bigint | string): boolean {
  if (userMask === ADMIN_PERM_MASK) return true;
  const bit = typeof reqBit === "string" ? getPermissionBit(reqBit) : reqBit;
  if (bit === 0n) return false;
  return (userMask & bit) !== 0n;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dynamic Multi-Word Uint32Array Bitset Engine
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the current atomic global role/permission revision epoch.
 */
export function getRoleBitsetVersion(): number {
  return Atomics.load(_roleVersionArray, 0);
}

/**
 * Checks if a session's cached permission revision is stale compared to global epoch.
 */
export function isPermissionBitsetStale(sessionPermRev?: number): boolean {
  if (sessionPermRev === undefined) return false;
  return sessionPermRev !== Atomics.load(_roleVersionArray, 0);
}

/**
 * Creates an empty multidimensional permission bitset.
 */
export function createPermissionBitset(initialWords = 4): Uint32Array {
  return new Uint32Array(Math.max(1, initialWords));
}

/**
 * Sets a specific bit index in the multidimensional bitset.
 * Automatically grows the Uint32Array if bitIndex exceeds current capacity.
 */
export function setPermissionBitIndex(bitset: Uint32Array, bitIndex: number): Uint32Array {
  const word = bitIndex >>> 5; // Math.floor(bitIndex / 32)
  const bit = bitIndex & 31; // bitIndex % 32

  let target = bitset;
  if (word >= target.length) {
    const expanded = new Uint32Array(word + 1);
    expanded.set(target);
    target = expanded;
  }

  target[word] |= 1 << bit;
  return target;
}

/**
 * Checks whether a specific bit index is granted in a multidimensional bitset or serialized words.
 */
export function hasPermissionBitIndex(
  bitset: Uint32Array | number[] | undefined | null,
  bitIndex: number,
): boolean {
  if (!bitset) return false;
  const word = bitIndex >>> 5;
  if (word >= bitset.length) return false;
  const bit = bitIndex & 31;
  const val = bitset[word];
  if (val === undefined) return false;
  return (val & (1 << bit)) !== 0;
}

/**
 * Serializes a Uint32Array bitset to a JSON-safe number array.
 */
export function serializePermissionBitset(bitset: Uint32Array): number[] {
  return Array.from(bitset);
}

/**
 * Rehydrates a Uint32Array bitset from serialized number array words.
 */
export function rehydratePermissionBitset(permBits?: Uint32Array | number[] | null): Uint32Array {
  if (permBits instanceof Uint32Array) return permBits;
  return permBits && permBits.length > 0 ? Uint32Array.from(permBits) : new Uint32Array(4);
}
