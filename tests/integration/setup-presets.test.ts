import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { writePresetCollectionFiles } from "@src/routes/setup/preset-collections.server";
import { PRESETS } from "@src/routes/setup/presets";

describe("Setup Presets Integration", () => {
  const tenantId = "test-setup-presets";
  const configDir = path.resolve("config", tenantId, "collections");
  const compiledDir = path.resolve(".compiledCollections", tenantId);
  const liveCollectionsDir = path.resolve("config", "collections");

  afterAll(() => {
    fs.rmSync(path.resolve("config", tenantId), { recursive: true, force: true });
    fs.rmSync(compiledDir, { recursive: true, force: true });
  });

  function liveRootSnapshot(): string[] {
    if (!fs.existsSync(liveCollectionsDir)) return [];
    return fs.readdirSync(liveCollectionsDir).sort();
  }

  it("writes blog preset files to an isolated tenant path with lowercase slugs", async () => {
    const blog = PRESETS.find((p) => p.id === "blog");
    expect(blog?.collections?.length).toBeGreaterThan(0);

    const beforeLiveRoot = liveRootSnapshot();
    await writePresetCollectionFiles(blog!.collections!, { tenantId });

    for (const collection of blog!.collections!) {
      const targetFile = path.join(configDir, `${collection.name}.ts`);
      expect(fs.existsSync(targetFile)).toBe(true);
      const content = fs.readFileSync(targetFile, "utf-8");
      expect(content).toContain(`_id: "${collection.name}"`);
      expect(content).toContain('import { widgets } from "@src/widgets"');

      const compiledFile = path.join(compiledDir, `${collection.name}.js`);
      expect(fs.existsSync(compiledFile)).toBe(true);
    }

    expect(liveRootSnapshot()).toEqual(beforeLiveRoot);
  });

  it("writes website preset files with livePreview and editable-website plugin", async () => {
    const website = PRESETS.find((p) => p.id === "website");
    expect(website?.collections?.length).toBeGreaterThan(0);
    expect(website?.recommended).toBe(true);

    const beforeLiveRoot = liveRootSnapshot();
    await writePresetCollectionFiles(website!.collections!, { tenantId });

    const pages = website!.collections!.find((c) => c.name === "pages");
    expect(pages?.livePreview).toBe("/{slug}?lang={lang}");
    expect(pages?.plugins).toContain("editable-website");

    const targetFile = path.join(configDir, "pages.ts");
    expect(fs.existsSync(targetFile)).toBe(true);
    const content = fs.readFileSync(targetFile, "utf-8");
    expect(content).toContain('livePreview: "/{slug}?lang={lang}"');
    expect(content).toContain('plugins: ["editable-website"]');

    expect(liveRootSnapshot()).toEqual(beforeLiveRoot);
  });
});
