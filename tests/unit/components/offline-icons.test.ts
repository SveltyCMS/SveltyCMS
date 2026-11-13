/**
 * @file tests/unit/components/offline-icons.test.ts
 * @description Pin the bundled setup icon set (SV-031).
 *
 * The wizard used to resolve every icon over the network, so its own chrome
 * needed `api.iconify.design` before it could paint. The offline set must keep
 * the real Iconify prefixes — otherwise the markup names stop resolving — and
 * must register exactly once per runtime.
 */

import { describe, expect, it } from "vitest";
import type { IconifyJSON } from "iconify-icon";
import {
  OFFLINE_ICON_COLLECTIONS,
  registerOfflineIcons,
} from "@components/system/icons/offline-icons";

describe("offline setup icons", () => {
  it("covers the prefixes the wizard markup uses", () => {
    const prefixes = OFFLINE_ICON_COLLECTIONS.map((collection) => collection.prefix).sort();

    expect(prefixes).toEqual(["line-md", "mdi"]);
  });

  it("keeps the wizard's icon names resolvable", () => {
    const mdi = OFFLINE_ICON_COLLECTIONS.find((collection) => collection.prefix === "mdi");
    expect(mdi).toBeTruthy();

    // A sample across the header, step, database and preset chrome.
    for (const name of [
      "arrow-left-bold",
      "arrow-right-bold",
      "check-bold",
      "database",
      "shield-check",
      "translate",
    ]) {
      expect(mdi?.icons?.[name]?.body, `missing mdi:${name}`).toBeTruthy();
    }

    // The alias keeps `mdi:accessibility` working without duplicating the path.
    expect(mdi?.aliases?.accessibility?.parent).toBe("human");
  });

  it("registers each collection exactly once", () => {
    const seen: string[] = [];
    const add = ((collection: IconifyJSON) => {
      seen.push(collection.prefix);
      return true;
    }) as never;

    registerOfflineIcons(add);
    registerOfflineIcons(add);

    expect(seen).toEqual(["mdi", "line-md"]);
  });
});
