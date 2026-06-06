/**
 * @file tests/unit/auth/utils/auth-test-utils.ts
 * @description Shared auth test utilities — single source for user/session/token fixtures.
 */
export function createLockedUser(attempts = 5, lockoutMinutes = 15) {
  return {
    _id: "locked_user_1",
    email: "locked@test.com",
    role: "editor",
    failedAttempts: attempts,
    blocked: true,
    lockoutUntil: new Date(Date.now() + lockoutMinutes * 60_000),
  };
}

export function createValidSession() {
  return {
    _id: "sess_valid_123",
    userId: "u1",
    token: "valid_token_abc",
    expiresAt: new Date(Date.now() + 3_600_000),
    createdAt: new Date(),
    tenantId: "tenant_1",
    ipAddress: "127.0.0.1",
    userAgent: "test-agent",
  };
}

export function createExpiredSession() {
  return {
    _id: "sess_expired_456",
    userId: "u1",
    token: "expired_token_def",
    expiresAt: new Date(Date.now() - 3_600_000),
    createdAt: new Date(Date.now() - 7_200_000),
    tenantId: "tenant_1",
    ipAddress: "127.0.0.1",
    userAgent: "test-agent",
  };
}

export function createTotpData(secret = "JBSWY3DPEHPK3PXP") {
  return {
    secret,
    uri: `otpauth://totp/SveltyCMS:admin@test.com?secret=${secret}&issuer=SveltyCMS`,
    code: "123456",
    windowStart: Date.now() - 30_000,
    windowEnd: Date.now() + 30_000,
  };
}
