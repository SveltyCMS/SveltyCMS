/**
 * @file tests/bun/utils/errorHandling.test.ts
 * @description Tests for error handling utilities
 *
 * Tests:
 * - AppError class
 * - Type guards
 * - Error messages
 * - Wrap error
 * - Envelope content-length (compression size-gate contract)
 * - Integration
 */

import { createMockEvent } from "../hooks/test-utils";

let APP_ERROR: any;
let getErrorMessage: any;
let isAppError: any;
let isHttpError: any;
let wrapError: any;
let handleApiError: typeof import("@src/utils/error-handling").handleApiError;

beforeAll(async () => {
  const mod = await import("@src/utils/error-handling");
  APP_ERROR = mod.AppError;
  getErrorMessage = mod.getErrorMessage;
  isAppError = mod.isAppError;
  isHttpError = mod.isHttpError;
  wrapError = mod.wrapError;
  handleApiError = mod.handleApiError;
});

describe("Error Handling - AppError Class", () => {
  it("should create AppError with message and status", () => {
    const error = new APP_ERROR("Test error", 404);

    expect(error.message).toBe("Test error");
    expect(error.status).toBe(404);
    expect(error instanceof Error).toBe(true);
    expect(error instanceof APP_ERROR).toBe(true);
  });

  it("should create AppError with original error", () => {
    const originalError = new Error("Original error");
    const appError = new APP_ERROR("Wrapped error", 500, originalError);

    expect(appError.message).toBe("Wrapped error");
    expect(appError.status).toBe(500);
    expect(appError.originalError).toBe(originalError);
  });

  it("should create AppError with details", () => {
    const error = new APP_ERROR("Error with details", 400, undefined, {
      field: "email",
      reason: "invalid format",
    });

    expect(error.message).toBe("Error with details");
    expect(error.status).toBe(400);
    expect(error.details).toEqual({ field: "email", reason: "invalid format" });
  });

  it("should have proper error name", () => {
    const error = new APP_ERROR("Test", 500);
    expect(error.name).toBe("AppError");
  });
});

describe("Error Handling - Type Guards", () => {
  it("should identify AppError instances", () => {
    const appError = new APP_ERROR("Test", 500);
    const regularError = new Error("Test");

    expect(isAppError(appError)).toBe(true);
    expect(isAppError(regularError)).toBe(false);
    expect(isAppError("string")).toBe(false);
    expect(isAppError(null)).toBe(false);
    expect(isAppError(undefined)).toBe(false);
  });

  it("should identify HttpError-like objects", () => {
    // Production isHttpError requires status (4xx/5xx) AND body (cross-bundle safe).
    const httpError = {
      status: 404,
      body: { message: "Not found" },
    };

    expect(isHttpError(httpError)).toBe(true);
    expect(isHttpError({ status: 500 })).toBe(false); // missing body
    expect(isHttpError({ status: 500, body: {} })).toBe(true);
    expect(isHttpError({ body: {} })).toBe(false);
    expect(isHttpError(new Error("test"))).toBe(false);
  });
});

describe("Error Handling - Error Messages", () => {
  it("should extract message from Error", () => {
    const error = new Error("Standard error");
    expect(getErrorMessage(error)).toBe("Standard error");
  });

  it("should extract message from AppError", () => {
    const error = new APP_ERROR("App error", 500);
    expect(getErrorMessage(error)).toBe("App error");
  });

  it("should extract message from HttpError", () => {
    const error = {
      status: 404,
      body: { message: "Not found" },
    };
    expect(getErrorMessage(error)).toBe("Not found");
  });

  it("should handle string errors", () => {
    expect(getErrorMessage("String error")).toBe("String error");
  });

  it("should handle objects with message property", () => {
    const error = { message: "Object error" };
    expect(getErrorMessage(error)).toBe("Object error");
  });

  it("should handle unknown error types", () => {
    // Production: falsy errors → ""; primitives via String(); empty object special-cased
    expect(getErrorMessage(null)).toBe("");
    expect(getErrorMessage(123)).toBe("123");
    expect(getErrorMessage(true)).toBe("true");
    expect(getErrorMessage({})).toBe("[object Object]");
  });

  it("should stringify objects without message", () => {
    const error = { code: "ERR_001", details: "Info" };
    const message = getErrorMessage(error);
    expect(message).toContain("ERR_001");
  });
});

describe("Error Handling - Envelope content-length", () => {
  /**
   * 🚀 Regression guard: `handleCompression` size-gates on `content-length`.
   * An envelope without it is treated as "unknown size" → it skips the <1 KiB
   * skip-gate AND the buffered tier and is negotiated into the streaming tier
   * (a fresh zstd stream per request for zstd-advertising clients). API error
   * envelopes are ~64 B, so that was a measured ~0.45 ms of pure waste on
   * every reject (see src/utils/error-handling.ts staticJsonEnvelope).
   */
  const byteLength = (body: string) => new TextEncoder().encode(body).byteLength;

  const expectDeclaredLength = async (error: unknown, status: number) => {
    const event = createMockEvent("/api/user/me", { method: "GET", user: null });
    const res = handleApiError(error, event);
    const body = await res.clone().text();

    expect(res.status).toBe(status);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("content-length")).toBe(String(byteLength(body)));
    return body;
  };

  it("declares an exact length on the 401 envelope", async () => {
    const body = await expectDeclaredLength(
      new APP_ERROR("Unauthorized", 401, "UNAUTHORIZED"),
      401,
    );
    expect(JSON.parse(body)).toMatchObject({ success: false, code: "UNAUTHORIZED" });
  });

  it("declares an exact length on the 403 envelope", async () => {
    const body = await expectDeclaredLength(new APP_ERROR("Forbidden", 403, "FORBIDDEN"), 403);
    expect(JSON.parse(body)).toMatchObject({ success: false, code: "FORBIDDEN" });
  });

  it("declares an exact length on the generic error envelope", async () => {
    const body = await expectDeclaredLength(
      new APP_ERROR("Collection not found", 404, "NOT_FOUND"),
      404,
    );
    expect(JSON.parse(body)).toMatchObject({ success: false, code: "NOT_FOUND" });
  });
});

describe("Error Handling - Wrap Error", () => {
  it("should wrap Error in AppError", () => {
    const originalError = new Error("Original");
    const wrapped = wrapError(originalError);

    expect(isAppError(wrapped)).toBe(true);
    expect(wrapped.status).toBe(500);
    expect(wrapped.originalError).toBe(originalError);
  });

  it("should preserve AppError", () => {
    const appError = new APP_ERROR("App error", 400);
    const wrapped = wrapError(appError);

    expect(wrapped).toBe(appError);
    expect(wrapped.status).toBe(400);
  });

  it("should wrap HttpError", () => {
    const httpError = {
      status: 404,
      body: { message: "Not found" },
    };
    const wrapped = wrapError(httpError);

    expect(isAppError(wrapped)).toBe(true);
    expect(wrapped.status).toBe(404);
    expect(wrapped.message).toBe("Not found");
  });

  it("should use custom default message", () => {
    const error = new Error("Original");
    const wrapped = wrapError(error, "Custom default");

    expect(wrapped.message).toBe("Original");
  });

  it("should use default message for unknown errors", () => {
    // null → getErrorMessage "" → falls back to provided default
    const wrapped = wrapError(null, "Custom default");
    expect(wrapped.message).toBe("Custom default");
    expect(wrapped.status).toBe(500);

    const wrapped2 = wrapError({}, "Custom default");
    expect(wrapped2.message).toBe("[object Object]");
  });
  it("should use custom default status", () => {
    const error = new Error("Test");
    const wrapped = wrapError(error, "Default message", 418);

    expect(wrapped.status).toBe(418);
  });

  it("should wrap string errors", () => {
    const wrapped = wrapError("String error");

    expect(isAppError(wrapped)).toBe(true);
    expect(wrapped.message).toBe("String error");
    expect(wrapped.status).toBe(500);
  });
});

describe("Error Handling - Integration", () => {
  it("should handle error chain", () => {
    const rootError = new Error("Root cause");
    const wrappedOnce = wrapError(rootError, "First wrap", 400);
    const wrappedTwice = wrapError(wrappedOnce, "Second wrap", 500);

    expect(wrappedTwice.status).toBe(400); // Preserves original AppError
    expect(wrappedTwice.originalError).toBe(rootError);
  });

  it("should extract messages from error chain", () => {
    const rootError = new Error("Root");
    const wrapped = new APP_ERROR("Wrapped", 500, rootError);

    expect(getErrorMessage(wrapped)).toBe("Wrapped");
    expect(getErrorMessage(wrapped.originalError)).toBe("Root");
  });
});
