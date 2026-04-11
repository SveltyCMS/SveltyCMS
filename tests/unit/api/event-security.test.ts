/**
 * @file tests/unit/api/event-security.test.ts
 * @description Unit tests for Events API security, focusing on tenant isolation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Important: Import handlers dynamically AFTER any process-level mocks are set up.
// In this case, we rely on setup.ts for global mocks.
const { GET: getEvents } = await import("@src/routes/api/events/+server");
import { eventBus } from "@src/services/automation/event-bus";

describe("Events API Security - Tenant Isolation", () => {
  const mockUser = { _id: "user1", role: "admin", email: "test@example.com" };
  const myTenant = "tenant-1";
  const otherTenant = "tenant-2";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should filter events by tenantId in the SSE stream", async () => {
    // Mock eventBus.on to capture the listener
    let capturedListener: any;
    vi.spyOn(eventBus, "on").mockImplementation((event, listener) => {
      if (event === "*") {
        capturedListener = listener;
      }
      return vi.fn(); // Unsubscribe function
    });

    let mockController: any;
    const RealReadableStream = globalThis.ReadableStream;

    // @ts-expect-error - Mocking for test
    globalThis.ReadableStream = class extends RealReadableStream {
      constructor(opts: any) {
        const originalStart = opts.start;
        opts.start = (controller: any) => {
          mockController = controller;
          vi.spyOn(mockController, "enqueue");
          vi.spyOn(mockController, "error");
          vi.spyOn(mockController, "close");
          if (originalStart) originalStart(controller);
        };
        super(opts);
      }
    };

    try {
      const event = {
        locals: { user: mockUser, tenantId: myTenant },
      } as any;

      const response = await getEvents(event);
      expect(response.status).toBe(200);

      expect(capturedListener).toBeDefined();
      expect(mockController).toBeDefined();

      // Simulate events from different tenants
      const myEvent = {
        event: "entry:create",
        tenantId: myTenant,
        data: { name: "My Tenant" },
      };
      const otherEvent = {
        event: "entry:create",
        tenantId: otherTenant,
        data: { name: "Other Tenant" },
      };

      // Call the captured listener
      capturedListener(myEvent);
      capturedListener(otherEvent);

      // Verify that ONLY myEvent was enqueued
      // First call is 'connected' message
      expect(mockController.enqueue).toHaveBeenCalledTimes(2);

      const firstCall = mockController.enqueue.mock.calls[0][0];
      expect(firstCall).toContain("connected");

      const secondCall = mockController.enqueue.mock.calls[1][0];
      expect(secondCall).toContain("My Tenant");
      expect(secondCall).not.toContain("Other Tenant");
    } finally {
      // Cleanup: Guaranteed to run even if an expect() throws
      // Use globalThis directly to ensure we restore the original
      globalThis.ReadableStream = RealReadableStream;
    }
  });
});
