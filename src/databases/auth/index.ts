/**
 * @file src/databases/auth/index.ts
 * @description Barrel entry point for the authentication and authorization subsystem.
 * Features:
 * - Re-exports Auth service and Argon2id password helpers from ./auth-service
 * - Re-exports RBAC permission helpers from ./permissions
 * - Re-exports safe session/token constants from ./constants
 * - Re-exports auth domain types from ./types and ./two-factor-auth
 */

export { Auth, hashPassword, verifyPassword, verifyDummyPassword } from "./auth-service";

export {
  checkPermissions,
  getAllPermissions,
  getPermissionById,
  getRolePermissionsWithRoles as checkRolePermissions,
  hasPermissionByAction,
  hasPermissionWithRoles as hasPermission,
  isAdminRoleWithRoles,
  permissions,
  registerPermission,
  validateUserPermission,
} from "./permissions";

// Note: TOTP functions are server-only and should be imported from './totp' directly
// to avoid bundling Node.js crypto module in client-side code.
// Use: import { generateTOTPSecret, ... } from '@src/databases/auth/totp';

// Note: TwoFactorAuthService is server-only and should be imported from './two-factor-auth' directly
// to avoid bundling Node.js crypto module in client-side code.
// Use: import { TwoFactorAuthService, ... } from '@src/databases/auth/two-factor-auth';

// Export safe constants
export { generateRandomToken, generateTokenWithExpiry, SESSION_COOKIE_NAME } from "./constants";
export type { TwoFactorSetupResponse, TwoFactorVerificationResult } from "./two-factor-auth";
export type {
  Permission,
  PermissionAction,
  PermissionType,
  Role,
  RolePermissions,
  Session,
  SessionStore,
  Token,
  User,
  ApiKey,
} from "./types";
