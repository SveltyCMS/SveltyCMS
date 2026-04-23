/**
 * @file tests\unit\utils\utils.test.ts
 * @description Tests for the general utility functions.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  uniqueItems,
  getGuiFields,
  parse,
  getFieldName,
  extractData,
  deepCopy,
  get_elements_by_id,
  meta_data,
  toStringHelper,
  debounce,
  asAny,
  SIZES,
} from "@src/utils/utils";

describe("General Utilities (utils.ts)", () => {
  describe("uniqueItems", () => {
    it("should return an array of unique items based on a key", () => {
      const items = [
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
        { id: 1, name: "Alice Duplicate" }, // Same id
      ];
      const result = uniqueItems(items, "id");
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("Alice Duplicate"); // Map stores the last value for the key
      expect(result[1].name).toBe("Bob");
    });
  });

  describe("getGuiFields", () => {
    it("should map field parameters to GUI fields based on schema", () => {
      const fieldParams = {
        label: "My Label",
        required: true,
        ignored: "not-in-schema",
      };
      const guiSchema = {
        label: { required: true, widget: "text" },
        required: { required: false, widget: "checkbox" },
      };

      const result = getGuiFields(fieldParams, guiSchema);
      expect(result).toHaveProperty("label", "My Label");
      expect(result).toHaveProperty("required", true);
      expect(result).not.toHaveProperty("ignored");
    });

    it("should deep copy arrays", () => {
      const fieldParams = { tags: ["a", "b"] };
      const guiSchema = { tags: { required: false, widget: "tags" } };
      const result = getGuiFields(fieldParams, guiSchema);
      expect(result.tags).toEqual(["a", "b"]);
      expect(result.tags).not.toBe(fieldParams.tags); // It should be a copy
    });
  });

  describe("parse", () => {
    it("should parse stringified JSON in object properties", () => {
      const input = {
        name: "Test",
        nested: '{"count": 42}',
        arr: ["plain-string"],
        primitive: 123,
      };
      const result = parse<any>(input);
      expect(result.name).toBe("Test");
      expect(result.nested.count).toBe(42);
      expect(result.arr[0]).toBe("plain-string");
      expect(result.primitive).toBe(123);
    });

    it("should handle null and primitives correctly", () => {
      expect(parse(null)).toBeNull();
      expect(parse("test")).toBe("test");
      expect(parse(123)).toBe(123);
    });
  });

  describe("getFieldName", () => {
    it("should use db_fieldName if available", () => {
      const field = { label: "Test", db_fieldName: "custom_db_field" };
      expect(getFieldName(field as any)).toBe("custom_db_field");
    });

    it("should fall back to special mappings if applicable", () => {
      expect(getFieldName({ label: "First Name" } as any)).toBe("first_name");
      expect(getFieldName({ label: "Last Name" } as any)).toBe("last_name");
    });

    it("should generate a sanitized field name from label", () => {
      expect(getFieldName({ label: "My Special Field!" } as any)).toBe("my_special_field");
    });

    it("should return the raw name if rawName is true", () => {
      expect(getFieldName({ label: "My Special Field!" } as any, true)).toBe("My Special Field!");
    });

    it("should handle unknown fields", () => {
      expect(getFieldName({} as any)).toBe("unknown_field");
    });
  });

  describe("extractData", () => {
    it("should extract data using field callbacks", async () => {
      const fields = {
        name: { callback: async () => "Async Name" },
        age: { default: 25 },
      };
      const result = await extractData(fields as any);
      expect(result.name).toBe("Async Name");
      expect(result.age).toBe(25);
    });
  });

  describe("deepCopy", () => {
    it("should deeply copy an object", () => {
      const original = {
        a: 1,
        b: { c: 2 },
        d: [3, 4],
        e: new Date("2025-01-01"),
      };
      const copy = deepCopy(original);

      expect(copy).toEqual(original);
      expect(copy).not.toBe(original);
      expect(copy.b).not.toBe(original.b);
      expect(copy.d).not.toBe(original.d);
      expect(copy.e).not.toBe(original.e);
      expect(copy.e.getTime()).toBe(original.e.getTime());
    });

    it("should handle primitives and null", () => {
      expect(deepCopy(null)).toBeNull();
      expect(deepCopy(123)).toBe(123);
      expect(deepCopy("string")).toBe("string");
    });
  });

  describe("get_elements_by_id", () => {
    it("should store and fetch elements by ID", async () => {
      const mockCallback = vi.fn();
      const mockDbAdapter = {
        get: vi.fn().mockResolvedValue("Fetched Data"),
      };

      get_elements_by_id.store = {}; // reset
      get_elements_by_id.add("users", "user1", mockCallback);

      expect(get_elements_by_id.store["users"]).toHaveLength(1);

      await get_elements_by_id.getAll(mockDbAdapter as any);

      expect(mockDbAdapter.get).toHaveBeenCalledWith("user1");
      expect(mockCallback).toHaveBeenCalledWith("Fetched Data");
    });
  });

  describe("meta_data", () => {
    beforeEach(() => {
      meta_data.clear();
    });

    it("should add, get, and clear meta data", () => {
      expect(meta_data.is_empty()).toBe(true);

      meta_data.add("media_images_remove", ["image1.jpg"]);
      expect(meta_data.is_empty()).toBe(false);
      expect(meta_data.get().media_images_remove).toEqual(["image1.jpg"]);

      meta_data.clear();
      expect(meta_data.is_empty()).toBe(true);
    });
  });

  describe("toStringHelper", () => {
    it("should join array elements into a string", () => {
      expect(toStringHelper({ data: [1, "two", true] })).toBe("1, two, true");
    });

    it("should return empty string if data is not an array", () => {
      expect(toStringHelper({ data: "not-an-array" as any })).toBe("");
    });
  });

  describe("debounce", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should debounce function calls", () => {
      const mockFn = vi.fn();
      const schedule = debounce(100);

      schedule(mockFn);
      schedule(mockFn);
      schedule(mockFn);

      expect(mockFn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(150);

      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it("should support immediate execution", () => {
      const mockFn = vi.fn();
      const schedule = debounce(100, true);

      schedule(mockFn); // Executes immediately
      expect(mockFn).toHaveBeenCalledTimes(1);

      schedule(mockFn); // Ignored until timeout resets
      expect(mockFn).toHaveBeenCalledTimes(1);

      // Note: the implementation of `immediate` in `utils.ts` only executes once ever
      // unless we create a new debounce instance.
    });

    it("should support debounce.create for traditional debouncing with arguments", () => {
      const mockFn = vi.fn();
      const debouncedFn = debounce.create(mockFn, 100);

      debouncedFn("arg1", "arg2");
      debouncedFn("arg3", "arg4");

      vi.advanceTimersByTime(150);

      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(mockFn).toHaveBeenCalledWith("arg3", "arg4");
    });
  });

  describe("asAny", () => {
    it("should assert type as any", () => {
      expect(asAny(123)).toBe(123);
    });
  });

  describe("SIZES", () => {
    it("should have default image sizes", () => {
      expect(SIZES).toHaveProperty("original", 0);
      expect(SIZES).toHaveProperty("thumbnail", 200);
    });
  });
});
