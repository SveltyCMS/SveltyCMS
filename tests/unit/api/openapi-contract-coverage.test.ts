/**
 * @file tests/unit/api/openapi-contract-coverage.test.ts
 * @description Enforces the contract between the curated OpenAPI document and
 * the fail-closed dispatcher map. `ApiSpecService.generateSpec()` publishes
 * every namespace in `x-sveltycms`; this suite fails when that inventory drifts,
 * when a curated path disappears, when a mapping stops resolving to a real
 * permission id, or when the published document stops being a structurally
 * valid OpenAPI contract (operation ids, responses, path parameters, request
 * bodies, security schemes, component refs).
 *
 * Features:
 * - Exact namespace inventory parity with ENDPOINT_PERMISSIONS
 * - Disjoint documented/undocumented partition of that inventory
 * - Explicit KNOWN_UNDOCUMENTED allowlist (document a namespace or justify it here)
 * - Permission-id shape check for every method of every mapping
 * - Regression guard for the webhooks, workflows and automations paths
 * - Unique, non-empty `operationId` for every operation
 * - Success response plus per-response `description` contract
 * - Path template ↔ path parameter parity (path-level and operation-level)
 * - Request bodies for mutating operations (explicit no-body allowlist)
 * - Security requirement ↔ `components.securitySchemes` parity
 * - Permission-registry acceptance for every published permission id
 * - Local `$ref` resolution against `components.*`
 * - Operation/path-item shape and count sanity
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiSpecService } from "@src/services/system/api-spec-service";
import { ENDPOINT_PERMISSIONS } from "@src/routes/api/[...path]/endpoint-permissions";
// Import-safe in unit tests: the module only builds static in-memory registry
// maps from `core-permissions`/`permission-catalog` (no DB, FS, network or live
// config). `tests/unit/security/permission-registry-consistency.test.ts` already
// imports it the same way.
import { isAcceptablePermissionId } from "@src/databases/auth/permissions";

const mockCache = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@src/databases/cache/cache-service", () => ({
  cacheService: mockCache,
}));

vi.mock("@src/databases/cache/types", () => ({
  CacheCategory: { API: "api" },
}));

interface OpenApiSpecMeta {
  endpointPermissions: Record<string, string>;
  documentedNamespaces: string[];
  undocumentedNamespaces: string[];
}

interface OpenApiParameter {
  name?: string;
  in?: string;
  required?: boolean;
  schema?: unknown;
  $ref?: string;
}

interface OpenApiResponse {
  description?: string;
  $ref?: string;
  content?: Record<string, unknown>;
}

interface OpenApiRequestBody {
  required?: boolean;
  content?: Record<string, unknown>;
}

interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  tags?: string[];
  parameters?: OpenApiParameter[];
  requestBody?: OpenApiRequestBody;
  responses?: Record<string, OpenApiResponse>;
  security?: Array<Record<string, string[]>>;
}

interface OpenApiPathItem {
  parameters?: OpenApiParameter[];
  [key: string]: unknown;
}

interface OpenApiComponents {
  schemas?: Record<string, unknown>;
  securitySchemes?: Record<string, unknown>;
}

interface OpenApiSpec {
  openapi: string;
  paths: Record<string, OpenApiPathItem>;
  components: OpenApiComponents;
  security?: Array<Record<string, string[]>>;
  "x-sveltycms": OpenApiSpecMeta;
}

interface CollectedOperation {
  path: string;
  method: string;
  pathItem: OpenApiPathItem;
  operation: OpenApiOperation;
}

const TENANT_ID = "tenant-openapi-contract";
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const;
const HTTP_METHOD_SET: ReadonlySet<string> = new Set(HTTP_METHODS);
const PERMISSION_ID_PATTERN = /^[a-z][a-z0-9:_-]*$/i;
/** OpenAPI response keys: an exact status (`200`) or a wildcard range (`2XX`). */
const SUCCESS_STATUS_PATTERN = /^[23](?:\d{2}|XX)$/i;
const BODY_METHODS: ReadonlySet<string> = new Set(["POST", "PUT", "PATCH"]);
/** Non-operation keys allowed on a Path Item Object. */
const PATH_ITEM_METADATA_KEYS: ReadonlySet<string> = new Set([
  "parameters",
  "summary",
  "description",
  "servers",
]);

const ALL_NAMESPACES = Object.keys(ENDPOINT_PERMISSIONS).sort();
const ALL_NAMESPACE_SET: ReadonlySet<string> = new Set(ALL_NAMESPACES);

/**
 * Namespaces reachable through the dispatcher but absent from the curated
 * OpenAPI document. The list is exhaustive and sorted so the contract test can
 * use exact equality.
 *
 * A new API namespace must either be documented in
 * `src/services/system/api-spec-service.ts` (add its paths) or be added here
 * with a short reason. When a namespace gains curated paths, remove it from
 * this list; otherwise the exact-equality assertion fails.
 */
const KNOWN_UNDOCUMENTED: readonly string[] = [
  "ai",
  "ai-builder",
  "api-keys",
  "backups",
  "chat",
  "collections",
  "commerce",
  "config",
  "config-sync",
  "config_sync",
  "content",
  "content-export",
  "content-import",
  "content-structure",
  "content-sync",
  "database",
  "debug",
  "drafts",
  "events",
  "export",
  "forms",
  "gdpr",
  "graphql",
  "import",
  "import-data",
  "importer",
  "importers",
  "logs",
  "marketplace",
  "metrics",
  "migrations",
  "openapi.json",
  "permission",
  "plugin-settings",
  "remote-video",
  "remoteVideo",
  "security",
  "send-mail",
  "seo",
  "settings",
  "stripe",
  "system-jobs",
  "system-preferences",
  "system-settings",
  "system-virtual-folder",
  "system-webhooks",
  "systemVirtualFolder",
  "telemetry",
  "testing",
  "theme",
  "version",
  "version-check",
  "virtual-collections",
  "website-tokens",
  "widgets",
];

/**
 * Mutating actions whose contract genuinely carries no request body. Keep this
 * sorted and exhaustive: the request-body test asserts exact equality between
 * the body-less operations in the document and the two lists below, so a new
 * operation cannot quietly join (or leave) the exemption set.
 */
const NO_BODY_ACTIONS: readonly string[] = [
  "POST /auth/logout", // session-cookie teardown; credentials travel in the cookie
  "POST /automations/{id}/test", // handler treats the optional test payload as optional
  "POST /webhooks/logs/{id}/retry", // requeues a stored delivery attempt by id
  "POST /webhooks/{id}/test", // fires a synthetic event, no caller payload
];

/**
 * Known spec defects — NOT genuine no-body actions. This list is now empty:
 * `api-spec-service.ts` documents the workflow, automation and webhook PATCH
 * payloads. Keep the exact-set assertion below so a future operation cannot
 * quietly join the exemption set without a reviewer noticing.
 */
const MISSING_REQUEST_BODY_GAPS: readonly string[] = [];

/**
 * Known spec defects — this list is now empty: every error status is published
 * as a Response Object with a `description` and an `application/json` content
 * entry. The ratchet assertions stay in place so a future bare `$ref` cannot
 * bypass the description requirement.
 */
const RESPONSE_DESCRIPTION_GAPS: readonly string[] = [];

/** Curated paths that must stay published. They were added deliberately and a
 * refactor dropping them would silently shrink the public contract again. */
const REQUIRED_AUTOMATION_PATHS = [
  "/webhooks",
  "/webhooks/{id}",
  "/webhooks/{id}/test",
  "/webhooks/logs",
  "/webhooks/logs/{id}/retry",
  "/workflows",
  "/automations",
  "/automations/{id}",
  "/automations/{id}/test",
  "/automations/{id}/logs",
] as const;

/** Collect every operation in the document, preserving path-level access. */
function collectOperations(spec: OpenApiSpec): CollectedOperation[] {
  const collected: CollectedOperation[] = [];

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    for (const [key, value] of Object.entries(pathItem)) {
      const method = key.toUpperCase();
      if (!HTTP_METHOD_SET.has(method)) continue;
      collected.push({
        path,
        method,
        pathItem,
        operation: value as OpenApiOperation,
      });
    }
  }

  return collected;
}

function operationKey(method: string, path: string): string {
  return `${method} ${path}`;
}

/** `{id}` → `["id"]`; repeated parameters are kept so duplicates surface. */
function templateParameters(path: string): string[] {
  return [...path.matchAll(/\{([^}]+)\}/g)]
    .map((match) => match[1])
    .filter((name): name is string => typeof name === "string" && name.length > 0);
}

/** Resolve a local JSON Pointer (`#/components/schemas/X`) against the document. */
function resolveLocalRef(spec: OpenApiSpec, ref: string): unknown {
  if (!ref.startsWith("#/")) return undefined;

  return ref
    .slice(2)
    .split("/")
    .map((token) => token.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce<unknown>((node, token) => {
      if (node === null || typeof node !== "object") return undefined;
      return (node as Record<string, unknown>)[token];
    }, spec);
}

/** Collect every `$ref` string in the document (recursive, cycle-safe). */
function collectRefs(node: unknown, refs: string[] = [], seen: Set<object> = new Set()): string[] {
  if (node === null || typeof node !== "object") return refs;
  if (seen.has(node)) return refs;
  seen.add(node);

  if (Array.isArray(node)) {
    for (const item of node) collectRefs(item, refs, seen);
    return refs;
  }

  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === "$ref" && typeof value === "string") refs.push(value);
    else collectRefs(value, refs, seen);
  }

  return refs;
}

function resolveParameter(spec: OpenApiSpec, parameter: OpenApiParameter): OpenApiParameter {
  if (typeof parameter.$ref !== "string") return parameter;
  const resolved = resolveLocalRef(spec, parameter.$ref);
  return resolved !== null && typeof resolved === "object"
    ? (resolved as OpenApiParameter)
    : parameter;
}

function resolveResponse(spec: OpenApiSpec, response: unknown): OpenApiResponse | undefined {
  if (response === null || typeof response !== "object") return undefined;

  const candidate = response as OpenApiResponse;
  if (typeof candidate.$ref !== "string") return candidate;

  const resolved = resolveLocalRef(spec, candidate.$ref);
  return resolved !== null && typeof resolved === "object"
    ? (resolved as OpenApiResponse)
    : undefined;
}

describe("OpenAPI contract coverage", () => {
  const service = ApiSpecService.getInstance();

  beforeEach(() => {
    vi.clearAllMocks();
    mockCache.get.mockResolvedValue(null);
    service.__resetCache();
  });

  /** Generate from the curated subset only: no collections, no DB, no live config. */
  async function generateSpec(): Promise<{ spec: OpenApiSpec; meta: OpenApiSpecMeta }> {
    const spec = (await service.generateSpec([], TENANT_ID)) as OpenApiSpec;
    return { spec, meta: spec["x-sveltycms"] };
  }

  it("publishes exactly the dispatcher's namespace inventory", async () => {
    const { meta } = await generateSpec();

    expect(Object.keys(meta.endpointPermissions).sort()).toEqual(ALL_NAMESPACES);
  });

  it("partitions the inventory into disjoint documented and undocumented namespaces", async () => {
    const { meta } = await generateSpec();
    const documented = meta.documentedNamespaces;
    const undocumented = meta.undocumentedNamespaces;
    const undocumentedSet = new Set(undocumented);

    expect(
      documented.length + undocumented.length,
      "each ENDPOINT_PERMISSIONS namespace must be published exactly once",
    ).toBe(ALL_NAMESPACES.length);

    for (const namespace of documented) {
      expect(
        undocumentedSet.has(namespace),
        `${namespace} is published as both documented and undocumented`,
      ).toBe(false);
    }

    expect([...documented, ...undocumented].sort()).toEqual(ALL_NAMESPACES);
  });

  it("only publishes documented namespaces that the dispatcher gates through the map", async () => {
    const { meta } = await generateSpec();

    // `auth` and `user` are curated paths, but the dispatcher handles both in a
    // dedicated branch before the ENDPOINT_PERMISSIONS lookup (see
    // `_checkEndpointPermission`), and the service intentionally excludes them
    // from `documentedNamespaces`. No exception is needed here:
    // documentedNamespaces only ever contains map keys.
    for (const namespace of meta.documentedNamespaces) {
      expect(
        ALL_NAMESPACE_SET.has(namespace),
        `${namespace} is published as documented but has no ENDPOINT_PERMISSIONS entry`,
      ).toBe(true);
    }
  });

  it("keeps the undocumented allowlist sorted and exhaustive", async () => {
    const { meta } = await generateSpec();
    const actual = meta.undocumentedNamespaces;

    expect(
      KNOWN_UNDOCUMENTED,
      "KNOWN_UNDOCUMENTED must stay sorted so the allowlist diff is reviewable",
    ).toEqual([...KNOWN_UNDOCUMENTED].sort());

    const newlyUndocumented = actual.filter((namespace) => !KNOWN_UNDOCUMENTED.includes(namespace));
    const newlyDocumented = KNOWN_UNDOCUMENTED.filter((namespace) => !actual.includes(namespace));

    const instructions = [
      newlyUndocumented.length > 0
        ? `Document ${newlyUndocumented.join(", ")} in src/services/system/api-spec-service.ts, or add the namespace to KNOWN_UNDOCUMENTED with a reason.`
        : "",
      newlyDocumented.length > 0
        ? `Remove ${newlyDocumented.join(", ")} from KNOWN_UNDOCUMENTED: the namespace now has curated OpenAPI paths.`
        : "",
    ]
      .filter(Boolean)
      .join(" ");

    expect(actual, `OpenAPI namespace coverage drifted. ${instructions}`).toEqual(
      KNOWN_UNDOCUMENTED,
    );
  });

  it("resolves every namespace/method mapping to a valid permission id", async () => {
    const { meta } = await generateSpec();

    for (const [namespace, mapping] of Object.entries(ENDPOINT_PERMISSIONS)) {
      for (const method of HTTP_METHODS) {
        const resolved = typeof mapping === "function" ? mapping(method) : mapping;

        expect(
          typeof resolved,
          `${namespace} ${method} must resolve to a string permission id`,
        ).toBe("string");
        expect(
          resolved.length,
          `${namespace} ${method} resolved to an empty permission id`,
        ).toBeGreaterThan(0);
        expect(
          resolved,
          `${namespace} ${method} resolved to "${resolved}", which is not a permission id`,
        ).toMatch(PERMISSION_ID_PATTERN);
      }

      expect(
        meta.endpointPermissions[namespace],
        `${namespace} is missing from x-sveltycms.endpointPermissions`,
      ).toBe(typeof mapping === "string" ? mapping : "method-dependent");
    }
  });

  it("keeps the webhooks, workflows and automations paths published", async () => {
    const { spec, meta } = await generateSpec();

    for (const namespace of ["webhooks", "workflows", "automations"] as const) {
      expect(
        meta.documentedNamespaces,
        `${namespace} must remain a documented namespace`,
      ).toContain(namespace);
    }

    for (const path of REQUIRED_AUTOMATION_PATHS) {
      const pathItem = spec.paths[path];
      expect(pathItem, `missing documented path ${path}`).toBeDefined();

      // OpenAPI path-item keys are lowercase (`get`, `post`, …).
      const operations = Object.keys(pathItem ?? {}).filter((key) =>
        HTTP_METHOD_SET.has(key.toUpperCase()),
      );
      expect(operations.length, `${path} is published without an HTTP operation`).toBeGreaterThan(
        0,
      );
    }
  });

  it("gives every operation a unique, non-empty operationId", async () => {
    const { spec } = await generateSpec();
    const operations = collectOperations(spec);

    const missing = operations
      .filter(({ operation }) => {
        const id = operation.operationId;
        return typeof id !== "string" || id.trim().length === 0;
      })
      .map(({ method, path }) => operationKey(method, path));

    const ownersById = new Map<string, string[]>();
    for (const { method, path, operation } of operations) {
      const id = operation.operationId?.trim();
      if (!id) continue;
      const owners = ownersById.get(id);
      if (owners) owners.push(operationKey(method, path));
      else ownersById.set(id, [operationKey(method, path)]);
    }

    const duplicates = [...ownersById.entries()]
      .filter(([, owners]) => owners.length > 1)
      .map(([id, owners]) => `${id} => ${owners.join(", ")}`);

    expect(
      missing,
      "every operation needs a non-empty operationId so generated clients can address it",
    ).toEqual([]);
    expect(
      duplicates,
      "operationId values must be unique across the whole document; rename the duplicates above",
    ).toEqual([]);
  });

  it("gives every operation a success response and every response a description", async () => {
    const { spec } = await generateSpec();
    const operations = collectOperations(spec);

    const withoutSuccess: string[] = [];
    const withoutDescription: string[] = [];
    const knownDescriptionGapUsages = new Set<string>();

    for (const { method, path, operation } of operations) {
      const responses = operation.responses ?? {};
      const statuses = Object.keys(responses);

      if (!statuses.some((status) => SUCCESS_STATUS_PATTERN.test(status))) {
        withoutSuccess.push(`${operationKey(method, path)} (statuses: ${statuses.join(", ")})`);
      }

      for (const [status, response] of Object.entries(responses)) {
        const resolved = resolveResponse(spec, response);
        const description = resolved?.description;
        if (typeof description === "string" && description.trim().length > 0) continue;

        const ref = response.$ref;
        if (typeof ref === "string" && RESPONSE_DESCRIPTION_GAPS.includes(ref)) {
          knownDescriptionGapUsages.add(ref);
          continue;
        }

        withoutDescription.push(`${operationKey(method, path)} -> ${status}`);
      }
    }

    expect(withoutSuccess, "every operation must publish at least one 2xx or 3xx response").toEqual(
      [],
    );
    expect(
      withoutDescription,
      "every response (or its $ref target) must carry a non-empty description",
    ).toEqual([]);

    // Ratchet: the tracked gaps must still be real gaps, so the exemption list
    // cannot silently outlive a fix to the document.
    expect(
      [...knownDescriptionGapUsages].sort(),
      "RESPONSE_DESCRIPTION_GAPS is stale; remove entries whose $ref now resolves to a described response",
    ).toEqual([...RESPONSE_DESCRIPTION_GAPS].sort());

    for (const gap of RESPONSE_DESCRIPTION_GAPS) {
      const target = resolveLocalRef(spec, gap);
      expect(
        target,
        `${gap} is listed as a known description gap but no longer resolves`,
      ).toBeDefined();
      expect(
        (target as OpenApiResponse | undefined)?.description,
        `${gap} now carries a description — remove it from RESPONSE_DESCRIPTION_GAPS`,
      ).toBeUndefined();
    }
  });

  it("keeps every path template in sync with its path parameters", async () => {
    const { spec } = await generateSpec();
    const problems: string[] = [];

    for (const { method, path, pathItem, operation } of collectOperations(spec)) {
      const templateNames = templateParameters(path);
      // Operation-level parameters override path-level ones with the same name+in.
      const parameters = [...(operation.parameters ?? []), ...(pathItem.parameters ?? [])].map(
        (parameter) => resolveParameter(spec, parameter),
      );
      const pathParameters = parameters.filter((parameter) => parameter.in === "path");

      for (const name of templateNames) {
        const parameter = pathParameters.find((candidate) => candidate.name === name);
        if (!parameter) {
          problems.push(`${operationKey(method, path)}: no parameter for "{${name}}"`);
          continue;
        }
        if (parameter.required !== true) {
          problems.push(`${operationKey(method, path)}: path parameter "${name}" must be required`);
        }
        if (parameter.schema === undefined) {
          problems.push(`${operationKey(method, path)}: path parameter "${name}" has no schema`);
        }
      }

      for (const parameter of pathParameters) {
        if (typeof parameter.name !== "string" || parameter.name.length === 0) {
          problems.push(`${operationKey(method, path)}: path parameter without a name`);
          continue;
        }
        if (!templateNames.includes(parameter.name)) {
          problems.push(
            `${operationKey(method, path)}: declares path parameter "${parameter.name}" that is absent from the template`,
          );
        }
      }
    }

    expect(problems, "path templates and path parameters drifted apart").toEqual([]);
  });

  it("declares a content type for every mutating operation that takes a body", async () => {
    const { spec } = await generateSpec();
    const operations = collectOperations(spec);
    const mutating = operations.filter(({ method }) => BODY_METHODS.has(method));

    expect(
      mutating.length,
      "the curated document must publish mutating operations for this check to be meaningful",
    ).toBeGreaterThan(0);

    const malformedBodies = mutating.flatMap(({ method, path, operation }) => {
      if (operation.requestBody === undefined) return [];
      const content = operation.requestBody.content;
      if (content === null || typeof content !== "object" || Object.keys(content).length === 0) {
        return [`${operationKey(method, path)}: requestBody has no content type`];
      }
      return Object.entries(content)
        .filter(([, mediaType]) => mediaType === null || typeof mediaType !== "object")
        .map(
          ([mediaType]) =>
            `${operationKey(method, path)}: "${mediaType}" must be a Media Type Object`,
        );
    });

    const withoutBody = mutating
      .filter(({ operation }) => {
        const content = operation.requestBody?.content;
        return content === null || typeof content !== "object" || Object.keys(content).length === 0;
      })
      .map(({ method, path }) => operationKey(method, path));

    expect(
      NO_BODY_ACTIONS,
      "NO_BODY_ACTIONS must stay sorted so the allowlist diff is reviewable",
    ).toEqual([...NO_BODY_ACTIONS].sort());
    expect(
      MISSING_REQUEST_BODY_GAPS,
      "MISSING_REQUEST_BODY_GAPS must stay sorted so the defect ratchet is reviewable",
    ).toEqual([...MISSING_REQUEST_BODY_GAPS].sort());
    expect(
      NO_BODY_ACTIONS.filter((action) => MISSING_REQUEST_BODY_GAPS.includes(action)),
      "an action cannot be both a genuine no-body action and a known spec defect",
    ).toEqual([]);

    expect(
      withoutBody.sort(),
      "every POST/PUT/PATCH must publish a requestBody with at least one content type. " +
        "Add the body to src/services/system/api-spec-service.ts, or justify a genuine " +
        "no-body action in NO_BODY_ACTIONS. MISSING_REQUEST_BODY_GAPS lists only known " +
        "defects and must shrink to empty once they are documented.",
    ).toEqual([...NO_BODY_ACTIONS, ...MISSING_REQUEST_BODY_GAPS].sort());
    expect(malformedBodies, "declared request bodies must publish a valid content map").toEqual([]);
  });

  it("only references security schemes declared in components", async () => {
    const { spec } = await generateSpec();
    const declaredSchemes = new Set(Object.keys(spec.components.securitySchemes ?? {}));
    const requirements: Array<{ scope: string; requirement: Record<string, string[]> }> = [];

    for (const { method, path, operation } of collectOperations(spec)) {
      for (const requirement of operation.security ?? []) {
        requirements.push({ scope: operationKey(method, path), requirement });
      }
    }
    for (const requirement of spec.security ?? []) {
      requirements.push({ scope: "<document root>", requirement });
    }

    expect(
      declaredSchemes.size,
      "components.securitySchemes must declare at least one scheme",
    ).toBeGreaterThan(0);
    expect(
      requirements.length,
      "the curated document must declare security somewhere; otherwise this check is vacuous",
    ).toBeGreaterThan(0);

    const undeclared: string[] = [];
    const malformed: string[] = [];

    for (const { scope, requirement } of requirements) {
      for (const [name, scopes] of Object.entries(requirement)) {
        if (!declaredSchemes.has(name)) undeclared.push(`${scope} -> ${name}`);
        if (!Array.isArray(scopes)) {
          malformed.push(`${scope} -> ${name} must declare a scope array`);
        }
      }
    }

    expect(
      undeclared,
      "security requirements must reference components.securitySchemes entries",
    ).toEqual([]);
    expect(malformed, "each security requirement value must be an array of scopes").toEqual([]);
  });

  it("resolves every published permission id through the permission registry", async () => {
    const { meta } = await generateSpec();
    const rejected: string[] = [];
    const brokenMapping: string[] = [];

    for (const [namespace, published] of Object.entries(meta.endpointPermissions)) {
      if (published === "method-dependent") {
        const mapping = ENDPOINT_PERMISSIONS[namespace];
        if (typeof mapping !== "function") {
          brokenMapping.push(
            `${namespace} is published as method-dependent but maps to "${String(mapping)}"`,
          );
          continue;
        }
        for (const method of HTTP_METHODS) {
          const permissionId = mapping(method);
          if (!isAcceptablePermissionId(permissionId)) {
            rejected.push(`${namespace} ${method} -> ${permissionId}`);
          }
        }
        continue;
      }

      if (!isAcceptablePermissionId(published)) rejected.push(`${namespace} -> ${published}`);
    }

    const documentedWithoutMapping = meta.documentedNamespaces.filter(
      (namespace) => !(namespace in meta.endpointPermissions),
    );

    expect(brokenMapping, "a method-dependent entry must be backed by a function mapping").toEqual(
      [],
    );
    expect(
      rejected,
      "every published permission id must be accepted by isAcceptablePermissionId()",
    ).toEqual([]);
    expect(
      documentedWithoutMapping,
      "every documented namespace must resolve to a permission mapping",
    ).toEqual([]);
  });

  it("resolves every local $ref to a published component", async () => {
    const { spec } = await generateSpec();
    const refs = [...new Set(collectRefs(spec))].sort();

    expect(
      refs.length,
      "the curated document must publish at least one $ref for this check to be meaningful",
    ).toBeGreaterThan(0);

    const external: string[] = [];
    const unresolved: string[] = [];

    for (const ref of refs) {
      if (!ref.startsWith("#/components/")) {
        external.push(ref);
        continue;
      }
      if (resolveLocalRef(spec, ref) === undefined) unresolved.push(ref);
    }

    expect(external, "published $refs must be local component pointers (#/components/...)").toEqual(
      [],
    );
    expect(
      unresolved,
      "every $ref must resolve to an existing components.* entry; a renamed schema often breaks this",
    ).toEqual([]);
  });

  it("publishes a non-empty operation inventory with well-formed path items", async () => {
    const { spec } = await generateSpec();
    const operations = collectOperations(spec);

    expect(
      operations.length,
      "the curated document must publish at least one operation",
    ).toBeGreaterThan(0);

    const pathCounts = Object.entries(spec.paths).map(([path, pathItem]) => ({
      path,
      count: Object.keys(pathItem).filter((key) => HTTP_METHOD_SET.has(key.toUpperCase())).length,
    }));
    const summed = pathCounts.reduce((total, entry) => total + entry.count, 0);

    expect(
      operations.length,
      "operation count must match the sum over path items (no malformed path entry)",
    ).toBe(summed);

    const malformed: string[] = [];

    for (const [path, pathItem] of Object.entries(spec.paths)) {
      if (!path.startsWith("/")) malformed.push(`${path}: path must start with "/"`);
      if (pathItem === null || typeof pathItem !== "object") {
        malformed.push(`${path}: path item must be an object`);
        continue;
      }
      if (pathItem.parameters !== undefined && !Array.isArray(pathItem.parameters)) {
        malformed.push(`${path}: parameters must be an array`);
      }

      let operationCount = 0;
      for (const [key, value] of Object.entries(pathItem)) {
        if (HTTP_METHOD_SET.has(key.toUpperCase())) {
          operationCount++;
          if (key !== key.toLowerCase()) {
            malformed.push(`${path}: operation key "${key}" must be lowercase`);
          }
          if (value === null || typeof value !== "object") {
            malformed.push(`${path} ${key}: operation must be an object`);
          }
          continue;
        }
        if (!PATH_ITEM_METADATA_KEYS.has(key)) {
          malformed.push(`${path}: unexpected path-item key "${key}"`);
        }
      }

      if (operationCount === 0) malformed.push(`${path}: path item has no HTTP operations`);
    }

    expect(malformed, "path items must be well-formed OpenAPI Path Item Objects").toEqual([]);
  });
});
