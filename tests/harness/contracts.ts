/**
 * @file tests/harness/contracts.ts
 * @description Contract interfaces for cross-cutting test verification.
 *
 * These define the contract that every adapter, auth module, and permission
 * system MUST satisfy. Integration tests use these to verify behavioral
 * parity across MongoDB, MariaDB, PostgreSQL, and SQLite.
 *
 * ### Gate Rules
 * - Every new adapter MUST pass the full AdapterContract suite
 * - Every permission change MUST pass the PermissionContract suite
 * - Every auth change MUST pass the AuthContract suite
 * - Unknown API namespaces MUST fail closed with 403
 */

// ---------------------------------------------------------------------------
// Adapter Contract
// ---------------------------------------------------------------------------

export interface AdapterContract {
  /** The adapter must be connectable within 5s */
  connect(): Promise<void>;

  /** The adapter must be disconnectable without throwing */
  disconnect(): Promise<void>;

  /** CRUD: create → read → update → read → delete → read(404) */
  crudLifecycle: {
    create: (collection: string, data: Record<string, unknown>) => Promise<{ _id: string }>;
    read: (collection: string, id: string) => Promise<Record<string, unknown> | null>;
    update: (collection: string, id: string, data: Record<string, unknown>) => Promise<boolean>;
    delete: (collection: string, id: string) => Promise<boolean>;
  };

  /** Multi-tenant isolation: Tenant-A cannot read Tenant-B's data */
  tenantIsolation: {
    writeAsTenantA: (data: Record<string, unknown>) => Promise<{ _id: string }>;
    readAsTenantB: (id: string) => Promise<Record<string, unknown> | null>;
  };
}

// ---------------------------------------------------------------------------
// Auth Contract
// ---------------------------------------------------------------------------

export interface AuthContract {
  /** Login returns a valid session token */
  login: (email: string, password: string) => Promise<{ token: string; user: unknown }>;

  /** Invalid credentials return null/error, never a session */
  loginWithBadCredentials: () => Promise<null | Error>;

  /** Session token is validatable */
  validateSession: (token: string) => Promise<{ valid: boolean; user?: unknown }>;

  /** Expired/invalid token is rejected */
  validateExpiredSession: () => Promise<{ valid: boolean }>;

  /** Account locks after 5 failed attempts */
  accountLockout: {
    failFiveTimes: () => Promise<void>;
    verifyLocked: () => Promise<boolean>;
    verifyUnlockAfterWindow: () => Promise<boolean>;
  };
}

// ---------------------------------------------------------------------------
// Permission Contract
// ---------------------------------------------------------------------------

export interface PermissionContract {
  /** Admin has full access */
  adminCanAccessEverything: (endpoint: string, method: string) => Promise<boolean>;

  /** Editor is denied admin routes */
  editorIsDeniedAdminRoutes: (endpoint: string, method: string) => Promise<boolean>;

  /** Viewer is denied all mutation routes */
  viewerIsDeniedMutations: (endpoint: string, method: string) => Promise<boolean>;

  /** Public requests without auth are 401 */
  publicRequestsAreUnauthorized: (endpoint: string, method: string) => Promise<boolean>;

  /** Unknown API namespaces return 403 (fail-closed) */
  unknownNamespaceIsForbidden: (namespace: string) => Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Setup Gating Contract
// ---------------------------------------------------------------------------

export interface SetupGatingContract {
  /** /api/setup/* returns 403 after setup is complete */
  setupEndpointsAreBlockedAfterCompletion: () => Promise<boolean>;

  /** /setup page redirects to /login after setup complete */
  setupPageRedirectsToLoginAfterCompletion: () => Promise<boolean>;

  /** Bootstrap routes are inaccessible after setup */
  bootstrapRoutesAreInaccessibleAfterSetup: () => Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Widget Contract
// ---------------------------------------------------------------------------

export interface WidgetContract {
  /** Validation schema rejects invalid data */
  validationRejectsInvalid: (widgetName: string, invalidData: unknown) => Promise<boolean>;

  /** Validation schema accepts valid data */
  validationAcceptsValid: (widgetName: string, validData: unknown) => Promise<boolean>;

  /** Default values are populated */
  defaultsArePopulated: (widgetName: string) => Promise<Record<string, unknown>>;

  /** Boundary chaos — extreme values don't crash */
  boundaryChaos: (widgetName: string) => Promise<boolean>;
}

// ---------------------------------------------------------------------------
// LocalCMS Contract
// ---------------------------------------------------------------------------

export interface LocalCMSContract {
  /** Zero-latency: internal lookups complete in < 1ms */
  internalLookupIsSubMillisecond: (
    collection: string,
  ) => Promise<{ duration: number; ok: boolean }>;

  /** No middleware overhead: internal calls bypass HTTP layers */
  bypassesHttpMiddleware: () => Promise<boolean>;

  /** Output matches REST API output (parity) */
  outputMatchesRestApi: (collection: string, id: string) => Promise<boolean>;
}
