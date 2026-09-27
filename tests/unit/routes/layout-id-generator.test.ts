/**
 * @file tests/unit/routes/layout-id-generator.test.ts
 * @description Guard + contract test for the request-scoped DOM id generator.
 *
 * `initIdGenerator()` installs a Svelte context map, so every render — each SSR request and
 * each client hydration — counts from zero. Without the call, `generateId()` (used by the
 * native UI kit: `input`, `select`, `checkbox`, `textarea`, `toggle`, `radio-group`, `tags`,
 * `combobox`, `date-picker`) falls back to a **process-global** counter: server-rendered ids
 * drift with however many ids earlier requests consumed, hydration restarts at 0, and every
 * `label[for]` / `aria-describedby` / `aria-controls` that points at a generated id breaks the
 * moment hydration finishes (measured 2026-09-27: `select-2` server-rendered vs `select-0`
 * hydrated).
 *
 * The SSR test wrappers under `tests/unit/components/ui/` already called it; nothing in the
 * app did. The first test below guards the app wiring; the second pins the per-render contract
 * the wiring depends on.
 */

// @vitest-environment node

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "svelte/server";
import InputSsrWrapper from "../components/ui/input-ssr-wrapper.svelte";

const LAYOUT_PATH = join(process.cwd(), "src/routes/+layout.svelte");

describe("root layout: DOM id generator initialization", () => {
  const source = readFileSync(LAYOUT_PATH, "utf8");

  it("imports initIdGenerator from @utils/id-generator", () => {
    expect(
      source,
      "src/routes/+layout.svelte must import { initIdGenerator } from '@utils/id-generator'",
    ).toMatch(/import\s*\{[^}]*\binitIdGenerator\b[^}]*\}\s*from\s*["']@utils\/id-generator["']/);
  });

  it("calls initIdGenerator() in the instance script", () => {
    // setContext is initialization-only, so the call has to be a top-level statement of the
    // instance `<script>` — an `onMount`/module-script placement would silently not work.
    expect(
      source,
      "src/routes/+layout.svelte must call initIdGenerator() during component initialization " +
        "(not inside onMount and not in a `<script module>` block)",
    ).toMatch(/^\s*initIdGenerator\(\);/m);
  });

  it("generated ids restart per render — what the layout's call buys", () => {
    // The wrapper calls initIdGenerator() exactly like the root layout does, so two renders must
    // both produce `input-0`. With the process-global fallback the second render yields `input-1`,
    // which is the drift that put server ids and hydrated ids out of step.
    const idOf = (html: string): string | undefined => /id="(input-\d+)"/.exec(html)?.[1];

    const first = render(InputSsrWrapper, { props: { label: "Username" } });
    const second = render(InputSsrWrapper, { props: { label: "Username" } });

    expect(idOf(first.body)).toBe("input-0");
    expect(idOf(second.body)).toBe("input-0");
  });
});
