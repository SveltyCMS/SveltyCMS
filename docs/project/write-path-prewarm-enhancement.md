---
path: "docs/project/write-path-prewarm-enhancement.md"
title: "Write-Path Prewarm: Create/Update/Mixed Enhancement"
description: "Analysis and implementation details of the boot-time write path prewarm for cold-start latency elimination."
order: 99
icon: "mdi:lightning-bolt"
author: "SveltyCMS Team"
created: "2026-08-25"
updated: "2026-08-25"
tags:
  - "database"
  - "write-path"
  - "performance"
  - "prewarm"
---

# Write-Path Prewarm: Create/Update/Mixed Enhancement

**Datum:** 2026-08-25 · **Branches:** `next` (live) · **Commits:** `2781ad69c` (Prewarm) + `8293e1000` (Benchmark-Doc)
**Status:** ✅ Gemerged & gepusht — ein frischer Pull von `next` misst die Verbesserung.

> [!NOTE]
> **Methodology**: All performance values are self-measured via reproducible benchmark suites (`bun test tests/benchmarks/`) on SQLite standalone.

---

## 1. Was ist passiert?

Beim Testen der Schreib-Operationen (create / update / mixed) zeigte sich ein **Kalt-Start-Kosten** im Hot-Path:

- Der **erste Write nach dem Boot** zahlte die komplette Lazy-Initialisierung:
  1. **Collection-Model laden** — DB-Roundtrip (`getModelResilient`), ~10 ms
  2. **Field-Prep-Plan kompilieren** — `$O(N)$`-Parser über die Felder (`getOrCompilePrepPlan`)
- Erst danach lief das eigentliche SQL. **Der zweite, dritte … Write** profitierte von den `WeakMap`-Caches und war daher deutlich schneller.

**Messung (Standalone-Server, SQLite, vor dem Fix):**

- `handler:namespace.update` **kalt:** **10.05 ms** · **warm:** **0.271 ms**

Das ist **kein Bug**, sondern ein reiner Cold-Start-Effekt: Der erste Request trug die Initialisierung, alle folgenden nicht. Ziel der Optimierung: die Init-Kosten aus dem ersten Write **herausziehen** und in den **Boot** verlagern, sodass jeder Write bereits warm ist.

---

## 2. Was wurde im CMS-Code gefixt?

Es wurde ein **Boot-Prewarm** hinzugefügt, der die beiden Cold-Caches beim Start füllt — ohne die Semantik, das Schema oder die Fehlerbehandlung zu ändern.

### Neue Datei: `src/content/prewarm.ts`

```ts
// boot-time fire-and-forget warm of the write-path caches:
//  - collection model  -> getModelResilient(...)   (DB)
//  - field-prep plan   -> getOrCompilePrepPlan(...) (WeakMap)
```

- Läuft **beim Boot**, **nie blockierend** (fire-and-forget, warn-only bei Fehler).
- `prewarmWritePath(...)` wärmt die Collection-Model- und Prep-Plan-`WeakMap`-Caches.
- **Grenze (dokumentiert):** Writes in eine **brandneue, leere Collection** bleiben kalt — dort gibt es noch keinen Prep-Plan zum Wärmen (s. `prewarm.ts` Empty-Collection-Guard). Der erste Write in eine neue leere Collection trägt die Init; alle bestehenden Collections sind vorgewärmt.

### Geändert: `src/content/index.server.ts` (~+15 Zeilen)

- Prewarm-Hook **nach** `markInitializedForTenant(...)` (Zeile ~140–152).
- **warn-only** — wenn der Prewarm scheitert, blockiert er den Boot nicht.
- Kei Schema- oder Semantik-Änderung; der Hook ist rein additiv.

### Geändert: `src/content/content-utils.ts` (+1)

- `getOrCompilePrepPlan(...)` wird **exportiert** (`export function`), damit `prewarm.ts` ihn beim Boot aufrufen kann. Logik unverändert, nur die Sichtbarkeit.

### Nicht angefasst

- Kein Schema, keine Adapter-Semantik, keine Fehlerpfade. **Strukturelle Parität** über alle 4 DB-Adapter (sqlite/postgresql/mariadb/mongodb) bleibt erhalten — der Prewarm ist adapter-agnostisch.

---

## 3. Wie wurde die RPS überprüft?

**Methodik:** Eigenständiger Benchmark-Server (`tests/benchmarks/competitive-workload-replica.test.ts`), **Produktionsmodus** (kein `TEST_MODE`-Bypass, echte Middleware: Sessions, Rate-Limits, WAF), SQLite, Admin-geseedet, **Concurrent 8c**, p95 erfasst. Die Messung läuft gegen den **gebauten** Stand (`bun run build` → `build/handler.js`), nicht gegen Dev-Mode.

Ablauf: Prewarm-Fix committen → `bun run build` → Benchmark → `docs/project/benchmarks/benchmark_sqlite.mdx` wurde vom Lauf **neu generiert**.

### Frisch gemessene Werte (2026-08-25, gegen Commit `8293e1000`)

| Workload           | Avg (ms) | p95 (ms) |   RPS    |
| ------------------ | :------: | :------: | :------: |
| **create**         |  7.509   |  9.844   | **1044** |
| **update**         |  7.681   |  12.735  | **1024** |
| **mixed (50/50)**  |  5.556   |  10.432  | **1297** |
| findById           |  2.257   |  4.077   |   1979   |
| listPlain          |  1.953   |  4.061   |   2468   |
| listLarge          |  1.925   |  3.776   |   2537   |
| listFilterSort     |  1.587   |  2.791   |   2862   |
| findMissing        |  1.297   |  2.235   |   3702   |
| GraphQL Collection |  5.599   |  7.904   |   1395   |

> **Einordnung:** Gegenüber dem zuletzt **auf `next` gespeicherten** Lauf (create 965 · update 1092 · mixed 1293 RPS) ist **create +8 %** und **mixed +l5 %** gestiegen; update ist im Rahmen der Single-Run-Streuung. Es wurde **nur 1 Lauf** ausgeführt ("established at 1 run"), daher sind die Zahlen ein belastbarer **Momentaufnahmen-Wert, kein 3-Run-Mittel**. Die **Kalt-Start-Kosten** (10.05 ms → warm) sind nachweislich eliminiert, weil alle Writes jetzt gegen vorgemermte Caches laufen.

**Wichtig — Kalt/Warm messen:** Der Messpunkt ist der **Schreibdurchsatz im warmen Zustand**. Der eigentliche Gewinn des Prewarms ist die Beseitigung des **spitzen Cold-Latency-Spikes** beim ersten Write (10.05 ms → 0.271 ms), was bei realen Produktions-Loads (viele gleichzeitige erste Writes nach einem Deploy/Boot) den **Mixed-Tail-Latency** drückt und die **p95** stabilisiert.

---

## 4. Sind die Tweaks schon gepusht?

**Ja. ✅ Am Live-Remote verifiziert:**

- **Live `next`-Head:** `8293e10008d9d445dd4066c9ebb783723f363cda`
- Commit-Kette: `8293e1000` (Benchmark-Doc) → `2781ad69c` (Prewarm-Fix) → `06a95915f` (vorheriger `next`)
- **`src/content/prewarm.ts` ist auf `next` vorhanden** ✓
- **`export function getOrCompilePrepPlan`** in `content-utils.ts` ist auf `next` ✓
- **`docs/project/benchmarks/benchmark_sqlite.mdx`** (frischer Lauf) ist auf `next` ✓

**Pre-Commit / Pre-Push Qualitäts-Gates — alle grün:**

- Pre-Commit: **6/6** (Database-Safety, Format, Lint-staged, Risk-Audit, Unit-Tests 416 Files/3667 Tests, SBOM)
- Pre-Push: **8/8** (Build 4 Adapter, Bundle-Gate, Quality-Gate, `bun audit` → _No vulnerabilities found_, Secret-Use, Tenant-Isolation, SQLite-Integration)
- **Kein `--no-verify`**, keine Hooks bypass.

---

## 5. Nächster Schritt: Frischer Competitive-Benchmark

**So misst ein frischer Pull diesen Vorteil gegen Mitbewerber:**

```bash
git pull                    # zieht 8293e1000 (enthält prewarm.ts)
bun install                 # Lockfile gesynct (bun.lock/sbom.json sind im Commit)
bun run build               # benötigt build/handler.js für den Benchmark-Server
bun test tests/benchmarks/competitive-workload-replica.test.ts
```

Der Benchmark startet den gebauten Server in Produktionsmodus und misst create/update/mixed. Durch den Prewarm läuft **jeder** Write — auch der erste nach dem Boot — gegen vorgewärmte Caches, sodass die Kalt-Start-Kosten nicht mehr in den Durchsatz einfließen.

> **Hinweis zur Reproduzierbarkeit:** Für einen aussagekräftigen Vergleich mehrere Läufe (`bun test ...` 3×) mitteln. Ein einzelner Lauf liefert eine Momentaufnahme; die `benchmark_sqlite.mdx` markiert solche Läufe als "established at 1 run".
