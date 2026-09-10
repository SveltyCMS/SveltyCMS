/**
 * @file src/utils/rate-limit/redis-client.ts
 * @description Redis-Verbindungsmanager + Connection-Detector fuer token-bucket.
 *
 * Verwaltet einen Lazy-Verbindungsaufbau zu Redis (node-redis v6) und erkennt
 * Ausfaelle. Bei Timeout/Fehler wird der Store als "unavailable" markiert und
 * der Aufrufer faellt auf den lokalen In-Memory-Speicher zurueck (mit Logging).
 *
 * SICHERHEIT/HARTEN:
 * - Fail-open: Wenn Redis nicht da ist, wird NICHT der Request blockiert —
 *   die Engine schaltet auf lokale Map um (der Verbindungs-Detektor ist das
 *   einzige Fenster; danach läuft alles im Speicher weiter).
 * - Kein PII: Keys enthalten nur gehashte Kennungen.
 */

import { createClient, type RedisClientType } from "redis";
import { logger } from "@utils/logger";

/** Lua-Script: atomarer Token-Bucket (single key, cluster-slot-sicher). */
const TOKEN_BUCKET_LUA = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refillPerSecond = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])

local tokens = redis.call('HGET', key, 'tokens')
local last = redis.call('HGET', key, 'last')

if not tokens then
  tokens = capacity
  last = now
else
  tokens = tonumber(tokens)
  last = tonumber(last)
end

local elapsed = math.max(0, now - last)
tokens = math.min(capacity, tokens + (elapsed / 1000) * refillPerSecond)
last = now

local allowed = 0
if tokens >= cost then
  tokens = tokens - cost
  allowed = 1
end

redis.call('HSET', key, 'tokens', tostring(tokens), 'last', tostring(last))
redis.call('PEXPIRE', key, 1800000)

local retry = 1
if allowed == 0 and refillPerSecond > 0 then
  retry = math.max(1, math.ceil((cost - tokens) / refillPerSecond))
end

return { allowed, tokens, retry }
`;

export type StoreStatus = "available" | "unavailable";

export interface RedisBasedBucketResult {
  /** true, wenn der Request durch darf. */
  allowed: boolean;
  /** Verbleibende Tokens im Bucket. */
  tokens: number;
  /** Sekunden bis wieder ein Token da ist (nur bei denied). */
  retryAfterSeconds: number;
}

export interface RedisClientOptions {
  url?: string;
  /** Verbindungs-Timeout in ms (Default 1000). */
  connectTimeoutMs?: number;
  /** Ping-Interval in ms, um Ausfaelle zu erkennen (Default 30000). */
  pingIntervalMs?: number;
}

const DEFAULT_PING_INTERVAL_MS = 30_000;

export class RedisRateLimitStore {
  private client: RedisClientType | null = null;
  private status: StoreStatus = "unavailable";
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private connecting: Promise<void> | null = null;
  private readonly options: RedisClientOptions;

  constructor(options: RedisClientOptions = {}) {
    this.options = options;
  }

  /** Aktueller Status, ohne Netzwerkzugriff. */
  getStatus(): StoreStatus {
    return this.status;
  }

  /** true, wenn wir glauben, dass Redis verfuegbar ist (optimistisch). */
  isAvailable(): boolean {
    return this.status === "available" && this.client !== null;
  }

  /**
   * Initiiert einen (idempotenten) Verbindungsaufbau. Fehlgeschlagene Versuche
   * markieren den Store als unavailable UND planen automatisch einen erneuten
   * Versuch ueber den Ping-Timer — Redis kann also wieder "hochkommen", ohne
   * dass die Engine einen Neustart braucht.
   */
  connect(): Promise<void> {
    if (this.connecting) return this.connecting;
    if (this.client) return Promise.resolve();

    this.connecting = this.establish();
    return this.connecting;
  }

  private async establish(): Promise<void> {
    const url = this.options.url || process.env.REDIS_URL || "redis://127.0.0.1:6379";
    const connectTimeout = this.options.connectTimeoutMs ?? 1000;

    try {
      const client = createClient({
        url,
        socket: {
          connectTimeout,
          reconnectStrategy: false, // selbst verwalten (Ping-Timer + Fail-open)
        },
      } as any);

      client.on("error", (err) => {
        this.markUnavailable(err);
      });

      await client.connect();
      await client.ping();

      this.client = client;
      this.status = "available";
      logger.once(
        "rl.redis.online",
        "info",
        `[RedisRateLimit] Redis verbunden (${url.split("@").pop()})`,
      );

      // Periodischer Ping: frueh erkennen, wenn Redis wegbricht.
      const interval = this.options.pingIntervalMs ?? DEFAULT_PING_INTERVAL_MS;
      this.pingTimer = setInterval(() => {
        void this.verifyHealth();
      }, interval);
      if (typeof (this.pingTimer as any)?.unref === "function") {
        (this.pingTimer as any).unref();
      }
    } catch (err: any) {
      this.markUnavailable(err);
      throw err;
    } finally {
      this.connecting = null;
    }
  }

  /** Live-Health-Check; bei Fehler sofort zu unavailable. */
  private async verifyHealth(): Promise<void> {
    if (!this.client) return;
    try {
      const pong = await Promise.race([
        this.client.ping(),
        new Promise((_, rej) => setTimeout(() => rej(new Error("Redis ping timeout")), 2000)),
      ]);
      if (pong !== "PONG") throw new Error("Unexpected redis ping reply");
    } catch (err) {
      this.markUnavailable(err);
    }
  }

  /** Markiert Redis als down und raeumt den Client auf. */
  private markUnavailable(err?: unknown): void {
    const wasAvailable = this.status === "available";
    this.status = "unavailable";
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (wasAvailable) {
      logger.warn(
        "[RedisRateLimit] Redis wurde unerreichbar — Engine faellt auf In-Memory zurueck:",
        (err as Error)?.message ?? err,
      );
    }
    // Client schliessen (best effort) fuer sauberen Retry im naechsten connect().
    if (this.client) {
      const c = this.client;
      this.client = null;
      void c.disconnect().catch(() => {});
    }
  }

  /**
   * Fuehrt einen atomaren Token-Bucket-Check/Consume in Redis aus.
   * Wirft bei Redis-Fehlern — der Aufrufer entscheidet ueber den Fallback.
   */
  async checkAndConsume(
    key: string,
    bucket: { capacity: number; refillPerSecond: number },
    cost = 1,
  ): Promise<RedisBasedBucketResult> {
    if (!this.isAvailable() || !this.client) {
      throw new Error("Redis unavailable");
    }
    try {
      const raw = (await this.client.eval(TOKEN_BUCKET_LUA, {
        keys: [key],
        arguments: [
          String(bucket.capacity),
          String(bucket.refillPerSecond),
          String(Date.now()),
          String(cost),
        ],
      })) as unknown[];

      const allowed = Number(raw[0]) === 1;
      const tokens = Number(raw[1]);
      const retryAfterSeconds = Number(raw[2]);
      return { allowed, tokens, retryAfterSeconds };
    } catch (err) {
      // Fehler hier = Redis-Ausfall waehrend der Anfrage → Fallback anstossem.
      this.markUnavailable(err);
      throw err;
    }
  }

  /** Sauberes Herunterfahren (fuer Tests / Shutdown). */
  async close(): Promise<void> {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    const c = this.client;
    this.client = null;
    this.status = "unavailable";
    if (c) await c.disconnect().catch(() => {});
  }
}
