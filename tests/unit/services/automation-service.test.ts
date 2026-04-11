/**
 * @file tests/unit/services/automationService.test.ts
 * @description Unit tests for the Automation Service
 *
 * Tests:
 * - Initialization
 * - Flow CRUD
 * - Execution Logic
 */

import { automationService } from "@src/services/automation/automation-service";
import { TokenRegistry } from "@src/services/token/engine";
import * as TokenEngine from "@src/services/token/engine";

// Access global mocks from setup.ts
const mockDbAdapter = (globalThis as any).mockDbAdapter;
const mockEventBus = (globalThis as any).mockEventBus;

describe("AutomationService", () => {
  beforeEach(() => {
    // Mock Token Engine to avoid heavy dependencies and timeouts
    vi.spyOn(TokenRegistry, "resolve").mockResolvedValue("");
    vi.spyOn(TokenRegistry, "getTokens").mockReturnValue({
      collection: [],
      entry: [],
      user: [],
      site: [],
      system: [],
      recentlyUsed: [],
    });
    vi.spyOn(TokenRegistry, "clearCache").mockImplementation(() => {});

    // Use type assertion to silence "always defined" warning if necessary, or just call it
    const replaceTokensSpy = TokenEngine.replaceTokens as any;
    if (replaceTokensSpy) {
      vi.spyOn(TokenEngine, "replaceTokens").mockImplementation((t) => Promise.resolve(t));
    }

    // Use spyOn for common database mocks to allow restoreAllMocks to work correctly
    vi.spyOn(mockDbAdapter.auth, "getUserCount").mockResolvedValue(10);

    mockDbAdapter.system.preferences.set.mockClear();
    mockDbAdapter.crud.update.mockClear();
    mockEventBus.on.mockClear();
    automationService.invalidateCache();
    // Reset initialized state for testing
    (automationService as any).initialized = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("init", () => {
    it("should register wildcard listener on EventBus", () => {
      automationService.init();
      expect(mockEventBus.on).toHaveBeenCalledWith("*", expect.any(Function));
    });
  });

  describe("Flow CRUD", () => {
    it("should load flows from database", async () => {
      const mockFlows = [
        {
          id: "flow-1",
          name: "Test Flow",
          active: true,
          trigger: {} as any,
          operations: [] as any[],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          tenantId: "tenant-1",
        },
      ];
      mockDbAdapter.system.preferences.get.mockReturnValue(
        Promise.resolve({ success: true, data: mockFlows as any }),
      );

      const flows = await automationService.getFlows("tenant-1");
      expect(flows as any).toEqual(mockFlows);
      expect(mockDbAdapter.system.preferences.get).toHaveBeenCalledWith(
        "automations_config",
        "system",
        "tenant-1",
      );
    });

    it("should save a new flow", async () => {
      const newFlow = { name: "New Automation", active: true } as any;
      const saved = await automationService.saveFlow(newFlow, "tenant-1");

      expect(saved.id).toBeDefined();
      expect(saved.name).toBe("New Automation");
      expect(mockDbAdapter.system.preferences.set).toHaveBeenCalled();
    });

    it("should delete a flow", async () => {
      const mockFlows = [
        {
          id: "flow-1",
          name: "Delete Me",
          trigger: {} as any,
          operations: [] as any[],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          tenantId: "tenant-1",
        },
      ];
      mockDbAdapter.system.preferences.get.mockReturnValue(
        Promise.resolve({ success: true, data: mockFlows as any }),
      );

      await automationService.deleteFlow("flow-1", "tenant-1");
      expect(mockDbAdapter.system.preferences.set).toHaveBeenCalledWith(
        "automations_config",
        [],
        "system",
        "tenant-1",
      );
    });
  });

  describe("Execution Logic (Basic)", () => {
    it("should execute a log operation successfully", async () => {
      const flow = {
        id: "flow-1",
        name: "Log Flow",
        operations: [
          {
            id: "op-1",
            type: "log",
            config: { message: "Hello", level: "info" },
          },
        ],
      } as any;

      const payload = {
        event: "test",
        timestamp: new Date().toISOString(),
      } as any;
      const result = await automationService.executeFlow(flow, payload);

      expect(result.status).toBe("success");
      expect(result.operationResults[0].status).toBe("success");
    });

    it("should stop chain on condition failure", async () => {
      const flow = {
        id: "flow-1",
        name: "Condition Flow",
        operations: [
          {
            id: "op-1",
            type: "condition",
            config: { field: "status", operator: "equals", value: "published" },
          },
          { id: "op-2", type: "log", config: { message: "Should not run" } },
        ],
      } as any;

      const payload = {
        event: "test",
        data: { status: "draft" }, // Fails condition
        timestamp: new Date().toISOString(),
      } as any;

      const result = await automationService.executeFlow(flow, payload);

      expect(result.status).toBe("skipped");
      expect(result.operationResults).toHaveLength(1);
      expect(result.operationResults[0].status).toBe("skipped");
    });
  });
});
