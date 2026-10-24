/**
 * @file tests/unit/routes/theme-public-server.test.ts
 * @description Unit tests for GET /api/theme/public — branding load contract,
 * graceful fallback on tenant-resolution failure, and per-tenant isolation
 * under parallel requests.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockTenantResolver = vi.fn();
const mockGetPublicSetting = vi.fn();
const mockGetUntypedSetting = vi.fn();
const mockCacheGet = vi.fn();
const mockCacheSet = vi.fn();

vi.mock("@utils/tenant", () => ({
  getTenantIdFromHostname: (hostname: string, multiTenant?: boolean) =>
    mockTenantResolver(hostname, multiTenant),
}));

vi.mock("@src/services/core/settings-service", () => ({
  getPublicSetting: (key: string, tenantId?: string) => mockGetPublicSetting(key, tenantId),
  getUntypedSetting: (key: string, scope?: "public" | "private", tenantId?: string) =>
    mockGetUntypedSetting(key, scope, tenantId),
}));

vi.mock("@src/databases/cache/cache-service", () => ({
  cacheService: {
    get: (key: string, tenantId?: string) => mockCacheGet(key, tenantId),
    set: (key: string, value: unknown, ttl?: number, tenantId?: string) =>
      mockCacheSet(key, value, ttl, tenantId),
  },
}));

import { GET } from "@src/routes/api/theme/public/+server";

type ThemeEvent = Parameters<typeof GET>[0];

interface ThemeBranding {
  siteName: string | null;
  logoUrl: string | null;
  accentColor: string | null;
  error?: unknown;
}

function makeEvent(search: string): ThemeEvent {
  return {
    url: new URL(`http://localhost/api/theme/public${search}`),
  } as unknown as ThemeEvent;
}

async function readBranding(response: Response): Promise<ThemeBranding> {
  return (await response.json()) as ThemeBranding;
}

describe("GET /api/theme/public — load contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
    mockTenantResolver.mockReturnValue("t1");
    mockGetPublicSetting.mockResolvedValue("Alpha CMS");
    mockGetUntypedSetting.mockImplementation(async (key: string) =>
      key === "LOGO_URL" ? "https://cdn.example.com/alpha.png" : "#2563eb",
    );
  });

  it("returns tenant branding from settings on a cache miss", async () => {
    const response = await GET(makeEvent("?tenantId=t1"));

    expect(response.status).toBe(200);
    const body = await readBranding(response);
    expect(body).toEqual({
      siteName: "Alpha CMS",
      logoUrl: "https://cdn.example.com/alpha.png",
      accentColor: "#2563eb",
    });

    expect(mockCacheGet).toHaveBeenCalledWith("theme:public:t1", "t1");
    expect(mockCacheSet).toHaveBeenCalledWith(
      "theme:public:t1",
      {
        siteName: "Alpha CMS",
        logoUrl: "https://cdn.example.com/alpha.png",
        accentColor: "#2563eb",
      },
      600,
      "t1",
    );
  });
});

describe("GET /api/theme/public — failure path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
    mockGetPublicSetting.mockResolvedValue("Alpha CMS");
    mockGetUntypedSetting.mockImplementation(async (key: string) =>
      key === "LOGO_URL" ? "https://cdn.example.com/alpha.png" : "#2563eb",
    );
  });

  it("falls back to null branding when tenant resolution throws", async () => {
    mockTenantResolver.mockImplementation((hostname: string) => {
      if (hostname === "bad.example") throw new Error("hostname resolution failed");
      return "t1";
    });

    const response = await GET(makeEvent("?hostname=bad.example"));

    expect(response.status).toBe(200);
    const body = await readBranding(response);
    expect(body).toEqual({ siteName: null, logoUrl: null, accentColor: null });
    expect(body.error).toBeUndefined();
    expect(mockTenantResolver).toHaveBeenCalledWith("bad.example", true);
    expect(mockGetPublicSetting).not.toHaveBeenCalled();
    expect(mockGetUntypedSetting).not.toHaveBeenCalled();
  });

  it("short-circuits the default tenant without touching settings", async () => {
    mockTenantResolver.mockReturnValue("default");

    const response = await GET(makeEvent("?hostname=localhost"));

    expect(response.status).toBe(200);
    const body = await readBranding(response);
    expect(body).toEqual({ siteName: null, logoUrl: null, accentColor: null });
    expect(body.error).toBeUndefined();
    expect(mockGetPublicSetting).not.toHaveBeenCalled();
    expect(mockGetUntypedSetting).not.toHaveBeenCalled();
    expect(mockCacheGet).not.toHaveBeenCalled();
  });
});

describe("GET /api/theme/public — concurrency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
    mockTenantResolver.mockReturnValue("t1");
    mockGetPublicSetting.mockImplementation(async (_key: string, tenantId?: string) =>
      tenantId === "t2" ? "Beta CMS" : "Alpha CMS",
    );
    mockGetUntypedSetting.mockImplementation(
      async (key: string, _scope?: string, tenantId?: string) => {
        const suffix = tenantId === "t2" ? "beta" : "alpha";
        if (key === "LOGO_URL") return `https://cdn.example.com/${suffix}.png`;
        return tenantId === "t2" ? "#111827" : "#2563eb";
      },
    );
  });

  it("keeps same-tenant payloads equal and isolates parallel tenants", async () => {
    const [sameA, sameB] = await Promise.all([
      GET(makeEvent("?tenantId=t1")),
      GET(makeEvent("?tenantId=t1")),
    ]);
    const [sameABody, sameBBody] = (await Promise.all([sameA.json(), sameB.json()])) as [
      ThemeBranding,
      ThemeBranding,
    ];

    expect(sameABody).toEqual(sameBBody);
    expect(sameABody).toEqual({
      siteName: "Alpha CMS",
      logoUrl: "https://cdn.example.com/alpha.png",
      accentColor: "#2563eb",
    });

    const [alpha, beta] = await Promise.all([
      GET(makeEvent("?tenantId=t1")),
      GET(makeEvent("?tenantId=t2")),
    ]);
    const [alphaBody, betaBody] = (await Promise.all([alpha.json(), beta.json()])) as [
      ThemeBranding,
      ThemeBranding,
    ];

    // No cross-tenant bleed: each in-flight request resolves its own branding.
    expect(alphaBody.siteName).toBe("Alpha CMS");
    expect(betaBody.siteName).toBe("Beta CMS");
    expect(alphaBody.logoUrl).toBe("https://cdn.example.com/alpha.png");
    expect(betaBody.logoUrl).toBe("https://cdn.example.com/beta.png");
    expect(alphaBody.accentColor).not.toBe(betaBody.accentColor);

    expect(mockGetPublicSetting).toHaveBeenCalledWith("SITE_NAME", "t1");
    expect(mockGetPublicSetting).toHaveBeenCalledWith("SITE_NAME", "t2");
    expect(mockCacheGet).toHaveBeenCalledWith("theme:public:t1", "t1");
    expect(mockCacheGet).toHaveBeenCalledWith("theme:public:t2", "t2");
  });
});
