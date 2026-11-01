/**
 * @file tests/unit/scripts/scan-anonymous-leaks.test.ts
 * @description Fixtures for the anonymous-leak gate.
 *
 * Pins the two audit findings the guard exists for — B1 `forgotPW` answering
 * with a live reset URL and N2 `sendMagicLinkForEmail` returning `devLink` —
 * plus the boundaries that decide whether a hit is real: the double opt-in
 * gate (both halves, call-time), the session guard, the hook-protected route
 * and the "it is configuration, not a response" cases.
 */

import { describe, expect, it } from "vitest";
import {
  isHookAuthenticated,
  isPublicRoutePath,
  routePathOf,
  scanAnonymousLeaks,
  type SourceFile,
} from "../../../scripts/lint/scan-anonymous-leaks";

const file = (path: string, source: string): SourceFile => ({ path, source });

const ROUTE = "src/routes/login/auth.remote.ts";

/** B1 shape: an anonymous command returns the reset link it just built. */
const UNGATED = `
import { command } from "$app/server";

export const forgotPW = command("unchecked", async (data: any) => {
  return await forgotPWInternal(data);
});

async function forgotPWInternal(input: any) {
  const token = await createToken();
  const resetLink = "/login?token=" + token;
  return {
    success: true,
    smtpConfigured: false,
    resetLink,
  };
}
`;

/** Both halves of the gate, read at call time through a helper. */
const GATED = `
import { command } from "$app/server";

function resetLinkExposureAllowed(env: Record<string, string | undefined> = process.env): boolean {
  return env.ALLOW_PASSWORD_RESET_LINK_IN_RESPONSE === "true" && env.NODE_ENV !== "production";
}

export const forgotPW = command("unchecked", async (data: any) => {
  return await forgotPWInternal(data);
});

async function forgotPWInternal(input: any) {
  const token = await createToken();
  const resetLink = "/login?token=" + token;
  const expose = !input.smtpConfigured && resetLinkExposureAllowed();
  return {
    success: true,
    resetLink: expose ? resetLink : undefined,
  };
}
`;

describe("scanAnonymousLeaks", () => {
  it("flags an anonymous handler returning a reset link (B1)", () => {
    const leaks = scanAnonymousLeaks([file(ROUTE, UNGATED)]);

    expect(leaks).toHaveLength(1);
    expect(leaks[0]).toMatchObject({ file: ROUTE, key: "resetLink", handler: "forgotPW" });
    expect(leaks[0].reason).toContain('missing NODE_ENV !== "production"');
    expect(leaks[0].reason).toContain("ALLOW_*_IN_RESPONSE");
  });

  it("passes a reset link behind both halves of the gate", () => {
    expect(scanAnonymousLeaks([file(ROUTE, GATED)])).toEqual([]);
  });

  it("fails when the opt-in flag is missing (only NODE_ENV)", () => {
    const onlyNodeEnv = GATED.replace(
      'return env.ALLOW_PASSWORD_RESET_LINK_IN_RESPONSE === "true" && env.NODE_ENV !== "production";',
      'return env.NODE_ENV !== "production";',
    );
    const leaks = scanAnonymousLeaks([file(ROUTE, onlyNodeEnv)]);

    expect(leaks).toHaveLength(1);
    expect(leaks[0].reason).toContain("only one half");
    expect(leaks[0].reason).toContain("ALLOW_*_IN_RESPONSE");
    expect(leaks[0].reason).not.toContain('missing NODE_ENV !== "production"');
  });

  it("fails when NODE_ENV is missing (only the opt-in flag)", () => {
    const onlyFlag = GATED.replace(
      'return env.ALLOW_PASSWORD_RESET_LINK_IN_RESPONSE === "true" && env.NODE_ENV !== "production";',
      'return env.ALLOW_PASSWORD_RESET_LINK_IN_RESPONSE === "true";',
    );
    const leaks = scanAnonymousLeaks([file(ROUTE, onlyFlag)]);

    expect(leaks).toHaveLength(1);
    expect(leaks[0].reason).toContain('missing NODE_ENV !== "production"');
    expect(leaks[0].reason).not.toContain("ALLOW_*_IN_RESPONSE");
  });

  it("does not trust a module-scope gate constant", () => {
    const moduleScope = `
const RESET_LINK_IN_RESPONSE =
  process.env.NODE_ENV !== "production" &&
  process.env.ALLOW_PASSWORD_RESET_LINK_IN_RESPONSE === "true";

export const forgotPW = command("unchecked", async () => {
  const resetLink = "/login?token=x";
  return { success: true, resetLink: RESET_LINK_IN_RESPONSE ? resetLink : undefined };
});
`;
    expect(scanAnonymousLeaks([file(ROUTE, moduleScope)])).toHaveLength(1);
  });

  it("follows a local helper chain and an imported callee (N2)", () => {
    const remote = `
import { command } from "$app/server";
import { sendMagicLinkForEmail } from "@src/databases/auth/magic-link";

export const requestMagicLink = command("unchecked", async (data: any) => {
  const result = await sendMagicLinkForEmail(data.email);
  return { success: true, smtpConfigured: result.smtpConfigured };
});
`;
    const magicLink = `
export async function sendMagicLinkForEmail(email: string) {
  const magicLink = "/login?magic_token=" + email;
  let devLink: string | undefined;
  devLink = magicLink;
  return { sent: true, smtpConfigured: false, devLink };
}
`;
    const leaks = scanAnonymousLeaks([
      file(ROUTE, remote),
      file("src/databases/auth/magic-link.ts", magicLink),
    ]);

    expect(leaks).toHaveLength(1);
    expect(leaks[0]).toMatchObject({
      file: "src/databases/auth/magic-link.ts",
      key: "devLink",
      handler: "requestMagicLink",
    });
  });

  it("skips handlers that check the session themselves", () => {
    const guarded = `
import { command } from "$app/server";

export const reauth = command("unchecked", async () => {
  const user = getAuthenticatedUser(event.locals);
  return { token: signReauthToken(String(user._id)), resetLink: "/x" };
});
`;
    expect(scanAnonymousLeaks([file(ROUTE, guarded)])).toEqual([]);
  });

  it("skips route files the auth hook already protects", () => {
    const page = `
export const load = async ({ locals }) => {
  const resetLink = "/login?token=x";
  return { resetLink };
};
`;
    const path = "src/routes/(app)/dashboard/+page.server.ts";

    expect(isHookAuthenticated(path)).toBe(true);
    expect(scanAnonymousLeaks([file(path, page)])).toEqual([]);
  });

  it("scans a public route load", () => {
    const page = `
export const load = async () => {
  const resetLink = "/login?token=x";
  return { resetLink };
};
`;
    const path = "src/routes/login/+page.server.ts";

    expect(isHookAuthenticated(path)).toBe(false);
    expect(scanAnonymousLeaks([file(path, page)])).toHaveLength(1);
  });

  it("ignores configuration objects and echoed caller tokens", () => {
    const source = `
import { command } from "$app/server";

const limiter = new RateLimiter({ cookie: { secret: rateLimitSecret } });

export const load = async () => {
  const inviteToken = url.searchParams.get("invite_token");
  return { isInviteFlow: true, token: inviteToken };
};
`;
    expect(scanAnonymousLeaks([file("src/routes/login/+page.server.ts", source)])).toEqual([]);
  });

  it("flags a freshly minted token in a returned payload", () => {
    const source = `
export const load = async () => {
  const token = await auth.createToken({ type: "password_reset" });
  return { success: true, token };
};
`;
    const leaks = scanAnonymousLeaks([file("src/routes/login/+page.server.ts", source)]);
    expect(leaks).toHaveLength(1);
    expect(leaks[0].key).toBe("token");
  });

  it("flags a link inside a redirect payload", () => {
    const source = `
export const load = async () => {
  const resetLink = "/login?token=x";
  throw redirect(303, resetLink);
};
`;
    expect(scanAnonymousLeaks([file("src/routes/login/+page.server.ts", source)])).toHaveLength(1);
  });
});

describe("route classification", () => {
  it("maps a route file to its URL path", () => {
    expect(routePathOf("src/routes/(app)/dashboard/+page.server.ts")).toBe("/dashboard");
    expect(routePathOf("src/routes/login/+page.server.ts")).toBe("/login");
    expect(routePathOf("src/routes/api/[...path]/+server.ts")).toBe("/api/[...path]");
    expect(routePathOf("src/utils/email.server.ts")).toBeNull();
  });

  it("mirrors the runtime public allowlist", () => {
    expect(isPublicRoutePath("/login")).toBe(true);
    expect(isPublicRoutePath("/share/abc")).toBe(true);
    expect(isPublicRoutePath("/de/login")).toBe(true);
    expect(isPublicRoutePath("/dashboard")).toBe(false);
    expect(isPublicRoutePath("/api/media/list")).toBe(false);
  });

  it("treats .remote.ts as public transport", () => {
    expect(isHookAuthenticated("src/routes/(app)/user/user.remote.ts")).toBe(false);
    expect(isHookAuthenticated("src/routes/(admin)/admin/tenants/tenants.remote.ts")).toBe(false);
  });
});
