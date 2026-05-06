/**
 * @file src/widgets/custom/remote-video/tests/remote-video.test.ts
 * @description Unit tests for the RemoteVideo widget validation logic.
 */

import { describe, it, expect } from "bun:test";
import RemoteVideoWidget from "../index";
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
