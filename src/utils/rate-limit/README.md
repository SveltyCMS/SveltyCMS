# Rate-Limiting mit Redis-Fallback (Token-Bucket + adaptives Throttling)

Cluster-weites Rate-Limiting für SveltyCMS. Primär **Redis (atomares Token-Bucket)**, mit
nahtlosem **In-Memory-Fallback** und **adaptiver Kapazität** je nach Nutzerprofil.

## Architektur

```
src/utils/rate-limit/
├── token-bucket.ts     pure Token-Bucket-Mathematik (keine Abhängigkeiten)
├── adaptive.ts         Adaptive Kapazität nach tenantId/userId (Admin vs. Gast)
├── config.ts           Lädt/normalisiert RATE_LIMIT_* ENV-Parameter
├── redis-client.ts     Redis-Verbindungsmanager + Connection-Detector (Fail-open)
├── memory-store.ts     In-Memory-Fallback (bounded, LRU, Cleanup)
└── index.ts            Orchestrator: adapt → Redis → Memory-Fallback (öffentl. API)
```

Middleware-Hook: `src/hooks/handle-redis-rate-limit.ts` (integriert in `hooks.server.ts`,
schützt alle `/api`-Mutations nach der Authentifizierung).

## Algorithmus: Token-Bucket

Ein Bucket hat `capacity` (Max-Burst) und `refillPerSecond` (Refill-Rate).

- **Refill:** `tokens += elapsedSec * refillPerSecond`, auf `capacity` gedeckelt.
- **Allow:** wenn `tokens >= cost` → `tokens -= cost`, sonst **429** mit
  `Retry-After = ceil((cost - tokens) / refillPerSecond)`.
- Bei Ablehnung bleibt der Zustand UNVERÄNDERT (nur Refill), kein Double-Penalty.
- Redis nutzt ein atomares **Lua-Script** (`EVAL`), cluster-slot-sicher (1 Key).

### Ablauf eines Requests

1. `loadBaseRateLimitConfig()` liest die Basis aus ENV.
2. `computeAdaptiveBucket()` passt `capacity`/`refill` nach Profil an.
3. `rateLimit()` versucht **Redis** → bei Fehler/Timeout **Memory-Fallback** (mit Logging).
4. Hook setzt `X-RateLimit-*`-Header bzw. liefert **429** (`RATE_LIMITED`).

## Konfiguration (ENV-Variablen)

| Variable                     | Default       | Bedeutung                                            |
|------------------------------|---------------|------------------------------------------------------|
| `RATE_LIMIT_CAPACITY`        | 100           | Max-Burst / Bucket-Kapazität                          |
| `RATE_LIMIT_MAX_REQUESTS`    | 100           | Kompatibilitäts-Alias für `CAPACITY` (`NODE_ENV!=prod`: 1000) |
| `RATE_LIMIT_WINDOW_MS`       | 60000         | Fenster in ms (steuert abgeleitete Refill-Rate)       |
| `RATE_LIMIT_REFILL_PER_SEC`  | `capacity/windowSek` | Explizite Refill-Rate in Tokens/s (überschreibt Ableitung) |
| `RATE_LIMIT_REDIS_PING_MS`   | 30000         | Ping-Intervall des Redis-Detektors                    |
| `REDIS_URL`                  | `redis://127.0.0.1:6379` | Redis-Endpunkt                                        |

### Refill-Rate-Default

Wird `RATE_LIMIT_REFILL_PER_SEC` nicht gesetzt, füllt sich der Bucket **einmal pro Fenster**
komplett auf: `refillPerSecond = capacity / (windowMs / 1000)`.

### Adaptive Kapazität (Admin vs. Gast)

Multiplikator auf die Basis-Kapazität, je nach Profil:

| Profil                | Ermittlung                        | Multiplikator |
|-----------------------|-----------------------------------|---------------|
| Admin                 | `role=admin` / `isAdmin`          | 3.0×         |
| Staff/Editor          | `role=staff/editor/moderator`      | 2.0×        |
| Registrierter Gast    | `userId` vorhanden                | 1.0×       |
| Anonym (Bot-Fläche)   | kein `userId`                     | 0.5×       |

Zusätzlich skaliert ein Tenant mit gültiger (nicht `global`/`default`) Kennung mit **1.5×**
(Isolation). Ergebnis wird auf `>= 1` geklemmt. Die Refill-Rate skaliert proportional,
damit die Zeit bis „vollem Bucket“ konstant bleibt.

## Redis-Ausfall (Fail-open Fallback)

- `connect()` versucht einen Verbindungsaufbau (Timeout standardmäßig 1000 ms). Schlägt er
  fehl → Store wird `unavailable`.
- Der Ping-Detektor prüft Redis alle `RATE_LIMIT_REDIS_PING_MS`. Tritt während der Laufzeit
  ein Fehler auf (Verbindung weg, Timeout) → Store wird sofort `unavailable` und der nächste
  Request fällt in den **Memory-Fallback**. Redis kann später wieder „hochkommen“, ohne Neustart.
- **Fail-open:** Wenn weder Redis noch lokal verfügbar sind (unwahrscheinlich), wird der
  Request DURCHGELASSEN — Verfügbarkeit vor Block durch Fehler.
- Jeder Fallback wird geloggt (`[RedisRateLimit] ...`), Header zeigen den aktiven Store
  (`X-RateLimit-Scope: redis|memory`, `X-RateLimit-Redis: 1|0`).

## Endpunkte / Limits

- Nur `/api`-Pfade werden geschützt; `GET/HEAD/OPTIONS` sind frei (Brute-Force-Szenario
  sind Mutations).
- Ausgenommen: `/api/setup`, `/api/system/health`, `/api/testing`, `/favicon.ico`, `/.well-known`.
- Bucket-Schlüssel = `rl:<namespace>:<tenantId>:<cost>` (kein PII, Namespace enthält IP-Hash).

## Nutzung der Engine direkt

```ts
import { initRateLimiter, resetRateLimitStores, rateLimit } from "@utils/rate-limit";

await initRateLimiter(); // idempotent, fallback-sicher

const decision = await rateLimit({
  context: { tenantId: "acme", userId: "u1" },
  namespace: "api",           // Bucket-Isolation
  cost: 1,                    // z.B. 4 für sensible Endpunkte
});

if (!decision.allowed) {
  // 429 mit Retry-After = decision.retryAfterSeconds
}
```

## Tests

```
npx vitest run tests/unit/rate-limit
```

- `token-bucket.test.ts` — pure Bucket-Mathematik (Refill, Burst, Denial).
- `adaptive.test.ts` — Profil→Kapazitäts-Mapping.
- `redis-client.test.ts` — Connection-Detector (unerreichbarer Endpunkt → unavailable).
- `engine-fallback.test.ts` — Redis down → Memory-Fallback, Limits greifen weiter.
- `handle-redis-rate-limit.test.ts` — HTTP 429 (`RATE_LIMITED`) + Header.
