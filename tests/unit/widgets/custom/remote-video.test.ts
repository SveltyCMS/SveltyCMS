/**
 * @file src/widgets/custom/remote-video/tests/remote-video.test.ts
 * @description Unit tests for the RemoteVideo widget validation logic.
 */

import { describe, it, expect } from "vitest";
import RemoteVideoWidget from "@widgets/custom/remote-video";
import { safeParse } from "valibot";

describe("RemoteVideo Widget - Validation", () => {
  const validVideoData = {
    platform: "youtube",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    videoId: "dQw4w9WgXcQ",
    title: "Never Gonna Give You Up",
    thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  };

  it("should validate correct YouTube video data", () => {
    const field = RemoteVideoWidget({ label: "Video" });
    const schema = field.widget.validationSchema as any;

    const result = safeParse(schema, validVideoData);
    expect(result.success).toBe(true);
  });

  it("should validate correct Vimeo video data", () => {
    const field = RemoteVideoWidget({ label: "Video" });
    const schema = field.widget.validationSchema as any;

    const vimeoData = {
      ...validVideoData,
      platform: "vimeo",
      url: "https://vimeo.com/123456789",
      videoId: "123456789",
    };

    const result = safeParse(schema, vimeoData);
    expect(result.success).toBe(true);
  });

  it("should reject invalid URL patterns (SSRF prevention)", () => {
    const field = RemoteVideoWidget({ label: "Video" });
    const schema = field.widget.validationSchema as any;

    const invalidData = {
      ...validVideoData,
      url: "https://malicious.com/video",
    };
    expect(safeParse(schema, invalidData).success).toBe(false);
  });

  it("should reject missing required fields", () => {
    const field = RemoteVideoWidget({ label: "Video" });
    const schema = field.widget.validationSchema as any;

    const missingTitle = { ...validVideoData };
    delete (missingTitle as any).title;
    expect(safeParse(schema, missingTitle).success).toBe(false);
  });
});

describe("RemoteVideo API - handleUtilityRoutes", () => {
  it("should require authentication", async () => {
    const { handleUtilityRoutes } = await import("@src/routes/api/[...path]/handlers/utility");
    const fakeEvent = {
      request: new Request("http://localhost/api/remote-video", {
        method: "POST",
        body: JSON.stringify({ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }),
      }),
      locals: { user: null },
      url: new URL("http://localhost/api/remote-video"),
    } as any;

    await expect(
      handleUtilityRoutes(fakeEvent, {} as any, "test-tenant" as any, ["remote-video"]),
    ).rejects.toThrow("Unauthorized");
  });

  it("should reject invalid video URLs", async () => {
    const { handleUtilityRoutes } = await import("@src/routes/api/[...path]/handlers/utility");
    const fakeEvent = {
      request: new Request("http://localhost/api/remote-video", {
        method: "POST",
        body: JSON.stringify({ url: "https://example.com/not-a-video" }),
      }),
      locals: { user: { _id: "admin-1", role: "admin" } },
      url: new URL("http://localhost/api/remote-video"),
    } as any;

    await expect(
      handleUtilityRoutes(fakeEvent, {} as any, "test-tenant" as any, ["remote-video"]),
    ).rejects.toThrow("Invalid or unsupported video URL");
  });

  it("should support legacy camelCase route alias remoteVideo", async () => {
    const { handleUtilityRoutes } = await import("@src/routes/api/[...path]/handlers/utility");
    const fakeEvent = {
      request: new Request("http://localhost/api/remoteVideo", {
        method: "POST",
        body: JSON.stringify({ url: "https://example.com/not-a-video" }),
      }),
      locals: { user: { _id: "admin-1", role: "admin" } },
      url: new URL("http://localhost/api/remoteVideo"),
    } as any;

    await expect(
      handleUtilityRoutes(fakeEvent, {} as any, "test-tenant" as any, ["remoteVideo"]),
    ).rejects.toThrow("Invalid or unsupported video URL");
  });
});
