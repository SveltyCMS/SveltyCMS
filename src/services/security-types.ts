/**
 * @file src/services/security-types.ts
 * @description Shared types for security services and middleware
 */

export type ThreatLevel = "none" | "low" | "medium" | "high" | "critical";
export type ResponseAction =
  | "monitor"
  | "warn"
  | "throttle"
  | "block"
  | "blacklist"
  | "challenge"
  | "allow";

export interface SecurityStatus {
  action: ResponseAction;
  level: ThreatLevel;
  reason?: string;
}

export interface ThreatIndicator {
  evidence: string;
  metadata?: Record<string, unknown>;
  severity: number; // 1-10 scale
  timestamp: number;
  type:
    | "rate_limit"
    | "auth_failure"
    | "csp_violation"
    | "sql_injection"
    | "xss_attempt"
    | "brute_force"
    | "suspicious_ua"
    | "ip_reputation"
    | "command_injection"
    | "ldap_injection"
    | "path_traversal"
    | "header_anomaly"
    | "payload_anomaly"
    | "csrf_detected"
    | "bot_detected"
    | "suspicious_pattern"
    | "threat_detected";
}

export interface SecurityIncident {
  clientIp: string;
  id: string;
  indicators: ThreatIndicator[];
  notes?: string;
  resolved: boolean;
  responseActions: ResponseAction[];
  threatLevel: ThreatLevel;
  timestamp: number;
  userAgent?: string;
  tenantId?: string;
}

export interface SecurityPolicy {
  cooldownPeriod: number;
  name: string;
  responses: ResponseAction[];
  threatLevel: ThreatLevel;
  triggers: {
    indicatorThreshold: number;
    timeWindow: number;
    severityThreshold: number;
  };
}

/** Sliding window rate limit tracking */
export interface RateLimitEntry {
  timestamps: number[];
}

/** Anomaly detection result */
export interface AnomalyResult {
  detected: boolean;
  indicators: ThreatIndicator[];
}
