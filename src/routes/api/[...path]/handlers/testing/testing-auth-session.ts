/**
 * @file src/routes/api/[...path]/handlers/testing/testing-auth-session.ts
 * @description Login/session plus lightweight readiness, SDK-call, and cache probes for tests.
 */

import { AppError } from "@utils/error-handling";
import { contentSystem } from "@src/content/index.server";
import {
  loadCacheServiceModule,
  loadDbModule,
  rawResponse,
  setTestingSessionCookie,
  type TestingContext,
} from "./testing-shared";

export async function handleTestingAuthSessionRoutes(
  ctx: TestingContext,
): Promise<Response | undefined> {
  const { event, cms, tenantId, params, action } = ctx;

  if (action === "login") {
    const { email, password } = params;
    if (!email || !password) throw new AppError("Email and password required", 400);

    const loginResult = await cms.auth.login({ email, password }, { tenantId });
    if (!loginResult.success) {
      return rawResponse({ success: false, message: loginResult.message }, 401);
    }

    const { user, session } = loginResult.data;

    // Dual-write: event.cookies (SvelteKit) + explicit Set-Cookie for Playwright
    const cookie = await setTestingSessionCookie(event, session._id);

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          _id: user._id,
          email: user.email,
          username: user.username,
          role: user.role,
        },
        token: session._id,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "x-test-session-id": session._id,
          "Set-Cookie": cookie.setCookieHeader,
        },
      },
    );
  }

  if (action === "reinitialize") {
    // Trigger system reload (full crawl/reconciliation)
    await contentSystem.initialize(tenantId, { force: true });
    return rawResponse({
      success: true,
      message: "System reinitialized successfully",
    });
  }

  if (action === "ping") {
    return rawResponse({ success: true, message: "Testing API is online" });
  }

  if (action === "health-deep") {
    try {
      const { getDb } = await loadDbModule();
      const db = getDb();
      if (!db) throw new Error("DB adapter null");

      // Lightweight checks
      const checks = await Promise.all([
        db.crud.count("benchmark_authors", {}).catch(() => ({ data: -1 })),
        db.crud.count("benchmark_posts", {}).catch(() => ({ data: -1 })),
      ]);
      return rawResponse({ success: true, checks });
    } catch (err: any) {
      return rawResponse(
        {
          success: false,
          message: err.message,
        },
        500,
      );
    }
  }

  if (action === "benchmark-ready") {
    // Signal that the system is fully warmed and consistent
    return rawResponse({
      success: true,
      ready: true,
      metrics: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      },
    });
  }

  if (action === "sdk-call") {
    const methodPath = params.method;
    const args = Array.isArray(params.args) ? params.args : [];
    if (!methodPath || typeof methodPath !== "string") {
      throw new AppError("method is required for sdk-call", 400);
    }

    const allowedRoots = new Set(["db", "auth", "collections", "system"]);
    const segments = methodPath.split(".").filter(Boolean);
    if (segments.length < 2 || !allowedRoots.has(segments[0])) {
      throw new AppError(`Unsupported sdk-call method: ${methodPath}`, 400);
    }

    let target: any = cms;
    for (const segment of segments.slice(0, -1)) {
      target = target?.[segment];
    }

    const methodName = segments.at(-1) as string;
    const method = target?.[methodName];
    if (typeof method !== "function") {
      throw new AppError(`SDK method not found: ${methodPath}`, 400);
    }

    const result = await method.apply(target, args);
    return rawResponse({ success: true, data: result });
  }

  if (action === "cache-invalidate") {
    const pattern = params.pattern || "*";
    try {
      const { cacheService } = await loadCacheServiceModule();
      if (pattern === "*") {
        await cacheService.invalidateAll();
      } else {
        await cacheService.clearByPattern(pattern);
      }
      return rawResponse({ success: true, pattern });
    } catch (err: any) {
      return rawResponse({ success: false, message: err.message }, 500);
    }
  }

  return undefined;
}
