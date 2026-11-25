/**
 * @file packages/sdk/src/index.ts
 * @description Typed headless client SDK for SveltyCMS REST, GraphQL, drafts, revisions, and temporal reads.
 *
 * Features:
 * - Zero SvelteKit or server runtime dependencies (works in Next.js, Astro, Nuxt, SvelteKit, Bun, Node)
 * - Typed collection CRUD (`list`, `findById`, `create`, `update`, `delete`)
 * - Optimistic locking (`If-Match`), `Idempotency-Key` retries, and temporal reads (`?asOf=`)
 * - Revision listing/restoration and staged draft rollback support
 * - Built-in typed GraphQL client with `SveltyClientError` normalization
 */

export interface SveltyClientConfig {
  /** Base origin (e.g. `"https://cms.example.com"` or `"http://127.0.0.1:4173"`). */
  baseUrl: string;
  /** Bearer API key or session token sent via `Authorization: Bearer ...`. */
  token?: string;
  /** Optional tenant header sent as `x-tenant-id`. */
  tenantId?: string;
  /** Custom `fetch` implementation (defaults to `globalThis.fetch`). */
  fetch?: typeof globalThis.fetch;
  /** Additional default headers attached to every outgoing request. */
  headers?: Record<string, string>;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: { code?: string; message?: string; details?: unknown };
}

export interface PaginatedItems<T> {
  items: T[];
  total?: number;
  page?: number;
  limit?: number;
  nextCursor?: string | null;
}

export interface CollectionListOptions {
  page?: number;
  limit?: number;
  sortField?: string;
  sortDirection?: "asc" | "desc";
  filter?: Record<string, unknown>;
  fields?: string[];
  populate?: string[];
  publicationFilter?: "published" | "draft" | "all";
  bypassCache?: boolean;
}

export interface CollectionReadOptions {
  populate?: string[];
  publicationFilter?: "published" | "draft" | "all";
  bypassCache?: boolean;
  /** Temporal point-read selector: integer revision number (`3`) or ISO-8601 timestamp. */
  asOf?: string | number;
}

export interface CollectionCreateOptions {
  /** Optional caller-supplied `Idempotency-Key` header cached for 24 hours on retry. */
  idempotencyKey?: string;
}

export interface CollectionUpdateOptions {
  /** Expected `updatedAt` token or ETag sent via `If-Match` for optimistic concurrency control. */
  ifMatch?: string | number;
}

export interface CollectionDeleteOptions {
  permanent?: boolean;
}

export interface GraphqlResponse<TData = Record<string, unknown>> {
  data?: TData;
  errors?: Array<{ message: string; extensions?: Record<string, unknown> }>;
}

export class SveltyClientError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, status: number, code = "REQUEST_FAILED", details?: unknown) {
    super(message);
    this.name = "SveltyClientError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface SveltyCollectionClient<
  TEntry extends Record<string, unknown> = Record<string, unknown>,
> {
  list(options?: CollectionListOptions): Promise<PaginatedItems<TEntry>>;
  findById(id: string, options?: CollectionReadOptions): Promise<TEntry | null>;
  create(data: Partial<TEntry>, options?: CollectionCreateOptions): Promise<TEntry>;
  update(id: string, data: Partial<TEntry>, options?: CollectionUpdateOptions): Promise<TEntry>;
  delete(
    id: string,
    options?: CollectionDeleteOptions,
  ): Promise<{ deleted?: boolean; [k: string]: unknown }>;
  getRevisions(id: string): Promise<PaginatedItems<Record<string, unknown>>>;
  restoreRevision(id: string, version: number, options?: CollectionUpdateOptions): Promise<TEntry>;
  rollbackDraft(id: string, version: number): Promise<Record<string, unknown>>;
}

export class SveltyClient {
  private readonly baseUrl: string;
  private readonly token?: string;
  private readonly tenantId?: string;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly defaultHeaders: Record<string, string>;

  constructor(config: SveltyClientConfig) {
    if (!config?.baseUrl || typeof config.baseUrl !== "string") {
      throw new Error("SveltyClient requires a non-empty baseUrl.");
    }
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.token = config.token;
    this.tenantId = config.tenantId;
    this.fetchImpl = config.fetch ?? globalThis.fetch;
    this.defaultHeaders = { ...config.headers };
  }

  private buildHeaders(extra?: Record<string, string | undefined>): Record<string, string> {
    const out: Record<string, string> = { ...this.defaultHeaders };
    if (this.token) out.Authorization = `Bearer ${this.token}`;
    if (this.tenantId) out["x-tenant-id"] = this.tenantId;
    if (extra) {
      for (const [key, val] of Object.entries(extra)) {
        if (val !== undefined) out[key] = val;
      }
    }
    return out;
  }

  private async request<T>(
    path: string,
    init: {
      method: "GET" | "POST" | "PATCH" | "DELETE";
      query?: URLSearchParams;
      body?: unknown;
      headers?: Record<string, string | undefined>;
    },
  ): Promise<T> {
    const qs = init.query && init.query.toString().length > 0 ? `?${init.query.toString()}` : "";
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}${qs}`;
    const headers = this.buildHeaders({
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    });

    const response = await this.fetchImpl(url, {
      method: init.method,
      headers,
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });

    const text = await response.text();
    let parsed: Record<string, unknown> | null = null;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text) as Record<string, unknown>;
      } catch {
        parsed = null;
      }
    }

    if (!response.ok) {
      const errObj = parsed?.error as
        | { code?: string; message?: string; details?: unknown }
        | undefined;
      const msg =
        errObj?.message ||
        (typeof parsed?.message === "string" ? parsed.message : undefined) ||
        `SveltyCMS request failed with HTTP ${response.status}`;
      const code =
        errObj?.code ||
        (typeof parsed?.code === "string" ? parsed.code : undefined) ||
        `HTTP_${response.status}`;
      throw new SveltyClientError(msg, response.status, code, errObj?.details ?? parsed?.details);
    }

    if (parsed && typeof parsed === "object" && "data" in parsed && "success" in parsed) {
      return parsed.data as T;
    }
    return parsed as unknown as T;
  }

  collection<TEntry extends Record<string, unknown> = Record<string, unknown>>(
    collectionId: string,
  ): SveltyCollectionClient<TEntry> {
    const encodedCol = encodeURIComponent(collectionId);
    const basePath = `/api/collections/${encodedCol}`;

    return {
      list: async (options: CollectionListOptions = {}) => {
        const query = new URLSearchParams();
        if (options.page !== undefined) query.set("page", String(options.page));
        if (options.limit !== undefined) query.set("limit", String(options.limit));
        if (options.sortField) query.set("sortField", options.sortField);
        if (options.sortDirection) query.set("sortDirection", options.sortDirection);
        if (options.filter) query.set("filter", JSON.stringify(options.filter));
        if (options.fields?.length) query.set("fields", options.fields.join(","));
        if (options.populate?.length) query.set("populate", options.populate.join(","));
        if (options.publicationFilter) query.set("publicationFilter", options.publicationFilter);
        if (options.bypassCache) query.set("refresh", "true");
        return this.request<PaginatedItems<TEntry>>(basePath, { method: "GET", query });
      },

      findById: async (id: string, options: CollectionReadOptions = {}) => {
        const query = new URLSearchParams();
        if (options.populate?.length) query.set("populate", options.populate.join(","));
        if (options.publicationFilter) query.set("publicationFilter", options.publicationFilter);
        if (options.bypassCache) query.set("refresh", "true");
        if (options.asOf !== undefined) query.set("asOf", String(options.asOf));
        return this.request<TEntry | null>(`${basePath}/${encodeURIComponent(id)}`, {
          method: "GET",
          query,
        });
      },

      create: async (data: Partial<TEntry>, options: CollectionCreateOptions = {}) => {
        return this.request<TEntry>(basePath, {
          method: "POST",
          body: data,
          headers: options.idempotencyKey
            ? { "Idempotency-Key": options.idempotencyKey }
            : undefined,
        });
      },

      update: async (id: string, data: Partial<TEntry>, options: CollectionUpdateOptions = {}) => {
        return this.request<TEntry>(`${basePath}/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: data,
          headers:
            options.ifMatch !== undefined ? { "If-Match": String(options.ifMatch) } : undefined,
        });
      },

      delete: async (id: string, options: CollectionDeleteOptions = {}) => {
        const query = new URLSearchParams();
        if (options.permanent) query.set("permanent", "true");
        return this.request<{ deleted?: boolean; [k: string]: unknown }>(
          `${basePath}/${encodeURIComponent(id)}`,
          { method: "DELETE", query },
        );
      },

      getRevisions: async (id: string) => {
        return this.request<PaginatedItems<Record<string, unknown>>>(
          `${basePath}/${encodeURIComponent(id)}/revisions`,
          { method: "GET" },
        );
      },

      restoreRevision: async (
        id: string,
        version: number,
        options: CollectionUpdateOptions = {},
      ) => {
        return this.request<TEntry>(
          `${basePath}/${encodeURIComponent(id)}/revisions/${version}/restore`,
          {
            method: "POST",
            headers:
              options.ifMatch !== undefined ? { "If-Match": String(options.ifMatch) } : undefined,
          },
        );
      },

      rollbackDraft: async (id: string, version: number) => {
        return this.request<Record<string, unknown>>(
          `${basePath}/${encodeURIComponent(id)}/drafts/rollback`,
          {
            method: "POST",
            body: { version },
          },
        );
      },
    };
  }

  async graphql<
    TData = Record<string, unknown>,
    TVariables extends Record<string, unknown> = Record<string, unknown>,
  >(
    query: string,
    variables?: TVariables,
    operationName?: string,
  ): Promise<GraphqlResponse<TData>> {
    return this.request<GraphqlResponse<TData>>("/api/graphql", {
      method: "POST",
      body: {
        query,
        ...(variables ? { variables } : {}),
        ...(operationName ? { operationName } : {}),
      },
    });
  }
}

export function createSveltyClient(config: SveltyClientConfig): SveltyClient {
  return new SveltyClient(config);
}
