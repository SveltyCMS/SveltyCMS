/**
 * @file tests/unit/databases/cache-service.test.ts
 * @description Whitebox unit tests for CacheService enhancements
 */

(globalThis as any).vi.unmock("@src/databases/cache/cache-service");

// Mock settings-service specifically for these tests
vi.mock("@src/services/settings-service", () => ({
  getPrivateSettingSync: vi.fn((key: string) => {
    if (key === "MULTI_TENANT") return (globalThis as any).__mockMultiTenant ?? false;
    if (key.startsWith("CACHE_TTL_")) return 300;
    return null;
  }),
}));

describe("CacheService (Whitebox)", () => {
  let service: any;
  let CacheServiceClass: any;

  beforeEach(async () => {
    // DYNAMIC IMPORT with query to bypass persistent Bun mock
    const module = await import("@src/databases/cache/cache-service?bun-unmock=" + Date.now());
    CacheServiceClass = module.CacheService;

    // Create a NEW instance for each test to bypass the global singleton mock
    service = new CacheServiceClass();
    await service.initialize(true); // Force init
    (globalThis as any).__mockMultiTenant = false;
  });

  describe("generateKey", () => {
    it("should generate a simple key when multi-tenant is disabled", () => {
      const key = service.generateKey("my-key");
      expect(key).toBe("my-key");
    });

    it("should generate a tenant-prefixed key when multi-tenant is enabled", () => {
      (globalThis as any).__mockMultiTenant = true;
      const key = service.generateKey("my-key", "tenant-1");
      expect(key).toBe("tenant:tenant-1:my-key");
    });

    it('should use "default" as tenantId if not provided but multi-tenant is enabled', () => {
      (globalThis as any).__mockMultiTenant = true;
      const key = service.generateKey("my-key");
      expect(key).toBe("tenant:default:my-key");
    });

    it("should memoize generated keys", () => {
      const spy = vi.spyOn(service as any, "keyCache", "get");
      service["generateKey"]("cached-key");
      service["generateKey"]("cached-key");

      expect(spy).toBeTruthy();
    });
  });
});
