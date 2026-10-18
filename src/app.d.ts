/**
 * @file src/app.d.ts
 * @description This file defines the types for the app.
 */

import type { Role, Token, User } from "@src/databases/auth/types";
import type { DatabaseAdapter, Theme, DatabaseId } from "@src/databases/db-interface";

declare global {
  namespace App {
    interface Error {
      message: string;
      code?: string;
    }
    interface Locals {
      // Setup hook caching
      __setupConfigExists?: boolean;
      __setupLogged?: boolean;
      __setupLoginRedirectLogged?: boolean;
      __setupRedirectLogged?: boolean;
      // Per-request handoff: the API dispatcher already wrote the L1 turbo entry
      // (with tags) for a stashed-body GET, so handle-api-requests skips its
      // duplicate write unless a super-admin `?tenantId=` override re-scoped it.
      __dispatcherTurboWrite?: boolean;
      __flags?: import("@src/utils/hook-utils").RequestFlags;
      allTokens: Token[];
      allUsers: User[];
      collections?: unknown;

      // High-performance Local API (Payload style)
      cms?: import("@src/services/sdk").LocalsFacade;

      cspNonce?: string;
      customCss: string;
      darkMode: boolean;
      /** Request-scoped SSR language (set by handleUserPreferences). */
      systemLanguage?: string;
      /** Request-scoped SSR content language (set by handleUserPreferences). */
      contentLanguage?: string;
      /** Tenant-scoped adapter when MULTI_TENANT + tenantId (use for request DB work). */
      dbAdapter?: DatabaseAdapter | null;
      /** Raw adapter without tenant injection (scheduler, migrations, cross-tenant admin). */
      dbAdapterUnscoped?: DatabaseAdapter | null;
      degradedServices?: string[];
      getSession: () => Promise<import("@auth/core/types").Session | null>;
      hasManageUsersPermission: boolean;
      hasAdminPermission: boolean;
      isAdmin: boolean;
      isFirstUser: boolean;
      language: string;
      permissions: string[];
      roles: Role[];
      session_id?: DatabaseId;
      /**
       * Session id parsed once by `classifyRequest` on API GET/HEAD/OPTIONS.
       * `null` means the cookie was scanned and was not present. Unset means
       * the classifier did not run.
       */
      turboSessionId?: string | null;
      /** Authentication Method References for the current session (e.g. ["pwd","mfa"]). */
      sessionAmr?: string[];
      /** ISO timestamp when MFA was verified for this session. */
      mfaVerifiedAt?: string;
      /** `step-up` when this request's browser does not match the session's browser. */
      sessionRisk?: "allow" | "log" | "step-up";
      /** Browser surface the session was bound to. */
      sessionBoundIp?: string;
      sessionBoundUserAgent?: string;
      /** 64-bit BigInt permission bitmask for the current session/user. */
      permMask?: bigint;
      tenantId?: DatabaseId | null;
      theme: Theme | null;
      user: User | null;
      // Set by handle-authentication when a session cookie was present but invalid/expired:
      // the browser has signed in before, so the login page can default to the Sign In form.
      returningUser?: boolean;

      // Tracing and Metrics
      requestStart: number;
      requestId: string;
      /** Classified by routeResourceStateMachine in hooks.server.ts. */
      routeSpec?: import("@src/services/core/route-resource-state-machine").RouteResourceSpec;
    }
  }

  // Common interfaces
  interface Result {
    data: unknown;
    errors: string[];
    message: string;
    success: boolean;
  }

  // Bun runtime global (used in typeof Bun !== "undefined" guards)
  var Bun: {
    version: string;
    gc(expose?: boolean): void;
    [key: string]: any;
  };
}

declare module "bun:sqlite" {
  export class Database {
    constructor(path: string, options?: { create?: boolean; readonly?: boolean });
    query(sql: string): any;
    run(sql: string, ...params: any[]): any;
    close(): void;
  }
}
