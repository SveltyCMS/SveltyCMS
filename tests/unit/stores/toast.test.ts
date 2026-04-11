/**
 * @file tests/unit/stores/toast.svelte.test.ts
 * @description Unit tests for the ToastStore.
 */
import { toast } from "@stores/toast.svelte";

describe("ToastStore", () => {
  beforeEach(() => {
    toast.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    toast.clear();
  });

  it("should add a basic toast", () => {
    const id = toast.info("Test Info");
    expect(toast.toasts.length).toBe(1);
    expect(toast.toasts[0].id).toBe(id);
    expect(toast.toasts[0].message).toBe("Test Info");
    expect(toast.toasts[0].type).toBe("info");
  });

  it("should support multiple toast types", () => {
    toast.success("Success");
    toast.error("Error");
    toast.warning("Warning");
    toast.info("Info");

    expect(toast.toasts.length).toBe(4);
    expect(toast.toasts.map((t) => t.type)).toEqual(["success", "error", "warning", "info"]);
  });

  it("should adhere to maximum toast limits by removing non-persistent first", () => {
    // Default max limit is 5
    for (let i = 0; i < 6; i++) {
      toast.info(`Message ${i}`);
    }
    expect(toast.toasts.length).toBe(5);
    // The oldest one (Message 0) should be gone
    expect(toast.toasts[0].message).toBe("Message 1");

    toast.clear();

    // Interleave persistent toast
    toast.info({ message: "Persistent", persistent: true });
    for (let i = 0; i < 5; i++) {
      toast.info(`Message ${i}`);
    }
    expect(toast.toasts.length).toBe(5);
    // The persistent toast should survive, and the oldest non-persistent should be gone
    expect(toast.toasts.find((t) => t.message === "Persistent")).toBeDefined();
  });

  it("should cleanly remove a toast manually", () => {
    const id = toast.success("To manually close");
    expect(toast.toasts.length).toBe(1);
    toast.close(id);
    expect(toast.toasts.length).toBe(0);
  });

  it("should handle pause and resume logic", () => {
    const id = toast.info("Pause Test", { duration: 5000 });
    expect(toast.isPaused(id)).toBe(false);

    toast.pause(id);
    expect(toast.isPaused(id)).toBe(true);

    toast.resume(id);
    expect(toast.isPaused(id)).toBe(false);
  });

  it("should store and read flash messages across sessions", () => {
    toast.flash({ type: "success", message: "Flash Success" });

    const stored = globalThis.sessionStorage.getItem("toast_flash");
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored!)).toMatchObject({ type: "success", message: "Flash Success" });

    // Check flash logic
    toast.checkFlash();
    expect(toast.toasts.length).toBe(1);
    expect(toast.toasts[0].message).toBe("Flash Success");
    expect(globalThis.sessionStorage.getItem("toast_flash")).toBeNull();
  });

  it("should backward-compatibly support legacy API calls", () => {
    toast.success({ description: "Legacy API" });
    expect(toast.toasts.length).toBe(1);
    expect(toast.toasts[0].message).toBe("Legacy API");
  });

  it("should auto-remove toast after duration", async () => {
    // Skip in TEST_MODE because we disable timers for CI stability
    if (process.env.TEST_MODE === "true") {
      return;
    }

    toast.show({ type: "success", message: "Auto remove", duration: 100 });
    expect(toast.toasts).toHaveLength(1);

    // Wait for duration + small margin
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(toast.toasts).toHaveLength(0);
  });

  it("should not auto-remove if duration is Infinity", async () => {
    toast.show({ type: "info", message: "Persistent", duration: Infinity });
    expect(toast.toasts).toHaveLength(1);

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(toast.toasts).toHaveLength(1);
  });
});
