/**
 * @file src/services/security/auth-guard.ts
 * @description
 * Unified Security Context Service (AuthGuardService).
 * Consolidates permission checks, token validation, and stateless threat scanning.
 */

import { logger } from "@utils/logger";
import { auth } from "@src/databases/db";
import {
  scanPayload as scanPayloadLinear,
  scanUrl as scanUrlLinear,
  scanUserAgent as scanUserAgentLinear,
  type ThreatLevel,
} from "./threat-scan";
import type { User, Role } from "@src/databases/auth/types";
import { hasPermissionByAction as legacyHasPermissionByAction } from "@src/databases/auth/permissions";

export type { ThreatLevel };

export class AuthGuardService {
  // ============================================================================
  // SESSION & TOKEN VALIDATION
  // ============================================================================

  /**
   * Validates an active session ID and returns the associated User.
   */
  static async validateSession(sessionId: string): Promise<User | null> {
    const { getAuth } = await import("@src/databases/db");
    const authService = getAuth();
    if (!authService) {
      logger.warn(`[AuthGuardService] Auth service NOT available for sessionId: ${sessionId}`);
      return null;
    }
    const result = await authService.validateSession(sessionId as any, {
      suppressErrorLog: true,
    });
    return result?.success ? result.data : null;
  }

  /**
   * Validates a cryptographic token (e.g. password reset, invite, 2FA).
   */
  static async validateToken(token: string, type?: string, options?: any) {
    if (!auth) return null;
    return auth.validateToken(token, undefined, type as any, options);
  }

  // ============================================================================
  // AUTHORIZATION & PERMISSIONS
  // ============================================================================

  /**
   * Evaluates permissions for a given user, action, and resource context.
   */
  static checkPermissions(
    user: User | null,
    action: string,
    contextType: string,
    contextId?: string,
    userRoles?: Role[],
  ): boolean {
    if (!user) return false;
    // Delegate to the battle-tested permission evaluator
    return legacyHasPermissionByAction(user, action, contextType, contextId, userRoles);
  }

  // ============================================================================
  // STATELESS THREAT SCANNING (OWASP CRS)
  // ============================================================================

  /**
   * Scans a string payload against OWASP Core Rule Set patterns.
   * Returns the highest threat level detected.
   */
  static scanPayload(value: string, checkLdap = false): ThreatLevel {
    return scanPayloadLinear(value, checkLdap);
  }

  /**
   * Scans a user agent string against known malicious actors.
   */
  static scanUserAgent(userAgent: string): ThreatLevel {
    return scanUserAgentLinear(userAgent);
  }

  /**
   * Scans a URL for application-specific threat patterns.
   */
  static scanUrl(url: string): ThreatLevel {
    return scanUrlLinear(url);
  }
}
