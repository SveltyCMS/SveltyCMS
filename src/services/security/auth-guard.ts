/**
 * @file src/services/security/auth-guard.ts
 * @description
 * Unified Security Context Service (AuthGuardService).
 * Consolidates permission checks, token validation, and stateless threat scanning.
 */

import { auth } from "@src/databases/db";
import { SECURITY_PATTERNS } from "./patterns";
import type { User, Role } from "@src/databases/auth/types";
import { hasPermissionByAction as legacyHasPermissionByAction } from "@src/databases/auth/permissions";

export type ThreatLevel = "none" | "low" | "medium" | "high" | "critical";

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
      console.warn(`[AuthGuardService] Auth service NOT available for sessionId: ${sessionId}`);
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
    if (!value || value.length > 32768) return "none";

    let decoded = value;
    try {
      decoded = decodeURIComponent(value);
    } catch {
      // Ignore decode errors
    }

    const content = (value + " " + decoded).substring(0, 32768);

    for (const pattern of SECURITY_PATTERNS.sqli) if (pattern.test(content)) return "critical";
    for (const pattern of SECURITY_PATTERNS.commandInjection)
      if (pattern.test(content)) return "critical";
    for (const pattern of SECURITY_PATTERNS.xss) if (pattern.test(content)) return "high";
    for (const pattern of SECURITY_PATTERNS.pathTraversal) if (pattern.test(content)) return "high";
    if (checkLdap) {
      for (const pattern of SECURITY_PATTERNS.ldapInjection)
        if (pattern.test(content)) return "high";
    }

    return "none";
  }

  /**
   * Scans a user agent string against known malicious actors.
   */
  static scanUserAgent(userAgent: string): ThreatLevel {
    for (const pattern of SECURITY_PATTERNS.suspicious_ua) {
      if (pattern.test(userAgent)) return "high";
    }
    return "none";
  }

  /**
   * Scans a URL for application-specific threat patterns.
   */
  static scanUrl(url: string): ThreatLevel {
    for (const pattern of SECURITY_PATTERNS.app_threats) {
      if (pattern.test(url)) return "high";
    }
    return "none";
  }
}
