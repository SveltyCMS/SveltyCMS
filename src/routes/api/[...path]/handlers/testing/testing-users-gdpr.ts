/**
 * @file src/routes/api/[...path]/handlers/testing/testing-users-gdpr.ts
 * @description User fixtures, event emission, and GDPR erasure actions for the testing API.
 */

import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger";
import { withSystemScope } from "@src/databases/system-tenant-scope";
import { loadSettingsServiceModule, rawResponse, type TestingContext } from "./testing-shared";

export async function handleTestingUserGdprRoutes(
  ctx: TestingContext,
): Promise<Response | undefined> {
  const { cms, tenantId, params, action } = ctx;

  if (action === "get-user") {
    const { email } = params;
    const result = await cms.auth.listUsers({ tenantId });
    // listUsers is wrapped by safeCall: { success, data: { data: [...], pagination } }
    const users = result.success ? result.data?.data : result.data;
    const user = Array.isArray(users) ? users.find((u: any) => u.email === email) : undefined;
    return rawResponse({ success: !!user, user });
  }

  if (action === "get-user-count") {
    const result = await cms.db.auth.getUserCount({}, { tenantId });
    const count = result.success ? result.data : 0;
    return rawResponse({ success: true, count });
  }

  /**
   * set-setting — update a private/public setting for E2E fixtures (e.g. USE_2FA).
   * Body: { action, key, value, scope?: "private" | "public" }
   */
  if (action === "set-setting") {
    const { key, value } = params;
    if (!key || typeof key !== "string") {
      throw new AppError("key is required", 400);
    }
    const { setPrivateSetting } = await loadSettingsServiceModule();
    await setPrivateSetting(key as any, value as any, (tenantId || undefined) as any);
    return rawResponse({ success: true, key, value });
  }

  /**
   * bulk-create-users — seed N unique users for pagination E2E.
   * Body: { action, count?: number, role?: string, prefix?: string }
   */
  if (action === "bulk-create-users") {
    const count = Math.min(Math.max(Number(params.count) || 12, 1), 50);
    const role = params.role || "editor";
    const prefix = params.prefix || `bulk_${Date.now()}`;
    const password = params.password || "BulkUser123!";
    const created: string[] = [];
    for (let i = 0; i < count; i++) {
      const email = `${prefix}_${i}@example.com`;
      const result = await cms.auth.createUser(
        {
          email,
          password,
          username: `${prefix}_${i}`.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 40),
          role,
          isRegistered: true,
          emailVerified: true,
        },
        { tenantId },
      );
      if (result.success) created.push(email);
    }
    return rawResponse({ success: true, created: created.length, emails: created });
  }

  if (action === "create-user") {
    const { email, password, username, role = "editor" } = params;
    if (!email || !password) throw new AppError("Email and password required", 400);

    const result = await cms.auth.createUser(
      {
        email,
        password,
        username: username || email.split("@")[0],
        role,
        isRegistered: true,
        emailVerified: true,
      },
      { tenantId },
    );

    return rawResponse({
      success: result.success,
      message: result.success ? "User created" : (result as any).message,
      data: result.success ? result.data : undefined,
    });
  }

  if (action === "prepare-test-user") {
    const { email, password, username, role = "editor" } = params;
    if (!email || !password) throw new AppError("Email and password required", 400);

    const listResult = await cms.auth.listUsers({ tenantId, limit: 500 });
    const users = listResult.success ? listResult.data?.data : [];
    let user = Array.isArray(users)
      ? users.find((candidate: { email?: string }) => candidate.email === email)
      : undefined;

    if (!user) {
      const createResult = await cms.auth.createUser(
        {
          email,
          password,
          username: username || email.split("@")[0],
          role,
          isRegistered: true,
          emailVerified: true,
        },
        { tenantId },
      );
      if (!createResult.success) {
        throw new AppError((createResult as { message?: string }).message || "Create failed", 400);
      }
      user = createResult.data;
    } else {
      await cms.auth.updateUserAttributes(
        user._id,
        { role, password, blocked: false, failedAttempts: 0, lockoutUntil: null } as any,
        { allowPrivilegeEscalation: true, tenantId },
      );
    }

    return rawResponse({ success: true, user });
  }

  if (action === "emit-event") {
    const { event: eventName, data } = params;
    if (!eventName) throw new AppError("Event name required", 400);

    const payload = { ...data, tenantId: tenantId || "default" };

    // Publish via EventBus (internal listeners + SSE stream).
    const { eventBus } = await import("@utils/event-bus");
    eventBus.emit(eventName, payload);

    return rawResponse({ success: true });
  }

  if (action === "emit-ping") {
    const payload = {
      type: "ping",
      timestamp: new Date().toISOString(),
      tenantId: tenantId || "default",
    };

    // Internal PubSub for service listeners
    const { pubSub } = await import("@src/services/background/pub-sub");
    pubSub.publish("entryUpdated", payload as any);

    return rawResponse({ success: true });
  }

  if (action === "wipe-user" || action === "gdpr-wipe") {
    const { userId } = params;
    if (!userId) throw new AppError("userId required for wipe", 400);

    logger.info(`[GDPR] Performing deep wipe for user: ${userId}`);

    try {
      const { gdprService } = await import("@src/services/security/gdpr-service");
      const ok = await gdprService.eraseUser(userId, tenantId || "global");
      if (!ok) throw new AppError("Wipe failed: user erasure error", 500);

      return rawResponse({ success: true, message: "GDPR wipe completed" });
    } catch (err: any) {
      throw new AppError(`Wipe failed: ${err.message}`, 500);
    }
  }

  if (action === "seed-user-graph") {
    const { userId, email } = params;
    const targetUserId = userId || `gdpr_usr_${Date.now()}`;
    const targetEmail = email || `${targetUserId}@gdpr-benchmark.local`;

    try {
      await cms.db.crud.create(
        "auth_users",
        {
          _id: targetUserId,
          email: targetEmail,
          password: "HashedPassword123!",
          role: "user",
          isRegistered: true,
          emailVerified: true,
          tenantId: tenantId || "global",
        } as any,
        withSystemScope("bootstrap"),
      );

      for (let i = 0; i < 3; i++) {
        await cms.db.crud.create(
          "audit_logs",
          {
            _id: `audit_${targetUserId}_${i}`,
            actorId: targetUserId,
            action: "login",
            tenantId: tenantId || "global",
          } as any,
          withSystemScope("bootstrap"),
        );
      }

      await cms.db.crud.create(
        "auth_sessions",
        {
          _id: `sess_${targetUserId}`,
          user_id: targetUserId,
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          tenantId: tenantId || "global",
        } as any,
        withSystemScope("bootstrap"),
      );

      await cms.db.crud.create(
        "auth_tokens",
        {
          _id: `tok_${targetUserId}`,
          user_id: targetUserId,
          token: `tok_val_${targetUserId}`,
          tenantId: tenantId || "global",
        } as any,
        withSystemScope("bootstrap"),
      );

      return rawResponse({ success: true, userId: targetUserId });
    } catch (err: any) {
      throw new AppError(`seed-user-graph failed: ${err.message}`, 500);
    }
  }

  if (action === "verify-user-erasure") {
    const { userId } = params;
    if (!userId) throw new AppError("userId required", 400);

    const [userRes, auditRes, sessRes, tokenRes] = await Promise.all([
      cms.db.crud.findOne("auth_users", { _id: userId } as any, withSystemScope("bootstrap")),
      cms.db.crud.findMany("audit_logs", { actorId: userId } as any, {
        ...withSystemScope("testing"),
      }),
      cms.db.crud.findMany("auth_sessions", { user_id: userId } as any, {
        ...withSystemScope("testing"),
      }),
      cms.db.crud.findMany("auth_tokens", { user_id: userId } as any, {
        ...withSystemScope("testing"),
      }),
    ]);

    let orphans = 0;
    if (userRes.success && userRes.data) orphans++;
    if (auditRes.success && Array.isArray(auditRes.data)) orphans += auditRes.data.length;
    if (sessRes.success && Array.isArray(sessRes.data)) orphans += sessRes.data.length;
    if (tokenRes.success && Array.isArray(tokenRes.data)) orphans += tokenRes.data.length;

    return rawResponse({
      success: true,
      erased: orphans === 0,
      orphans,
    });
  }

  return undefined;
}
