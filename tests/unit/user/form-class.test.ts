/**
 * @file tests/unit/user/form-class.test.ts
 * @description White-box unit tests for the Form<T> class (src/utils/form.svelte.ts).
 *
 * Covers: construction, validate() with and without schema, reset(),
 * submit() with mocked fetch (success, HTTP error, network error),
 * and reactive state transitions (submitting, errors, message).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { object, string, minLength, pipe } from "valibot";
import { Form } from "@src/utils/form.svelte";

// A simple Valibot schema for testing
const testSchema = object({
  name: pipe(string(), minLength(3, "Name must be at least 3 characters")),
  email: string(),
});

interface TestData {
  name: string;
  email: string;
  [key: string]: unknown;
}

describe("Form<T> class", () => {
  let form: Form<TestData>;

  beforeEach(() => {
    form = new Form<TestData>({ name: "John", email: "john@example.com" }, testSchema);
  });

  // ---------------------------------------------------------------------------
  // CONSTRUCTION
  // ---------------------------------------------------------------------------

  it("should initialize with provided data", () => {
    const f = new Form({ name: "Alice", email: "a@b.com" });
    expect(f.data.name).toBe("Alice");
    expect(f.data.email).toBe("a@b.com");
  });

  it("should initialize errors as empty object", () => {
    expect(form.errors).toEqual({});
  });

  it("should initialize submitting as false", () => {
    expect(form.submitting).toBe(false);
  });

  it("should initialize message as undefined", () => {
    expect(form.message).toBeUndefined();
  });

  it("should accept construction without a schema", () => {
    const f = new Form({ name: "Test" });
    expect(f.validate()).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // VALIDATE
  // ---------------------------------------------------------------------------

  it("should return true for valid data with a schema", () => {
    expect(form.validate()).toBe(true);
  });

  it("should return true when no schema is provided", () => {
    const f = new Form({ foo: "bar" });
    expect(f.validate()).toBe(true);
  });

  it("should return false and populate errors for invalid data", () => {
    form.data.name = "ab"; // too short (< 3)
    const result = form.validate();
    expect(result).toBe(false);
    expect(form.errors).not.toEqual({});
    expect(Object.keys(form.errors).length).toBeGreaterThan(0);
  });

  it("should clear errors on re-validation with valid data", () => {
    form.data.name = "ab";
    form.validate();
    expect(Object.keys(form.errors).length).toBeGreaterThan(0);

    form.data.name = "validName";
    const result = form.validate();
    expect(result).toBe(true);
    expect(form.errors).toEqual({});
  });

  it("should clear message on validate()", () => {
    form.message = "previous error";
    form.validate();
    expect(form.message).toBeUndefined();
  });

  it("should validate edge case: empty string in required field", () => {
    form.data.name = "";
    const result = form.validate();
    expect(result).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // RESET
  // ---------------------------------------------------------------------------

  it("should reset errors, message, and submitting", () => {
    form.errors = { name: ["error"] };
    form.message = "some error";
    form.submitting = true;

    form.reset();

    expect(form.errors).toEqual({});
    expect(form.message).toBeUndefined();
    expect(form.submitting).toBe(false);
  });

  it("should update data when new data is provided", () => {
    form.reset({ name: "Reset", email: "reset@example.com" });
    expect(form.data.name).toBe("Reset");
    expect(form.data.email).toBe("reset@example.com");
  });

  it("should keep existing data when no new data is provided", () => {
    const originalName = form.data.name;
    form.reset();
    expect(form.data.name).toBe(originalName);
  });

  // ---------------------------------------------------------------------------
  // SUBMIT — SUCCESS
  // ---------------------------------------------------------------------------

  it("should submit successfully and return success response", async () => {
    const mockResponse = { success: true, message: "Updated", data: { id: "123" } };
    globalThis.fetch = (vi.fn() as any).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await form.submit("/api/user/update");

    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockResponse);
    expect(form.submitting).toBe(false);
    expect(form.message).toBe("Updated");

    // Verify fetch was called correctly
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/user/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form.data),
    });
  });

  // ---------------------------------------------------------------------------
  // SUBMIT — VALIDATION FAILURE
  // ---------------------------------------------------------------------------

  it("should return validation errors without calling fetch", async () => {
    form.data.name = "ab"; // invalid
    const fetchSpy = vi.fn() as any;
    globalThis.fetch = fetchSpy;

    const result = await form.submit("/api/user/update");

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(Object.keys(result.errors!).length).toBeGreaterThan(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(form.submitting).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // SUBMIT — HTTP ERROR
  // ---------------------------------------------------------------------------

  it("should handle HTTP error response", async () => {
    globalThis.fetch = (vi.fn() as any).mockResolvedValue({
      ok: false,
      json: async () => ({
        message: "Bad request",
        errors: { email: ["Already taken"] },
      }),
    });

    const result = await form.submit("/api/user/update");

    expect(result.success).toBe(false);
    expect(form.errors).toEqual({ email: ["Already taken"] });
    expect(form.message).toBe("Bad request");
    expect(form.submitting).toBe(false);
  });

  it("should handle HTTP error with default message when none provided", async () => {
    globalThis.fetch = (vi.fn() as any).mockResolvedValue({
      ok: false,
      json: async () => ({ errors: {} }),
    });

    const result = await form.submit("/api/user/update");

    expect(result.success).toBe(false);
    expect(form.message).toBe("An error occurred");
  });

  // ---------------------------------------------------------------------------
  // SUBMIT — NETWORK ERROR
  // ---------------------------------------------------------------------------

  it("should handle network error (fetch throws)", async () => {
    globalThis.fetch = (vi.fn() as any).mockRejectedValue(new Error("Network failure"));

    const result = await form.submit("/api/user/update");

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(form.message).toBe("Network failure");
    expect(form.submitting).toBe(false);
  });

  it("should handle non-Error throw with fallback message", async () => {
    globalThis.fetch = (vi.fn() as any).mockRejectedValue("string error");

    const result = await form.submit("/api/user/update");

    expect(result.success).toBe(false);
    expect(form.message).toBe("Network error");
  });

  // ---------------------------------------------------------------------------
  // SUBMIT — CUSTOM OPTIONS
  // ---------------------------------------------------------------------------

  it("should merge custom headers with default Content-Type header", async () => {
    const mockResponse = { success: true };
    globalThis.fetch = (vi.fn() as any).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    await form.submit("/api/user/update", {
      headers: { "X-Custom": "value" },
    });

    const callArgs = (globalThis.fetch as any).mock.calls[0][1];
    // Note: custom headers are merged on top of the default Content-Type
    expect(callArgs.headers).toEqual({
      "Content-Type": "application/json",
      "X-Custom": "value",
    });
  });

  // ---------------------------------------------------------------------------
  // SUBMIT — SUBMITTING STATE
  // ---------------------------------------------------------------------------

  it("should set submitting=true during submission and false after", async () => {
    globalThis.fetch = (vi.fn() as any).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    const submitPromise = form.submit("/api/test");
    expect(form.submitting).toBe(true);
    await submitPromise;
    expect(form.submitting).toBe(false);
  });

  it("should clear errors before successful submit", async () => {
    form.errors = { name: ["old error"] };
    globalThis.fetch = (vi.fn() as any).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    await form.submit("/api/test");
    expect(form.errors).toEqual({});
  });
});
