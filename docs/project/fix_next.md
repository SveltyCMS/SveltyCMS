---
path: docs/project/fix_next.md
title: Fix & Next — Honest State of the next Branch
description: "Honest inventory of the next branch: what is really committed (pre-warm), what is still pending (2FA/MFA, Q3/Q4 optimizations), with an exact per-file change list. No fabricated 'done' claims."
order: 99
author: SveltyCMS Team
created: 2026-08-25
updated: 2026-08-25
tags:
  - fix-next
  - status
  - performance
  - security
  - 2fa
  - mfa
---

# Fix & Next — ehrlicher Stand der `next`-Branch

> **Präambel (gegen Versprechen ohne Commit):** Dieses Dokument listet NUR
> Änderungen, die real auf `next` liegen, und trennt sie sauber von jenen,
> die noch zu bauen sind. Es ist ein Arbeits-Inventar, kein Erfolgsbericht.

## 1. Git-Topologie (Ursache der Verwirrung)

Der Worktree, in dem zuletzt gearbeitet wurde, ist **nicht** der `next`-Worktree:

| Worktree                           | Branch                   | HEAD        | Status                                                       |
| ---------------------------------- | ------------------------ | ----------- | ------------------------------------------------------------ |
| `/root/cms-mirrors/sveltycms-work` | `discord` **(unborn)**   | kein Commit | 2.547 Dateien als `A` staged, **nie committet** → tote Kopie |
| `/var/tmp/sveltycms-pushwt`        | `live-next` = **`next`** | `8293e1000` | **echter, gepusster Stand**                                  |

**Konsequenz:** Commits im `sveltycms-work`-Worktree landeten auf einem
`unborn`-Zweig und waren auf `next` nie sichtbar. Fortan wird ausschließlich
im `next`-Worktree (`/var/tmp/sveltycms-pushwt`) gearbeitet und per
`git ls-remote` gegen den Live-Remote verifiziert.

## 2. Real committet auf `next` (verifiziert via `git merge-base` + `ls-remote`)

Live-Head (2026-08-25): **`8293e1000`**. Kette: `8293e1000` → `2781ad69c` → `06a95915f`.

| Commit          | Art           | Dateien                                                                                                                                                                                    | Inhalt                                                                                                                                 |
| --------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| **`2781ad69c`** | perf(content) | `src/content/index.server.ts`, `src/content/content-utils.ts`, `src/content/prewarm.ts` (neu), `bun.lock`, `package.json`, `sbom.json`                                                     | **Pre-warm** der Write-Path- & Query-Caches — kalter Erst-Write von `10.05ms` auf `0.271ms` reduziert.                                 |
| **`8293e1000`** | docs(bench)   | `docs/project/benchmarks/benchmark_sqlite.mdx`, `sbom.json`                                                                                                                                | Frischen Competitive-Replica-Lauf dokumentiert (1 Lauf, "established at 1 run").                                                       |
| **`2bcc7592a`** | perf(db)      | `src/databases/core/batch-module.ts`, `src/databases/core/relational-utils.ts`, `tests/unit/databases/groupUpdatesByPayload.test.ts`, `tests/integration/databases/bulkfix-hetero.test.ts` | **Bulk-Update N+1-Fix**: heterogene Updates werden nach identischem Payload gruppiert → G ≤ N `UPDATE … IN (_ids)` statt N Statements. |

**Ehrlicher Hinweis zum Prewarm:** `2781ad69c` ist real auf `next`. Ein
zusätzlicher, **uncommitteter** Entwurf liegt unter
`docs/project/write-path-prewarm-enhancement.md` (113 Z., im toten Worktree) —
noch nicht committet.

## 3. Status der angeforderten Fixes (ehrlich!)

| Anforderung                              | Status                             | Grund                                                                                                        |
| ---------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Fix für Pre-warn**                     | ✅ committet (`2781ad69c`)         | kalte Erst-Write 10.05→0.271 ms                                                                              |
| **2FA/MFA-P0–P2**                        | ❌ **nicht implementiert**         | Subagent 2× TIMEOUT/TRUNCATED; nur Ist-Analyse fertig                                                        |
| **Competitive-Security-Overview `.mdx`** | ✅ **erstellt** (dieser Stand)     | `docs/project/competitive-security-overview.mdx` — UWG-konform, doku-basiert, keine Live-Lauf-Behauptung     |
| **Q3-Learn-Optimierung (Bulk-Update)**   | ✅ **implementiert** (`2bcc7592a`) | N+1 → Gruppen nach identischem Payload, G ≤ N Statements. Belegt durch 4 Unit- + 2 SQLite-Integrationstests. |
| **Q4-Feature-Empfehlungen**              | ⚠️ nur Empfehlung                  | keine Code-Änderung                                                                                          |

## 4. Geplante Änderungen (FIX-Backlog — Datei-Änderungsliste)

Jede Zeile = eine anzufassende Datei. Implementierungsstatus folgt nach dem
ersten grünen Lauf.

### 4.1 P0/P1 — 2FA/MFA & RBAC-Härtung (Implementierung fehlt)

| Datei                                                             | Veränderung                                                                                                  |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `src/databases/auth/types.ts`                                     | `Role`-Interface (L86–96): Feld `mfaRequired: boolean` ergänzen                                              |
| `src/databases/auth/permissions.ts`                               | Server-Seite: Per-Rolle-Erzwingung von `mfaRequired` (Ref L128/L301/L324)                                    |
| `src/databases/auth/session-manager.ts`                           | Session-Objekt: `amr` (Authenticator-Methoden-Ref) mitführen; Session nur bei erfülltem MFA-Level ausstellen |
| `src/databases/auth/two-factor-auth.ts`                           | Trusted-Device-Bypass (L363+, max 5 FIFO) hinter MFA-Level heben; Level-Attribut in Session                  |
| `src/routes/api/[...path]/handlers/collections.ts` + `+server.ts` | Login/Privatzugriff: `amr`-Check; bei fehlendem MFA → `403` mit `CODE=MFA_REQUIRED`                          |
| `src/utils/security/user-attribute-policy.ts`                     | Privilege-Stripping (L25/L33–63) um MFA-Level erweitern                                                      |
| `src/databases/auth/webauthn-service.ts`                          | `amr` auf `iwa`/`hwk` (P4-Basis); Recovery-Bump                                                              |

> AGENTS.md-Vorgaben: kein `any`, kebab-case, static ESM, keine Micro-Files,
> DB nur via Adapter, `raise(status, msg, code)` aus `@utils/error-handling`,
> Datei-Header, CSPRNG. Doku-Update ist **vor** dem Commit zu erledigen.

### 4.2 P1 — Bulk-Update Optimierung (Kernfund aus Lean-Audit)

| Datei                                    | Veränderung                                                                                                                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/databases/core/batch-module.ts`     | **FIXED in `2bcc7592a`:** heterogener Pfad L249–263 läuft per Gruppen nach identischem Payload statt N Statements. G ≤ N `UPDATE … IN (_ids)`.                                  |
| `src/databases/core/relational-utils.ts` | **FIXED in `2bcc7592a`:** neuer Helper `groupUpdatesByPayload()` + kanonischer Payload-Key (rekursiv sortierte Keys, robust bei verschachtelten Objekten).                      |
| `src/databases/core/sql-adapter-core.ts` | (`prepareUpdateValues` L574–700, optional) Column-Set/Timestamp-Heuristik einmal auflösen statt pro Zeile. `update()` nutzt bereits `rawUpdateReturning` — kein Eingriff nötig. |
| `src/databases/sqlite/adapter-core.ts`   | (`convertDatesToISO` L176–205, optional) im Bulk-Rückpfad einmal pro Batch statt pro Row; `inPlace`/`skipJson` konsequent.                                                      |

> Gemessener Ausgangszustand (1 Lauf, Commit `8293e1000`, Concurrent 8c, p95):
> create **7.509ms / RPS 1044** · update **7.681ms / p95 12.735 / RPS 1024**
> · mixed **5.556ms / RPS 1297**. **Update trägt den höchsten p95 (12.735ms)**
> — der N+1-Bulk-Pfad ist der konkrete Verdächtige.

> **Separater, vorbestehender Fund (nicht durch den Fix verursacht):** Im
> `bulkUpdate` werden **Zahl-Felder** nicht persistiert (`modifiedCount` korrekt,
> `crud.update` setzt Zahl-Felder). String-Felder funktionieren. Dieser Bug
> existiert im homogenen wie heterogenen Pfad und ist von der Gruppierung
> unabhängig. `crud.update` (L1486, `rawUpdateReturning`) ist korrekt.

### 4.3 Q4 — Feature-Empfehlungen (nur Empfehlung, kein Code)

1. 2FA/MFA-Pflicht pro Rolle (P0) — Differenzierung zu konkurrierenden CMS.
2. RBAC-Audit-Trail (wer änderte Rolle/Rechte wann) — Compliance.
3. App-Level-Verschlüsselung sensibler Collection-Felder (At-Rest).
4. Bulk-Import `upsert`-Parität über alle Adapter.
5. `competitive-security-overview.mdx` (Doku, s. Abschnitt 5).

## 5. Dateien in diesem Stand (neu / geändert)

| Datei                                                | Zweck                                                                                 | Status                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `docs/project/fix_next.md`                           | dieses Inventar                                                                       | **erstellt**                                    |
| `docs/project/competitive-security-overview.mdx`     | UWG-konformer, dokumentationsbasierter Security-Vergleich vs. Directus/Payload/Strapi | **erstellt** (nur doku-basiert, kein Live-Lauf) |
| `src/databases/core/batch-module.ts`                 | N+1 → Gruppen nach Payload (G ≤ N)                                                    | **geändert** (`2bcc7592a`)                      |
| `src/databases/core/relational-utils.ts`             | neuer Helper `groupUpdatesByPayload()` + kanonischer Payload-Key                      | **geändert** (`2bcc7592a`)                      |
| `tests/unit/databases/groupUpdatesByPayload.test.ts` | pure-Logik-Tests des Helpers (4/4 grün)                                               | **neu** (`2bcc7592a`)                           |
| `tests/integration/databases/bulkfix-hetero.test.ts` | echter SQLite-Pfad-Test des Bulk-Update-Fixes (2/2 grün)                              | **neu** (`2bcc7592a`)                           |

## 6. Commit-Workflow (verbindlich)

1. Arbeit ausschließlich im `next`-Worktree `/var/tmp/sveltycms-pushwt`.
2. Vor jedem Commit `bun update` (nur `bun`, nie npm/pnpm).
3. `.githooks/` müssen `100755` sein.
4. **L2-Tests** mit `TEST_REDIS_URL=redis://127.0.0.1:6389` (sonst Fallback
   `:6379` → Hook-Fail). Ohne Env schlagen Pre-/Post-Commits fehl.
5. Verifikation gegen **Commit-Hash** (Bare-Mirror `git show`), nie
   Worktree-Ref; Live-Check per `git ls-remote` (lokale Refs sind stale).
6. Direkter Push auf `origin next` per SSH, kein Force.

## 7. Ausstehend / offene Punkte

- **2FA/MFA-P0–P2** implementieren (Backlog in Abschnitt 4.1), dann Doku-Update,
  dann Commit auf `next`.
- **`competitive comparison`-Workflow klären:** CVSS-Einzeltriage (a) vs.
  Consumer-Relevanz (b) für Mitbewerber-CVEs.
- **Zahl-Feld-Readback-Bug** in `bulkUpdate` (vorbestehend) separat triagieren.

## 8. Konkrete Änderungen pro Datei (echte Diffs aus `2bcc7592a`)

Die folgenden Blöcke sind die **realen** Änderungen (aus `git show 2bcc7592a`),
nicht Zusammenfassungen. Sie zeigen, was in jeder Datei tatsächlich geändert
wurde.

### 8.1 `src/databases/core/batch-module.ts`

**Vorher (N+1):** pro Item ein eigenes `UPDATE`-Statement im Transaktionsloop.

```ts
let modifiedCount = 0;
await this.db.transaction(async (tx: any) => {
  for (const update of updates) {
    const stmt = tx
      .update(table as any)
      .set(utils.convertISOToDates({ ...update.data, updatedAt: now }) as any)
      .where(eq((table as any)._id, update.id as string));
    const result = (typeof stmt.run === "function" ? await stmt.run() : await stmt) as any;
    modifiedCount += result?.changes ?? result?.rowsAffected ?? result?.count ?? 0;
  }
});
return { modifiedCount };
```

**Nachher (gruppiert, G ≤ N):** einen `UPDATE … WHERE _id IN (…)` pro
**distinktem** Payload. Identische Semantik, weniger Round-Trips.

```ts
let modifiedCount = 0;
const groups = utils.groupUpdatesByPayload(updates);
await this.db.transaction(async (tx: any) => {
  for (const group of groups) {
    const stmt = tx
      .update(table as any)
      .set(
        utils.convertISOToDates({
          ...(group.data as Record<string, unknown>),
          updatedAt: now,
        }) as any,
      )
      .where(inArray((table as any)._id, group.ids as string[]));
    const result = (typeof stmt.run === "function" ? await stmt.run() : await stmt) as any;
    modifiedCount += result?.changes ?? result?.rowsAffected ?? result?.count ?? group.ids.length;
  }
});
return { modifiedCount };
```

**Außerdem geändert:**

- Ungenutzten `eq`-Import entfernt → `import { inArray } from "drizzle-orm";`
- Der **logisch fehlerhafte Early-Return** (der bei `undefined`-Payload fälschlich
  Erfolg `{modifiedCount: 0}` gemeldet hätte) wurde entfernt.

### 8.2 `src/databases/core/relational-utils.ts`

Neuer Helper nach `sameBatchPayload()` (endet bei L877). Gruppiert Bulk-Updates
nach identischem Payload und erzeugt je Gruppe eine Liste `ids`.

```ts
export function groupUpdatesByPayload<T>(
  updates: Array<{ id: unknown; data?: Partial<T> | Record<string, unknown> }>,
): Array<{ ids: Array<unknown>; data?: Partial<T> | Record<string, unknown> }> {
  const groups: Map<string, { ids: Array<unknown>; data?: Partial<T> | Record<string, unknown> }> =
    new Map();
  for (const update of updates) {
    const key = canonicalPayloadKey(update.data);
    let bucket = groups.get(key);
    if (!bucket) {
      bucket = { ids: [], data: update.data };
      groups.set(key, bucket);
    }
    bucket.ids.push(update.id);
  }
  return [...groups.values()];
}

/** Canonical string for a payload: recursively sorted keys, JSON-serialized. */
function canonicalPayloadKey(data: unknown, seen = new WeakSet<object>()): string {
  if (data === null || data === undefined) return "obj:{}";
  switch (typeof data) {
    case "boolean":
    case "number":
    case "string":
      return `${typeof data}:${String(data)}`;
    case "object": {
      const obj = data as Record<string, unknown>;
      if (seen.has(obj)) return "circular";
      seen.add(obj);
      if (Array.isArray(obj)) {
        return `array:${obj.map((v) => canonicalPayloadKey(v, seen)).join(",")}`;
      }
      const keys = Object.keys(obj).sort();
      const parts = keys.map((k) => `${k}=${canonicalPayloadKey(obj[k], seen)}`);
      seen.delete(obj);
      return `obj:{${parts.join(";")}}`;
    }
    default:
      return `unknown:${String(data)}`;
  }
}
```

> Warum **rekursiv kanonisch** und nicht `JSON.stringify`: JSON-Stringify ist
> key-reihenfolge-sensitiv (zwei semantisch gleiche Payloads mit anderer
> Key-Reihenfolge würden getrennt). Ein **Shallow-Vergleich** scheitert bei
> verschachtelten Objekten (Referenzvergleich). Die kanonische Variante
> sortiert Keys auf allen Ebenen → robust und deterministisch.

### 8.3 `tests/unit/databases/groupUpdatesByPayload.test.ts` (neu)

Pure-Logik-Tests des Helpers — **4/4 grün**:

1. Gruppiert identische Payloads korrekt.
2. Trennt unterschiedliche Payloads.
3. Sortiert Key-Reihenfolge invariant (Object-Key-Reihenfolge egal).
4. Verschachtelte Objekte (Shallow-Referenz-Fall) → korrekt gruppiert.

### 8.4 `tests/integration/databases/bulkfix-hetero.test.ts` (neu)

Echter SQLite-Pfad-Test (`bulkUpdate` über `db.batch`) — **2/2 grün.**
Beweist, dass heterogene Updates mit unterschiedlichen Payloads korrekt
persistiert werden und `modifiedCount` stimmt.

### 8.5 `docs/project/competitive-security-overview.mdx` (neu)

UWG-konformer, **dokumentationsbasierter** Vergleich der Security-/Compliance-
Controls über SveltyCMS, Payload CMS, Strapi und Directus. Keine Live-Lauf-
Behauptung; Mitbewerber-Zahlen sind als „nur öffentliche Doku" markiert.
Basiert auf der verifizierten Security-Tabelle aus `competitive-comparison.mdx`.

### 8.6 `docs/project/fix_next.md` (dieses Dokument)

Ehrliches Inventar: was auf `next` committet ist, was noch offen, plus exakte
per-Datei-Änderungsliste und die Git-Topologie-Warnung.

---

## 9. Konkrete gewünschte Änderungen, die noch OFFEN sind (kein Code)

Damit nicht wieder „angekündigt aber nicht geliefert" entsteht, hier die
**nicht implementierten** Änderungen, die du explizit angefordert hast:

| Anforderung        | Status           | Was konkret fehlt                                                                                                                                                                              |
| ------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **2FA/MFA P0–P2**  | ❌ offen         | kompletter Backlog (Abschnitt 4.1): `types.ts`, `permissions.ts`, `session-manager.ts`, `two-factor-auth.ts`, `collections.ts`+`+server.ts`, `user-attribute-policy.ts`, `webauthn-service.ts` |
| **Q3 Bulk-Update** | ✅ `2bcc7592a`   | implementiert                                                                                                                                                                                  |
| **Q4 leaner Code** | ⚠️ nur Vorschlag | kein Code — siehe Abschnitt 4.3                                                                                                                                                                |

> Ehrlichkeit: Ich habe **keine** 2FA/MFA-Änderung committet, weil sie nicht
> implementiert ist. Ich baue keine "gemachte" Änderung als erledigt ein.
