/**
 * @file src/utils/sdk/edge-sdk.ts
 * @description Lightweight Edge-compatible SDK for SveltyCMS.
 * Designed to run in Vercel Edge, Cloudflare Workers, or any JS runtime.
 */

export interface EdgeSDKOptions {
  apiKey: string;
  host: string;
  tenantId?: string;
  timeout?: number;
  cache?: RequestCache;
}

export interface QueryOptions {
  limit?: number;
  skip?: number;
  sort?: string;
  filter?: Record<string, any>;
  populate?: string[];
  fields?: string[];
  language?: string;
}

export class SveltyCMSEdge {
  private apiKey: string;
  private host: string;
  private tenantId?: string;
  private timeout: number;
  private cache: RequestCache;

  constructor(options: EdgeSDKOptions) {
    this.apiKey = options.apiKey;
    this.host = options.host.replace(/\/$/, "");
    this.tenantId = options.tenantId;
    this.timeout = options.timeout || 5000;
    this.cache = options.cache || "default";
  }

  /**
   * Internal fetch wrapper with auth and tenant headers
   */
  private async _fetch(path: string, options: RequestInit = {}) {
    const url = `${this.host}${path}`;
    const headers = new Headers(options.headers);

    headers.set("Authorization", `Bearer ${this.apiKey}`);
    headers.set("Content-Type", "application/json");
    if (this.tenantId) {
      headers.set("X-Tenant-ID", this.tenantId);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
        cache: this.cache,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP Error ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Get entries from a collection
   */
  async getEntries(collection: string, options: QueryOptions = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.set("limit", options.limit.toString());
    if (options.skip) params.set("offset", options.skip.toString());
    if (options.sort) params.set("sort", options.sort);
    if (options.filter) params.set("filter", JSON.stringify(options.filter));
    if (options.populate) params.set("populate", options.populate.join(","));
    if (options.fields) params.set("fields", options.fields.join(","));
    if (options.language) params.set("lang", options.language);

    const query = params.toString();
    const path = `/api/collections/${collection}${query ? `?${query}` : ""}`;

    return this._fetch(path);
  }

  /**
   * Get a single entry by ID
   */
  async getEntry(
    collection: string,
    id: string,
    options: { populate?: string[]; lang?: string } = {},
  ) {
    const params = new URLSearchParams();
    if (options.populate) params.set("populate", options.populate.join(","));
    if (options.lang) params.set("lang", options.lang);

    const query = params.toString();
    const path = `/api/collections/${collection}/${id}${query ? `?${query}` : ""}`;

    return this._fetch(path);
  }

  /**
   * Execute a raw GraphQL query
   */
  async graphql(query: string, variables: Record<string, any> = {}) {
    return this._fetch("/api/graphql", {
      method: "POST",
      body: JSON.stringify({ query, variables }),
    });
  }
}

/**
 * Factory for the Edge SDK
 */
export function createEdgeClient(options: EdgeSDKOptions) {
  return new SveltyCMSEdge(options);
}
