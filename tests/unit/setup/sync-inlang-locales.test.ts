/**
 * @file tests/unit/setup/sync-inlang-locales.test.ts
 * @description Writes locales into a temp inlang project without running CLI.
 */
import { describe, expect, it } from "vitest";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { syncInlangSystemLocales } from "@src/routes/setup/sync-inlang-locales.server";
import { BUNDLED_SYSTEM_LOCALES } from "@utils/system-locale";

describe("syncInlangSystemLocales", () => {
  it("appends ISO locales to settings.json and clones en.json", async () => {
    const cwd = join(tmpdir(), `svelty-inlang-${Date.now()}`);
    await mkdir(join(cwd, "project.inlang"), { recursive: true });
    await mkdir(join(cwd, "src/messages"), { recursive: true });
    await writeFile(
      join(cwd, "project.inlang/settings.json"),
      JSON.stringify({
        baseLocale: "en",
        locales: ["en", "de"],
        sourceLanguageTag: "en",
        languageTags: ["en", "de"],
      }),
      "utf8",
    );
    await writeFile(
      join(cwd, "src/messages/en.json"),
      JSON.stringify({
        $schema: "https://inlang.com/schema/inlang-message-format",
        hello: "Hello",
      }),
      "utf8",
    );
    await writeFile(
      join(cwd, "src/messages/de.json"),
      JSON.stringify({
        $schema: "https://inlang.com/schema/inlang-message-format",
        hello: "Hallo",
      }),
      "utf8",
    );

    // Bundled catalogs are merged in first, so a *bundled* code is never "added".
    // Pick an ISO code that is deliberately not compiled to exercise the append path.
    const bundled: readonly string[] = BUNDLED_SYSTEM_LOCALES;
    const unbundled = ["ja", "sv", "pt"].find((code) => !bundled.includes(code))!;
    expect(unbundled).toBeTruthy();

    const result = await syncInlangSystemLocales(["en", "de", unbundled], {
      cwd,
      translate: false,
      compile: false,
    });

    const expectedLocales = [...bundled, unbundled];
    expect(result.skipped).toBe(false);
    expect(result.added).toEqual([unbundled]);
    expect(result.locales).toEqual(expectedLocales);

    const settings = JSON.parse(await readFile(join(cwd, "project.inlang/settings.json"), "utf8"));
    expect(settings.locales).toEqual(expectedLocales);
    expect(settings.languageTags).toEqual(expectedLocales);

    const cloned = JSON.parse(await readFile(join(cwd, `src/messages/${unbundled}.json`), "utf8"));
    expect(cloned.hello).toBe("Hello");
  });
});
