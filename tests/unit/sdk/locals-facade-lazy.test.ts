/**
 * @file tests/unit/sdk/locals-facade-lazy.test.ts
 * @description Laziness contract for `LocalCMS.getLocals()`: the facade keeps
 * the exact observable shape of the previous eager bridge (same `Object.keys`
 * order, same method signatures, same promise shapes), but a namespace is only
 * read — and therefore only instantiated/awaited — when a handler touches it.
 *
 * ### Features:
 * - Constructor spies on every SDK namespace prove uncalled namespaces are
 *   never constructed (getLocals, property reads, and spread all stay cold)
 * - `Object.keys` order parity with the eager facade
 * - Signature/option-merge parity for the five CRUD closures
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { LocalCMS, LOCALS_NAMESPACE_KEYS } from "@src/services/sdk";

type NamespaceSpy = Mock<(...args: unknown[]) => void>;

const {
  authCtor,
  tokensCtor,
  collectionsCtor,
  mediaCtor,
  widgetsCtor,
  systemCtor,
  telemetryCtor,
  automationCtor,
  websiteTokensCtor,
  virtualCollectionsCtor,
  pluginStorageCtor,
  configCtor,
  contentTransferCtor,
  migrationsCtor,
  importersCtor,
  backupsCtor,
  contentSyncCtor,
  contentStructureCtor,
  workflowCtor,
  findSpy,
  findByIdSpy,
  createSpy,
  updateSpy,
  deleteSpy,
} = vi.hoisted(() => {
  // Typed through `unknown` so the hoisted values stay callable AND mockable:
  // the bare `vi.fn()` overload union (`Procedure | Constructable`) is neither.
  const makeSpy = () => vi.fn() as unknown as NamespaceSpy;
  return {
    authCtor: makeSpy(),
    tokensCtor: makeSpy(),
    collectionsCtor: makeSpy(),
    mediaCtor: makeSpy(),
    widgetsCtor: makeSpy(),
    systemCtor: makeSpy(),
    telemetryCtor: makeSpy(),
    automationCtor: makeSpy(),
    websiteTokensCtor: makeSpy(),
    virtualCollectionsCtor: makeSpy(),
    pluginStorageCtor: makeSpy(),
    configCtor: makeSpy(),
    contentTransferCtor: makeSpy(),
    migrationsCtor: makeSpy(),
    importersCtor: makeSpy(),
    backupsCtor: makeSpy(),
    contentSyncCtor: makeSpy(),
    contentStructureCtor: makeSpy(),
    workflowCtor: makeSpy(),
    findSpy: makeSpy(),
    findByIdSpy: makeSpy(),
    createSpy: makeSpy(),
    updateSpy: makeSpy(),
    deleteSpy: makeSpy(),
  };
});

/** Minimal namespace class that records construction through a hoisted spy. */
function spyNamespace(spy: NamespaceSpy) {
  return class {
    constructor(...args: unknown[]) {
      spy(...args);
    }
  };
}

vi.mock("@src/services/sdk/namespaces/auth-namespace", () => ({
  AuthNamespace: spyNamespace(authCtor),
  TokensNamespace: spyNamespace(tokensCtor),
}));

vi.mock("@src/services/sdk/namespaces/collections-namespace", () => ({
  CollectionsNamespace: class {
    constructor(...args: unknown[]) {
      collectionsCtor(...args);
    }
    async find(collectionId: string, options: Record<string, unknown> = {}) {
      findSpy(collectionId, options);
      return { success: true, data: [{ title: "ok" }] };
    }
    async findById(collectionId: string, entryId: string, options: Record<string, unknown> = {}) {
      findByIdSpy(collectionId, entryId, options);
      return { success: true, data: { _id: entryId } };
    }
    async create(collectionId: string, data: unknown, options: Record<string, unknown> = {}) {
      createSpy(collectionId, data, options);
      return { success: true, data: { _id: "n1" } };
    }
    async update(
      collectionId: string,
      entryId: string,
      data: unknown,
      options: Record<string, unknown> = {},
    ) {
      updateSpy(collectionId, entryId, data, options);
      return { success: true, data: { _id: entryId } };
    }
    async delete(collectionId: string, entryId: string, options: Record<string, unknown> = {}) {
      deleteSpy(collectionId, entryId, options);
      return { success: true, data: { _id: entryId } };
    }
  },
}));

vi.mock("@src/services/sdk/namespaces/media-namespace", () => ({
  MediaNamespace: spyNamespace(mediaCtor),
}));

vi.mock("@src/services/sdk/namespaces/misc-namespaces", () => ({
  WidgetsNamespace: spyNamespace(widgetsCtor),
  SystemNamespace: spyNamespace(systemCtor),
  TelemetryNamespace: spyNamespace(telemetryCtor),
  AutomationNamespace: spyNamespace(automationCtor),
  WebsiteTokensNamespace: spyNamespace(websiteTokensCtor),
  PluginStorageNamespace: spyNamespace(pluginStorageCtor),
}));

vi.mock("@src/services/sdk/namespaces/data-operations", () => ({
  ConfigurationNamespace: spyNamespace(configCtor),
  ContentTransferNamespace: spyNamespace(contentTransferCtor),
  MigrationNamespace: spyNamespace(migrationsCtor),
  ImportersNamespace: spyNamespace(importersCtor),
  BackupNamespace: spyNamespace(backupsCtor),
  ContentSyncNamespace: spyNamespace(contentSyncCtor),
  ContentStructureNamespace: spyNamespace(contentStructureCtor),
}));

vi.mock("@src/services/sdk/namespaces/virtual-collections-namespace", () => ({
  VirtualCollectionsNamespace: spyNamespace(virtualCollectionsCtor),
}));

vi.mock("@src/services/sdk/namespaces/workflow-namespace", () => ({
  WorkflowNamespace: spyNamespace(workflowCtor),
}));

/** Every namespace constructor spy — used for "nothing else was instantiated" assertions. */
const ALL_NAMESPACE_CTORS: NamespaceSpy[] = [
  authCtor,
  tokensCtor,
  collectionsCtor,
  mediaCtor,
  widgetsCtor,
  systemCtor,
  telemetryCtor,
  automationCtor,
  websiteTokensCtor,
  virtualCollectionsCtor,
  pluginStorageCtor,
  configCtor,
  contentTransferCtor,
  migrationsCtor,
  importersCtor,
  backupsCtor,
  contentSyncCtor,
  contentStructureCtor,
  workflowCtor,
];

const FACADE_METHOD_KEYS = ["find", "findById", "create", "update", "delete"];
const EXPECTED_FACADE_KEYS = [...FACADE_METHOD_KEYS, ...LOCALS_NAMESPACE_KEYS];

const mockAdapter = {
  crud: { findMany: vi.fn(), findOne: vi.fn() },
  auth: { user: {}, session: {}, token: {} },
  media: {},
  settings: {},
  collection: { getModel: vi.fn() },
  system: { preferences: {} },
  content: { nodes: {} },
  isConnected: vi.fn(() => true),
};

function makeLocals() {
  return LocalCMS.getLocals(
    mockAdapter as never,
    { tenantId: "tenant-ABC", user: { id: "user-1" }, isAdmin: true },
    undefined,
  );
}

function expectNoNamespaceConstructed() {
  for (const ctor of ALL_NAMESPACE_CTORS) {
    expect(ctor).not.toHaveBeenCalled();
  }
}

describe("LocalCMS.getLocals — lazy namespace facade", () => {
  beforeEach(() => {
    for (const ctor of ALL_NAMESPACE_CTORS) ctor.mockClear();
    findSpy.mockClear();
    findByIdSpy.mockClear();
    createSpy.mockClear();
    updateSpy.mockClear();
    deleteSpy.mockClear();
  });

  it("keeps the exact Object.keys shape and order of the eager facade", () => {
    const locals = makeLocals();
    expect(Object.keys(locals)).toEqual(EXPECTED_FACADE_KEYS);
    // Every key is an own enumerable property — the eager facade was a plain
    // literal, and consumers may iterate it.
    for (const key of EXPECTED_FACADE_KEYS) {
      const descriptor = Object.getOwnPropertyDescriptor(locals, key);
      expect(descriptor).toBeTruthy();
      expect(descriptor?.enumerable).toBe(true);
    }
  });

  it("instantiates no namespace at construction, on property read, or on spread", () => {
    const locals = makeLocals();
    expectNoNamespaceConstructed();

    // Reading every namespace prop materializes at most the forwarding proxy —
    // never the namespace itself.
    for (const key of LOCALS_NAMESPACE_KEYS) {
      void Reflect.get(locals, key);
    }
    expectNoNamespaceConstructed();

    // Spreading reads all getters; it must not start any async namespace load.
    const copy = { ...locals };
    expect(Object.keys(copy)).toEqual(EXPECTED_FACADE_KEYS);
    expectNoNamespaceConstructed();
  });

  it("instantiates only the namespace the handler uses", async () => {
    const locals = makeLocals();
    const result = await locals.find("pages", { bypassCache: true });

    expect(result).toEqual({ success: true, data: [{ title: "ok" }] });
    expect(collectionsCtor).toHaveBeenCalledTimes(1);
    for (const ctor of ALL_NAMESPACE_CTORS) {
      if (ctor !== collectionsCtor) expect(ctor).not.toHaveBeenCalled();
    }
  });

  it("merges tenant/user into the options bag exactly like the eager closure", async () => {
    const locals = makeLocals();
    await locals.find("pages", { bypassCache: true });

    expect(findSpy).toHaveBeenCalledWith(
      "pages",
      expect.objectContaining({
        tenantId: "tenant-ABC",
        user: { id: "user-1" },
        bypassCache: true,
      }),
    );
  });

  it("keeps promise signatures for every CRUD closure", async () => {
    const locals = makeLocals();

    const findPromise = locals.find("pages", {});
    const findByIdPromise = locals.findById("pages", "e1", {});
    const createPromise = locals.create("pages", { title: "n" }, {});
    const updatePromise = locals.update("pages", "e1", { title: "u" }, {});
    const deletePromise = locals.delete("pages", "e1", {});

    expect(findPromise).toBeInstanceOf(Promise);
    expect(findByIdPromise).toBeInstanceOf(Promise);
    expect(createPromise).toBeInstanceOf(Promise);
    expect(updatePromise).toBeInstanceOf(Promise);
    expect(deletePromise).toBeInstanceOf(Promise);

    await Promise.all([findPromise, findByIdPromise, createPromise, updatePromise, deletePromise]);
    // One namespace instance serves all five closures.
    expect(collectionsCtor).toHaveBeenCalledTimes(1);
    expect(findByIdSpy).toHaveBeenCalledWith(
      "pages",
      "e1",
      expect.objectContaining({ tenantId: "tenant-ABC" }),
    );
  });

  it("resolves a namespace once and keeps its identity stable across reads", async () => {
    const locals = makeLocals();

    // Before any call the defineLazyNamespace proxy identity is cached.
    const first = Reflect.get(locals, "collections");
    const second = Reflect.get(locals, "collections");
    expect(first).toBe(second);

    await locals.find("pages", {});
    expect(collectionsCtor).toHaveBeenCalledTimes(1);

    // After hot-swap the facade still delegates to the same resolved instance.
    await locals.find("pages", {});
    expect(collectionsCtor).toHaveBeenCalledTimes(1);
    expect(typeof locals.collections.find).toBe("function");

    // Auth was never touched by any of the above.
    expect(authCtor).not.toHaveBeenCalled();
  });

  it("leaves later namespace use on the same facade lazy as well", async () => {
    const locals = makeLocals();
    await locals.find("pages", {});

    // Only now resolve media — auth/others still stay cold.
    const mediaProxy = Reflect.get(locals, "media");
    expect(mediaProxy).toBeTruthy();
    expect(mediaCtor).not.toHaveBeenCalled();
    expect(authCtor).not.toHaveBeenCalled();
    expect(systemCtor).not.toHaveBeenCalled();
  });
});
