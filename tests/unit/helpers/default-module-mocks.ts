/**
 * @file tests/unit/helpers/default-module-mocks.ts
 * @description
 * Shared default module mock factories for unit setup and tests.
 *
 * Prefer these (or real core code) over incomplete per-file `vi.mock` stubs.
 * Rule of thumb: mock boundaries (DB, network, FS writes, IdP) — never partially
 * mock stdlib or core error/hash utilities.
 */

/** Quiet structured logger used by unit setup (and optional per-file spies). */
export function createMockLogger(fn: (impl?: (...args: any[]) => any) => any) {
  const mockLogger: Record<string, any> = {
    level: "info",
    isEnabled: fn((level: string) => {
      const order = ["none", "fatal", "error", "warn", "info", "debug", "trace"];
      return order.indexOf(level) <= order.indexOf("info") && order.indexOf(level) > 0;
    }),
    once: fn(() => {}),
    fatal: fn((msg: any) => {
      if (process.env.VERBOSE_TESTS) console.error(`[FATAL] ${msg}`);
    }),
    error: fn((msg: any, details?: any) => {
      if (process.env.VERBOSE_TESTS) console.error(`[ERROR] ${msg}`, details || "");
    }),
    warn: fn((msg: any) => {
      if (process.env.VERBOSE_TESTS) console.warn(`[WARN] ${msg}`);
    }),
    info: fn(() => {}),
    debug: fn(() => {}),
    trace: fn(() => {}),
    dump: fn(() => {}),
  };
  mockLogger.isLevel = fn((level: string) => mockLogger.isEnabled(level));
  mockLogger.channel = fn(() => ({ ...mockLogger, once: mockLogger.once }));
  return mockLogger;
}

/** Default settings-service surface — override per-test only when values differ. */
export function createDefaultSettingsServiceMock(fn: (impl?: (...args: any[]) => any) => any) {
  const settingsMock = {
    getPrivateSettingSync: fn((key: string) => {
      const env = (globalThis as any).privateEnv || (globalThis as any).__privateEnv;
      if (env && key in env) return env[key];
      const defaults: Record<string, any> = {
        DB_TYPE: "mongodb",
        MULTI_TENANT: false,
        FIREWALL_ENABLED: true,
        USE_REDIS: false,
      };
      return defaults[key];
    }),
    getPublicSettingSync: fn((key: string) => (key === "SITE_NAME" ? "SveltyCMS Test" : undefined)),
    getPrivateSetting: fn(async (key: string) => {
      const env = (globalThis as any).privateEnv || (globalThis as any).__privateEnv;
      if (env && key in env) return env[key];
      return "mongodb";
    }),
    getPublicSetting: fn(async (_key: string) => "test"),
    loadSettingsCache: fn(async () => ({ loaded: true, private: {}, public: {} })),
    setSettingsCache: fn(async () => {}),
    invalidateSettingsCache: fn(async () => {}),
    isCacheLoaded: fn(() => true),
    getAllSettings: fn(async () => ({ public: {}, private: {} })),
    updateSettingsFromSnapshot: fn(async () => ({ updated: 0 })),
    getUntypedSetting: fn(async () => undefined),
  };

  return {
    settingsService: settingsMock,
    loadSettingsCache: settingsMock.loadSettingsCache,
    invalidateSettingsCache: settingsMock.invalidateSettingsCache,
    getPrivateSetting: settingsMock.getPrivateSetting,
    getPublicSetting: settingsMock.getPublicSetting,
    getUntypedSetting: settingsMock.getUntypedSetting,
    getPublicSettingSync: settingsMock.getPublicSettingSync,
    getPrivateSettingSync: settingsMock.getPrivateSettingSync,
    getAllSettings: settingsMock.getAllSettings,
    setPrivateSetting: settingsMock.setSettingsCache,
    updateSettingsFromSnapshot: settingsMock.updateSettingsFromSnapshot,
    default: settingsMock,
    // raw mock object for tests that need to reconfigure methods
    __settingsMock: settingsMock,
  };
}

/** Default publicEnv for browser API clients that read DEFAULT_CONTENT_LANGUAGE. */
export function createDefaultGlobalSettingsMock() {
  const publicEnvState: Record<string, any> = {
    DEFAULT_CONTENT_LANGUAGE: "en",
    SITE_NAME: "SveltyCMS Test",
  };
  return {
    publicEnv: publicEnvState,
    isPublicEnvReady: () => true,
    initPublicEnv: (env: Record<string, any>) => {
      Object.assign(publicEnvState, env);
    },
    updatePublicEnv: (key: string, value: any) => {
      publicEnvState[key] = value;
    },
    getPublicSetting: (key: string) => publicEnvState[key],
    getPublicEnv: () => publicEnvState,
  };
}

/**
 * Minimal @sveltejs/kit surface so real page-guards (redirect) and error() work
 * without per-file page-guards.server mocks.
 */
export function createSvelteKitMock(fn: (impl?: (...args: any[]) => any) => any) {
  return {
    json: fn((data: any, init?: any) => {
      const res = new Response(JSON.stringify(data), {
        status: init?.status || 200,
        headers: { "Content-Type": "application/json", ...init?.headers },
      });
      (res as any)._data = data;
      return res;
    }),
    error: fn((status: number, message: string | { message: string }) => {
      const msg = typeof message === "string" ? message : message.message;
      const err = new Error(msg) as any;
      err.status = status;
      err.statusCode = status;
      err.body = { message: msg };
      err.__is_http_error = true;
      throw err;
    }),
    redirect: fn((status: number, location: string) => {
      const err = new Error("Redirect") as any;
      err.status = status;
      err.location = location;
      err.__isRedirect = true;
      throw err;
    }),
    isRedirect: (err: any) => !!(err && err.__isRedirect === true),
    isHttpError: (err: any) =>
      !!(err && (err.__is_http_error === true || typeof err?.status === "number")),
    fail: fn((status: number, data?: any) => ({ type: "failure", status, data })),
  };
}
