/**
 * @file tests/unit/widgets/custom-widget-sveltycms.test.ts
 * @description CMS-compatibility declaration contract for every shipped custom widget.
 *
 * `WidgetStore` warns when a `custom` tier widget omits `sveltycms`, and
 * `validateWidgetImport` refuses a declared range the running host does not
 * satisfy. This suite asserts per widget (not by count) that:
 * - the module declares a non-empty `sveltycms` range,
 * - the running CMS version satisfies that range,
 * - the `custom` tier import check stays warning-free,
 * - every folder under `src/widgets/custom/` is covered by the table below.
 */

import AIEnrichmentWidget from "@widgets/custom/ai-enrichment";
import AddressWidget from "@widgets/custom/address";
import BlockBuilderWidget from "@widgets/custom/block-builder";
import ColorPickerWidget from "@widgets/custom/color-picker";
import CurrencyWidget from "@widgets/custom/currency";
import DateRangeWidget from "@widgets/custom/date-range";
import GeolocationWidget from "@widgets/custom/geolocation";
import JsonEditorWidget from "@widgets/custom/json-editor";
import MarkdownWidget from "@widgets/custom/markdown";
import MegaMenuWidget from "@widgets/custom/mega-menu";
import PhoneNumberWidget from "@widgets/custom/phone-number";
import PriceWidget from "@widgets/custom/price";
import RatingWidget from "@widgets/custom/rating";
import RemoteVideoWidget from "@widgets/custom/remote-video";
import RepeaterWidget from "@widgets/custom/repeater";
import SeoWidget from "@widgets/custom/seo";
import TagsWidget from "@widgets/custom/tags";
import {
  getCmsVersion,
  satisfiesCmsRange,
  validateWidgetImport,
} from "@src/widgets/widget-compatibility";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { WidgetFactory } from "@widgets/types";

interface ShippedCustomWidget {
  factory: WidgetFactory;
  folder: string;
  name: string;
}

const SHIPPED_CUSTOM_WIDGETS: ShippedCustomWidget[] = [
  { folder: "address", name: "Address", factory: AddressWidget },
  { folder: "ai-enrichment", name: "AIEnrichment", factory: AIEnrichmentWidget },
  { folder: "block-builder", name: "BlockBuilder", factory: BlockBuilderWidget },
  { folder: "color-picker", name: "ColorPicker", factory: ColorPickerWidget },
  { folder: "currency", name: "Currency", factory: CurrencyWidget },
  { folder: "date-range", name: "DateRange", factory: DateRangeWidget },
  { folder: "geolocation", name: "Geolocation", factory: GeolocationWidget },
  { folder: "json-editor", name: "JsonEditor", factory: JsonEditorWidget },
  { folder: "markdown", name: "Markdown", factory: MarkdownWidget },
  { folder: "mega-menu", name: "MegaMenu", factory: MegaMenuWidget },
  { folder: "phone-number", name: "PhoneNumber", factory: PhoneNumberWidget },
  { folder: "price", name: "Price", factory: PriceWidget },
  { folder: "rating", name: "Rating", factory: RatingWidget },
  { folder: "remote-video", name: "RemoteVideo", factory: RemoteVideoWidget },
  { folder: "repeater", name: "Repeater", factory: RepeaterWidget },
  { folder: "seo", name: "SEO", factory: SeoWidget },
  { folder: "tags", name: "Tags", factory: TagsWidget },
];

const cmsVersion = getCmsVersion();

describe("shipped custom widgets declare sveltycms", () => {
  it.each(SHIPPED_CUSTOM_WIDGETS)(
    "$folder ($name) declares a range the host satisfies",
    ({ factory, name }) => {
      expect(factory.Name).toBe(name);

      const range = factory.sveltycms;
      expect(typeof range, `${name} must declare sveltycms`).toBe("string");
      expect((range ?? "").trim(), `${name} must declare a non-empty sveltycms range`).not.toBe("");
      expect(
        satisfiesCmsRange(cmsVersion, range ?? ""),
        `${name} requires "${range}" but the running CMS is ${cmsVersion}`,
      ).toBe(true);

      const compat = validateWidgetImport(
        {
          Name: factory.Name,
          version: factory.version,
          sveltycms: factory.sveltycms,
          validationSchema: true,
        },
        { tier: "custom", cmsVersion },
      );
      expect(compat.ok).toBe(true);
      expect(compat.warnings.filter((w) => w.includes("sveltycms"))).toEqual([]);
    },
  );

  it("covers every folder under src/widgets/custom", () => {
    const customDir = fileURLToPath(new URL("../../../src/widgets/custom", import.meta.url));
    const onDisk = readdirSync(customDir, { withFileTypes: true })
      .filter(
        (entry) => entry.isDirectory() && existsSync(path.join(customDir, entry.name, "index.ts")),
      )
      .map((entry) => entry.name)
      .sort();

    expect(SHIPPED_CUSTOM_WIDGETS.map((widget) => widget.folder).sort()).toEqual(onDisk);
  });
});
