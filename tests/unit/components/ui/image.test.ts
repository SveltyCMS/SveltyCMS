/**
 * @vitest-environment node
 * @file tests/unit/components/ui/image.test.ts
 * @description SSR unit tests for responsive Image — srcset, presets, lazy/eager, CLS attrs.
 */
import { describe, it, expect } from "vitest";
import { render } from "svelte/server";
import Image from "@src/components/ui/image.svelte";

/** Minimal asset with full thumbnail ladder for preset filtering */
const fullAsset = {
  url: "https://cdn.example.com/original.jpg",
  alt: "Mountain lake",
  metadata: { width: 1920, height: 1080, altText: "Lake at dawn" },
  thumbnails: {
    thumbnail: { url: "https://cdn.example.com/t-160.webp", width: 160, height: 90 },
    sm: { url: "https://cdn.example.com/sm-320.webp", width: 320, height: 180 },
    md: { url: "https://cdn.example.com/md-640.webp", width: 640, height: 360 },
    lg: { url: "https://cdn.example.com/lg-1280.webp", width: 1280, height: 720 },
  },
};

function renderImg(props: Record<string, unknown> = {}) {
  return render(Image, { props });
}

/** Pull a single attribute value from the first <img ...> tag (SSR HTML). */
function attr(body: string, name: string): string | undefined {
  const img = body.match(/<img\b[^>]*>/i)?.[0] ?? "";
  // srcset can be multiline — allow whitespace/newlines inside quotes
  const re = new RegExp(`${name}="([^"]*)"`, "i");
  const m = img.match(re);
  return m?.[1];
}

describe("Image component (SSR)", () => {
  it("renders without throwing with direct src", () => {
    expect(() => renderImg({ src: "/photo.jpg", alt: "Photo" })).not.toThrow();
  });

  it("uses direct src when no asset is provided", () => {
    const { body } = renderImg({ src: "https://cdn.example.com/direct.jpg", alt: "Direct" });
    expect(attr(body, "src")).toBe("https://cdn.example.com/direct.jpg");
    expect(attr(body, "alt")).toBe("Direct");
  });

  it("prefers asset.url over direct src", () => {
    const { body } = renderImg({
      asset: fullAsset,
      src: "https://cdn.example.com/ignored.jpg",
    });
    expect(attr(body, "src")).toBe(fullAsset.url);
  });

  it("defaults loading=lazy and decoding=async", () => {
    const { body } = renderImg({ src: "/a.jpg", alt: "A" });
    expect(attr(body, "loading")).toBe("lazy");
    expect(attr(body, "decoding")).toBe("async");
  });

  it("uses loading=eager and fetchpriority=high when priority is set", () => {
    const { body } = renderImg({ src: "/a.jpg", alt: "A", priority: true });
    expect(attr(body, "loading")).toBe("eager");
    expect(attr(body, "fetchpriority")).toBe("high");
  });

  it("defaults sizes to 100vw", () => {
    const { body } = renderImg({ src: "/a.jpg", alt: "A" });
    expect(attr(body, "sizes")).toBe("100vw");
  });

  it("accepts custom sizes and class", () => {
    const { body } = renderImg({
      src: "/a.jpg",
      alt: "A",
      sizes: "(max-width: 768px) 100vw, 50vw",
      class: "rounded-lg",
    });
    expect(attr(body, "sizes")).toBe("(max-width: 768px) 100vw, 50vw");
    expect(body).toContain("rounded-lg");
  });

  it("sets width/height from asset metadata for CLS prevention", () => {
    const { body } = renderImg({ asset: fullAsset });
    expect(attr(body, "width")).toBe("1920");
    expect(attr(body, "height")).toBe("1080");
  });

  it("resolves alt from asset.alt when prop omitted", () => {
    const { body } = renderImg({ asset: fullAsset });
    expect(attr(body, "alt")).toBe("Mountain lake");
  });

  it("prefers explicit alt prop over asset.alt", () => {
    const { body } = renderImg({ asset: fullAsset, alt: "Custom caption" });
    expect(attr(body, "alt")).toBe("Custom caption");
  });

  it("falls back to metadata.altText when asset.alt missing", () => {
    const { body } = renderImg({
      asset: {
        url: fullAsset.url,
        metadata: { altText: "From metadata" },
      },
    });
    expect(attr(body, "alt")).toBe("From metadata");
  });

  it("marks decorative images (empty alt) with presentation role", () => {
    const { body } = renderImg({ src: "/deco.jpg", alt: "" });
    expect(attr(body, "alt")).toBe("");
    expect(attr(body, "role")).toBe("presentation");
    expect(attr(body, "aria-hidden")).toBe("true");
  });

  it("does not set presentation role when alt is present", () => {
    const { body } = renderImg({ src: "/a.jpg", alt: "Meaningful" });
    expect(attr(body, "role")).toBeUndefined();
    expect(attr(body, "aria-hidden")).toBeUndefined();
  });

  describe("srcset by preset", () => {
    it("default preset includes sm, md, lg only", () => {
      const { body } = renderImg({ asset: fullAsset, preset: "default" });
      const srcset = attr(body, "srcset") ?? "";
      expect(srcset).toContain("sm-320.webp");
      expect(srcset).toContain("320w");
      expect(srcset).toContain("md-640.webp");
      expect(srcset).toContain("640w");
      expect(srcset).toContain("lg-1280.webp");
      expect(srcset).toContain("1280w");
      expect(srcset).not.toContain("t-160.webp");
    });

    it("thumbnail preset includes only thumbnail key", () => {
      const { body } = renderImg({ asset: fullAsset, preset: "thumbnail" });
      const srcset = attr(body, "srcset") ?? "";
      expect(srcset).toContain("t-160.webp");
      expect(srcset).toContain("160w");
      expect(srcset).not.toContain("sm-320");
      expect(srcset).not.toContain("md-640");
    });

    it("card preset includes thumbnail, sm, md", () => {
      const { body } = renderImg({ asset: fullAsset, preset: "card" });
      const srcset = attr(body, "srcset") ?? "";
      expect(srcset).toContain("t-160.webp");
      expect(srcset).toContain("sm-320.webp");
      expect(srcset).toContain("md-640.webp");
      expect(srcset).not.toContain("lg-1280");
    });

    it("hero preset includes md and lg", () => {
      const { body } = renderImg({ asset: fullAsset, preset: "hero" });
      const srcset = attr(body, "srcset") ?? "";
      expect(srcset).toContain("md-640.webp");
      expect(srcset).toContain("lg-1280.webp");
      expect(srcset).not.toContain("t-160");
      expect(srcset).not.toContain("sm-320");
    });

    it("omits missing thumbnail keys from srcset", () => {
      const { body } = renderImg({
        asset: {
          url: "/only-md.jpg",
          alt: "Partial",
          thumbnails: {
            md: { url: "https://cdn.example.com/only-md.webp", width: 640, height: 360 },
          },
        },
        preset: "default",
      });
      const srcset = attr(body, "srcset") ?? "";
      expect(srcset).toContain("only-md.webp");
      expect(srcset).toContain("640w");
      // sm and lg missing — should not invent URLs
      expect(srcset).not.toContain("sm-");
      expect(srcset).not.toContain("lg-");
    });

    it("emits empty srcset when asset has no thumbnails", () => {
      const { body } = renderImg({
        asset: { url: "/plain.jpg", alt: "Plain" },
        preset: "default",
      });
      const srcset = attr(body, "srcset");
      // empty string attribute or omitted — both acceptable
      expect(!srcset || srcset === "").toBe(true);
    });
  });

  it("forwards arbitrary img attributes via rest props", () => {
    const { body } = renderImg({
      src: "/a.jpg",
      alt: "A",
      "data-testid": "hero-img",
      id: "main-photo",
    });
    expect(body).toContain('data-testid="hero-img"');
    expect(body).toContain('id="main-photo"');
  });
});
