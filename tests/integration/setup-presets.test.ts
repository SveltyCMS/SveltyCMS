import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { writePresetCollectionFiles } from "@src/routes/setup/preset-collections.server";
import { PRESETS } from "@src/routes/setup/presets";

describe("Setup Presets Integration", () => {
  const configDir = path.resolve("config/collections");

  it("writes blog preset files to config/collections with lowercase slugs", async () => {
    const blog = PRESETS.find((p) => p.id === "blog");
    expect(blog?.collections?.length).toBeGreaterThan(0);

    await writePresetCollectionFiles(blog!.collections!, { replaceAll: true });

    for (const collection of blog!.collections!) {
      const targetFile = path.join(configDir, `${collection.name}.ts`);
      expect(fs.existsSync(targetFile)).toBe(true);
      const content = fs.readFileSync(targetFile, "utf-8");
      expect(content).toContain(`_id: "${collection.name}"`);
      expect(content).toContain('import { widgets } from "@src/widgets"');
    }

    // Cleanup generated files from integration test
    for (const collection of blog!.collections!) {
      const targetFile = path.join(configDir, `${collection.name}.ts`);
      if (fs.existsSync(targetFile)) fs.unlinkSync(targetFile);
    }
  });
});
