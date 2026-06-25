/**
 * @file tests/unit/databases/magic-link.test.ts
 * @description Unit tests for magic-link service module.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@src/databases/db", () => ({
  auth: {
    checkUser: vi.fn(),
    createToken: vi.fn().mockResolvedValue("magic-token-abc"),
  },
}));

vi.mock("@utils/email.server", () => ({
  sendMail: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@src/services/security/audit-service", () => ({
  auditLogService: { log: vi.fn().mockResolvedValue(true) },
  AuditEventType: { MAGIC_LINK_REQUESTED: "magic_link_requested" },
}));

describe("magic-link service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sendMagicLinkForEmail should create token when user exists", async () => {
    const { auth } = await import("@src/databases/db");
    (auth.checkUser as any).mockResolvedValue({
      _id: "u1",
      email: "user@test.com",
    });

    const { sendMagicLinkForEmail } = await import("@src/databases/auth/magic-link");
    const event = {
      request: { url: "http://localhost:5173/login" },
    } as any;

    const result = await sendMagicLinkForEmail(event, "user@test.com");
    expect(result.sent).toBe(true);
    expect(auth.createToken).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "u1", type: "magic_link" }),
    );
  });
});
