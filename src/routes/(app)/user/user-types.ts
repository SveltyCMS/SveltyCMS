/**
 * @file src/routes/(app)/user/user-types.ts
 * @description Shared type definitions for personal account page and its tab views.
 */

export interface UserDisplay {
  _id: string;
  email: string;
  username: string;
  role: string;
  avatar: string;
  tenantId: string;
  is2FAEnabled: boolean;
  isAdmin: boolean;
  authenticators: unknown[];
  permissions: string[];
}

export type AccountTab = "identity" | "security" | "settings" | "management";

export type SessionRow = {
  _id?: string;
  id?: string;
  isCurrent?: boolean;
  userAgent?: string;
  ip?: string;
  ipAddress?: string;
  createdAt?: string;
  lastAccess?: string;
  lastActiveAt?: string;
};

export type DeviceKind = "phone" | "tablet" | "pc" | "mac" | "unknown";

export type DeviceInfo = {
  /** Group key for merging sessions on the same physical browser/device */
  key: string;
  /** e.g. Mac, Windows PC, iPhone, Android tablet */
  deviceLabel: string;
  /** phone | tablet | pc | mac */
  kind: DeviceKind;
  browser: string;
  icon: string;
  title: string;
};

export type SessionGroup = {
  key: string;
  title: string;
  icon: string;
  deviceLabel: string;
  browser: string;
  isCurrent: boolean;
  ip?: string;
  lastActiveLabel: string;
  sessionCount: number;
  members: SessionRow[];
  revokableIds: string[];
  primaryId: string;
};
