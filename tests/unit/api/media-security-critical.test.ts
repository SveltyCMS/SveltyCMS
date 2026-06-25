/**
 * @file tests/unit/api/media-security-critical.test.ts
 * @description Unit tests for critical media security vulnerabilities.
 */

import { describe, it, expect, vi } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";

// Import raw dispatcher handler
import { POST as dispatcherPOST } from "@src/routes/api/[...path]/+server";

describe("Media Security Critical Unit Tests", () => {
  const createMockEvent = (
    method: string,
    path: string,
    formDataEntries: any = {},
    user: any = { _id: "u1" },
  ) => {
    const formData = {
      get: (key: string) => formDataEntries[key],
      getAll: (key: string) => formDataEntries[key] || [],
      has: (key: string) => key in formDataEntries,
    };

    const adapter = {
      media: {
        files: {
          getByFolder: vi.fn().mockResolvedValue({ success: true, data: [] }),
          getByHash: vi.fn().mockResolvedValue({ success: true, data: null }),
          upload: vi.fn().mockResolvedValue({
            success: true,
            data: { _id: "m1", path: "test.jpg" },
          }),
        },
        updateMedia: vi.fn().mockResolvedValue({ success: true }),
        saveMedia: vi.fn().mockResolvedValue({ success: true, _id: "m1" }),
        deleteMedia: vi.fn().mockResolvedValue({ success: true }),
        batchProcessImages: vi.fn().mockResolvedValue({ success: true, data: [] }),
      },
      crud: {
        findOne: vi.fn().mockResolvedValue({ success: true, data: {} }),
        findMany: vi.fn().mockResolvedValue({ success: true, data: [] }),
        insert: vi.fn().mockResolvedValue({ success: true, data: { _id: "new" } }),
      },
      auth: { getUserById: vi.fn(), validateSession: vi.fn() },
      system: {
        preferences: { getMany: vi.fn().mockResolvedValue({}) },
        widgets: {
          getActiveWidgets: vi.fn().mockResolvedValue({ success: true, data: [] }),
        },
      },
      collection: {
        getModel: vi.fn().mockResolvedValue({ name: "test", fields: [] }),
      },
    };

    return {
      url: new URL(`http://localhost/api/${path}`),
      params: { path },
      request: {
        method,
        formData: vi.fn().mockResolvedValue(formData),
        headers: new Headers({ "content-type": "multipart/form-data" }),
      },
      locals: {
        __testBypass: true,
        user: { ...user, role: "admin", isAdmin: true },
        tenantId: "t1",
        roles: [
          {
            _id: "admin",
            name: "Administrator",
            isAdmin: true,
            permissions: [],
          },
        ],
        dbAdapter: adapter,
      },
      cookies: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
    } as unknown as RequestEvent;
  };

  it("should process media save correctly", async () => {
    const mockFormData = {
      processType: "save",
      files: [new File(["test content"], "test.jpg", { type: "image/jpeg" })],
    };

    const event = createMockEvent("POST", "media/process", mockFormData);
    const response = await dispatcherPOST(event);
    const result = await response!.json();

    if (!result.success) {
      console.error("Critical test failed. Result:", JSON.stringify(result, null, 2));
    }

    expect(result.success).toBe(true);
  });
});
