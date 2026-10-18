/**
 * @file tests/integration/helpers/oidc-test-server.ts
 * @description In-process, RFC-shaped OpenID Provider for zero-mock SSO tests.
 *
 * Tests exercise the real `sso-session.ts` (real egress guard, real `safeFetch`,
 * real `node:crypto`) against a real HTTP peer on `127.0.0.1`. Nothing is
 * stubbed: discovery, JWKS, PKCE, token exchange and back-channel logout all
 * travel over TCP and are verified with the same code paths production uses.
 *
 * ### Endpoints
 * - `GET  /.well-known/openid-configuration` — discovery document
 * - `GET  /authorize` — issues a one-time authorization code (302 redirect)
 * - `POST /token` — validates PKCE + client credentials, returns an RS256 id_token
 * - `GET  /jwks` — public signing key (RSA-2048, kid `test-key`)
 * - `GET|POST /logout` — RP-initiated logout landing page
 *
 * ### Features:
 * - real RSA keypair + RS256 signing (`createSign`) and JWKS export
 * - single-use authorization codes with PKCE S256/plain validation
 * - request log for caching / call-count assertions
 * - `createIdToken` / `createLogoutToken` for signed negative-path fixtures
 * - socket-tracked shutdown so keep-alive clients cannot hang the runner
 */

import { createHash, createSign, generateKeyPairSync, randomUUID } from "node:crypto";
import type { KeyObject } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo, Socket } from "node:net";

export interface OidcTestServerOptions {
  /** Client id accepted by `/authorize` and `/token`. */
  clientId?: string;
  /** Client secret accepted by `/token` (confidential client). */
  clientSecret?: string;
  /** Default `sub` claim for minted tokens. */
  subject?: string;
  /** `kid` advertised in the JWKS and JWT headers. */
  kid?: string;
  /** Artificial latency on `/token` (default 0). */
  tokenDelayMs?: number;
}

export interface OidcRequestLogEntry {
  method: string;
  path: string;
  /** Raw request body (POST only, capped at 64 KiB). */
  body: string;
}

export interface IssueCodeOptions {
  redirectUri: string;
  codeChallenge?: string;
  codeChallengeMethod?: "S256" | "plain";
  nonce?: string;
  subject?: string;
  claims?: Record<string, unknown>;
  /** Code lifetime in ms (default 60_000). */
  ttlMs?: number;
}

export interface CreateIdTokenOptions {
  subject?: string;
  audience?: string;
  nonce?: string;
  claims?: Record<string, unknown>;
  ttlSeconds?: number;
  /** Override `iss` (negative tests). */
  issuer?: string;
}

export interface CreateLogoutTokenOptions {
  /** `null` omits the claim (defaults to the server subject). */
  subject?: string | null;
  /** `null`/omitted omits the claim. */
  sid?: string | null;
  audience?: string;
  ttlSeconds?: number;
  /** Override `iss` (unknown-issuer tests). */
  issuer?: string;
  /** Omit the backchannel-logout event claim (negative tests). */
  includeEvents?: boolean;
  /** Override `iat` (epoch seconds) for replay-window tests. */
  iat?: number;
  /** Include a nonce — invalid for logout tokens (negative tests). */
  nonce?: string;
}

interface AuthorizationCodeRecord {
  redirectUri: string;
  clientId: string;
  codeChallenge?: string;
  codeChallengeMethod: "S256" | "plain";
  nonce?: string;
  subject: string;
  claims: Record<string, unknown>;
  expiresAt: number;
}

const BACKCHANNEL_EVENT = "http://schemas.openid.net/event/backchannel-logout";
const MAX_BODY_BYTES = 64 * 1024;

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function sendJson(
  res: ServerResponse,
  status: number,
  payload: Record<string, unknown>,
  headers: Record<string, string> = {},
): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    Pragma: "no-cache",
    ...headers,
  });
  res.end(body);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error("request body too large");
    chunks.push(buffer);
  }

  return Buffer.concat(chunks).toString("utf8");
}

/**
 * A real OIDC provider listening on an ephemeral loopback port.
 *
 * Start it with `OidcTestServer.start()`, then register the exact origin with
 * `allowTestEgressOrigin(server.issuer)` so the production SSRF guard can reach
 * it (loopback is blocked for every other origin).
 */
export class OidcTestServer {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly subject: string;
  readonly kid: string;
  readonly requests: OidcRequestLogEntry[] = [];

  private readonly tokenDelayMs: number;
  private readonly privateKey: KeyObject;
  private readonly publicKey: KeyObject;
  private readonly codes = new Map<string, AuthorizationCodeRecord>();
  private readonly sockets = new Set<Socket>();
  private readonly server;
  private issuerUrl = "";

  private constructor(options: OidcTestServerOptions) {
    this.clientId = options.clientId ?? "sveltcms-test-client";
    this.clientSecret = options.clientSecret ?? "sveltcms-test-secret";
    this.subject = options.subject ?? "user-123";
    this.kid = options.kid ?? "test-key";
    this.tokenDelayMs = options.tokenDelayMs ?? 0;

    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    this.privateKey = privateKey;
    this.publicKey = publicKey;

    this.server = createServer((req, res) => {
      void this.handle(req, res);
    });
    this.server.on("connection", (socket) => {
      this.sockets.add(socket);
      socket.on("close", () => this.sockets.delete(socket));
    });
  }

  static async start(options: OidcTestServerOptions = {}): Promise<OidcTestServer> {
    const instance = new OidcTestServer(options);

    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error) => reject(err);
      instance.server.once("error", onError);
      instance.server.listen(0, "127.0.0.1", () => {
        instance.server.off("error", onError);
        resolve();
      });
    });

    const address = instance.server.address() as AddressInfo;
    instance.issuerUrl = `http://127.0.0.1:${address.port}`;
    return instance;
  }

  get issuer(): string {
    return this.issuerUrl;
  }

  get discoveryUrl(): string {
    return `${this.issuerUrl}/.well-known/openid-configuration`;
  }

  get authorizationEndpoint(): string {
    return `${this.issuerUrl}/authorize`;
  }

  get tokenEndpoint(): string {
    return `${this.issuerUrl}/token`;
  }

  get jwksUri(): string {
    return `${this.issuerUrl}/jwks`;
  }

  get endSessionEndpoint(): string {
    return `${this.issuerUrl}/logout`;
  }

  /** Number of requests observed for an exact path. */
  countRequests(path: string): number {
    return this.requests.filter((entry) => entry.path === path).length;
  }

  resetRequests(): void {
    this.requests.length = 0;
  }

  /** Mint a one-time authorization code (bypasses the browser redirect). */
  issueAuthorizationCode(options: IssueCodeOptions): string {
    const code = randomUUID();
    this.codes.set(code, {
      redirectUri: options.redirectUri,
      clientId: this.clientId,
      codeChallenge: options.codeChallenge,
      codeChallengeMethod: options.codeChallengeMethod ?? "S256",
      nonce: options.nonce,
      subject: options.subject ?? this.subject,
      claims: options.claims ?? {},
      expiresAt: Date.now() + (options.ttlMs ?? 60_000),
    });
    return code;
  }

  /** Sign a real RS256 id_token with the provider key. */
  createIdToken(options: CreateIdTokenOptions = {}): string {
    const now = Math.floor(Date.now() / 1000);
    return this.signJwt({
      iss: options.issuer ?? this.issuerUrl,
      sub: options.subject ?? this.subject,
      aud: options.audience ?? this.clientId,
      iat: now,
      exp: now + (options.ttlSeconds ?? 300),
      ...(options.nonce ? { nonce: options.nonce } : {}),
      ...options.claims,
    });
  }

  /** Sign an OIDC Back-Channel Logout token (RS256). */
  createLogoutToken(options: CreateLogoutTokenOptions = {}): string {
    const now = Math.floor(Date.now() / 1000);
    const subject = options.subject === undefined ? this.subject : options.subject;
    const payload: Record<string, unknown> = {
      iss: options.issuer ?? this.issuerUrl,
      aud: options.audience ?? this.clientId,
      iat: options.iat ?? now,
      exp: now + (options.ttlSeconds ?? 300),
      jti: randomUUID(),
    };

    if (subject !== null) payload.sub = subject;
    if (options.sid) payload.sid = options.sid;
    if (options.nonce) payload.nonce = options.nonce;
    if (options.includeEvents !== false) {
      payload.events = { [BACKCHANNEL_EVENT]: {} };
    }

    return this.signJwt(payload);
  }

  async close(): Promise<void> {
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();

    await new Promise<void>((resolve) => {
      this.server.close(() => resolve());
    });
  }

  private signJwt(payload: Record<string, unknown>): string {
    const header = { alg: "RS256", typ: "JWT", kid: this.kid };
    const input = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
    const signer = createSign("RSA-SHA256");
    signer.update(input);
    signer.end();
    return `${input}.${signer.sign(this.privateKey).toString("base64url")}`;
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method ?? "GET";
    const url = new URL(req.url ?? "/", this.issuerUrl || "http://127.0.0.1");

    try {
      const body = method === "POST" ? await readBody(req) : "";
      this.requests.push({ method, path: url.pathname, body });

      if (method === "GET" && url.pathname === "/.well-known/openid-configuration") {
        this.sendDiscovery(res);
        return;
      }
      if (method === "GET" && url.pathname === "/jwks") {
        this.sendJwks(res);
        return;
      }
      if (method === "GET" && url.pathname === "/authorize") {
        this.handleAuthorize(res, url);
        return;
      }
      if (method === "POST" && url.pathname === "/token") {
        await this.handleToken(res, body);
        return;
      }
      if ((method === "GET" || method === "POST") && url.pathname === "/logout") {
        res.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store" });
        res.end("<html><body>Signed out</body></html>");
        return;
      }

      sendJson(res, 404, { error: "not_found" });
    } catch (err) {
      sendJson(res, 500, {
        error: "server_error",
        error_description: err instanceof Error ? err.message : "unknown error",
      });
    }
  }

  private sendDiscovery(res: ServerResponse): void {
    sendJson(res, 200, {
      issuer: this.issuerUrl,
      authorization_endpoint: this.authorizationEndpoint,
      token_endpoint: this.tokenEndpoint,
      jwks_uri: this.jwksUri,
      end_session_endpoint: this.endSessionEndpoint,
      response_types_supported: ["code"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["RS256"],
      scopes_supported: ["openid", "profile", "email"],
      code_challenge_methods_supported: ["S256", "plain"],
      token_endpoint_auth_methods_supported: ["client_secret_post"],
    });
  }

  private sendJwks(res: ServerResponse): void {
    const jwk = this.publicKey.export({ format: "jwk" });
    sendJson(res, 200, {
      keys: [{ ...jwk, kid: this.kid, use: "sig", alg: "RS256" }],
    });
  }

  private handleAuthorize(res: ServerResponse, url: URL): void {
    const clientId = url.searchParams.get("client_id");
    const redirectUri = url.searchParams.get("redirect_uri");
    const codeChallenge = url.searchParams.get("code_challenge") ?? undefined;
    const method = url.searchParams.get("code_challenge_method");

    if (clientId !== this.clientId || !redirectUri) {
      sendJson(res, 400, { error: "invalid_request" });
      return;
    }

    const code = this.issueAuthorizationCode({
      redirectUri,
      codeChallenge,
      codeChallengeMethod: method === "plain" ? "plain" : "S256",
      nonce: url.searchParams.get("nonce") ?? undefined,
    });

    const target = new URL(redirectUri);
    target.searchParams.set("code", code);
    const state = url.searchParams.get("state");
    if (state) target.searchParams.set("state", state);

    res.writeHead(302, { Location: target.toString(), "Cache-Control": "no-store" });
    res.end();
  }

  private async handleToken(res: ServerResponse, rawBody: string): Promise<void> {
    if (this.tokenDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.tokenDelayMs));
    }

    const params = new URLSearchParams(rawBody);
    const code = params.get("code") ?? "";
    const record = this.codes.get(code);

    if (params.get("grant_type") !== "authorization_code") {
      sendJson(res, 400, { error: "unsupported_grant_type" });
      return;
    }
    if (!record) {
      sendJson(res, 400, { error: "invalid_grant", error_description: "unknown code" });
      return;
    }
    if (Date.now() > record.expiresAt) {
      this.codes.delete(code);
      sendJson(res, 400, { error: "invalid_grant", error_description: "expired code" });
      return;
    }
    if (params.get("redirect_uri") !== record.redirectUri) {
      sendJson(res, 400, { error: "invalid_grant", error_description: "redirect_uri mismatch" });
      return;
    }
    if (params.get("client_id") !== record.clientId) {
      sendJson(res, 400, { error: "invalid_client", error_description: "client_id mismatch" });
      return;
    }
    if (this.clientSecret && params.get("client_secret") !== this.clientSecret) {
      sendJson(res, 401, { error: "invalid_client", error_description: "bad client secret" });
      return;
    }
    if (record.codeChallenge && !this.pkceMatches(record, params.get("code_verifier"))) {
      sendJson(res, 400, { error: "invalid_grant", error_description: "PKCE verification failed" });
      return;
    }

    // Codes are single-use; the record is consumed only after every check passes.
    this.codes.delete(code);

    const idToken = this.createIdToken({
      subject: record.subject,
      audience: record.clientId,
      nonce: record.nonce,
      claims: record.claims,
    });

    sendJson(res, 200, {
      access_token: randomUUID(),
      token_type: "Bearer",
      expires_in: 3600,
      id_token: idToken,
    });
  }

  private pkceMatches(record: AuthorizationCodeRecord, verifier: string | null): boolean {
    if (!verifier) return false;
    if (record.codeChallengeMethod === "plain") return verifier === record.codeChallenge;

    const derived = createHash("sha256").update(verifier).digest("base64url");
    return derived === record.codeChallenge;
  }
}
