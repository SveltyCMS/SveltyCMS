/**
 * @vitest-environment jsdom
 * @file tests/unit/utils/focus-restore.test.ts
 * @description Focus memory must never parse remembered data as CSS.
 *
 * The root layout used to keep the focused element as a selector string
 * (`#${el.id}`, `[data-testid="${...}"]`, `${tag}[name="${...}"]`) and run it
 * through `document.querySelector`. Ids, testids and field names are data:
 * `id="search..."` (label "Search...") made `querySelector` throw
 *   SyntaxError: '#search...' is not a valid selector
 * inside a `setTimeout`, uncaught — the E2E page-error guard counted 15 of them in
 * one shard. A crafted value such as `x, body` or `div:has(*)` would additionally
 * have selected an element the caller never meant.
 *
 * ### Features:
 * - the exact failing id resolves and focuses (no throw)
 * - selector syntax inside data is treated literally (injection guard)
 * - testid / name fallbacks compare attribute values, never interpolate them
 * - a vanished element resolves to `null` instead of throwing
 */

import { describe, expect, it, beforeEach } from "vitest";
import { captureFocusTarget, resolveFocusTarget, restoreFocus } from "@utils/focus-restore";

function makeInput(id?: string, attrs: Record<string, string> = {}): HTMLInputElement {
  const el = document.createElement("input");
  if (id) el.id = id;
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
  document.body.appendChild(el);
  return el;
}

describe("focus-restore", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("resolves an id that is not a valid CSS selector without throwing", () => {
    // The id the table search input shipped: label="Search..." → "search...".
    const input = makeInput("search...");

    // Control: the browser (Chromium) rejects this with
    //   "Failed to execute 'querySelector' on 'Document': '#search...' is not a valid selector."
    // jsdom/nwsapi words it "Invalid selector #search...". Both are the same SyntaxError.
    // If a parser ever accepts it, the regression this test guards has lost its teeth.
    expect(() => document.querySelector("#search...")).toThrow(
      /not a valid selector|Invalid selector/,
    );

    const snapshot = captureFocusTarget(input);
    expect(snapshot).toEqual({ id: "search...", testId: "", name: "", tagName: "input" });

    expect(() => resolveFocusTarget(document, snapshot)).not.toThrow();
    expect(resolveFocusTarget(document, snapshot)).toBe(input);
  });

  it("treats selector syntax inside an id literally instead of selecting something else", () => {
    const victim = document.createElement("div");
    victim.id = "victim";
    document.body.appendChild(victim);

    const decoy = makeInput("decoy");
    // As a selector this would be "the element with id decoy, plus #victim".
    const crafted = makeInput("decoy, #victim");

    expect(resolveFocusTarget(document, captureFocusTarget(victim))).toBe(victim);
    expect(resolveFocusTarget(document, captureFocusTarget(decoy))).toBe(decoy);
    expect(resolveFocusTarget(document, captureFocusTarget(crafted))).toBe(crafted);
  });

  it("falls back to data-testid by value comparison, quoted brackets stay literal", () => {
    const plain = document.createElement("button");
    document.body.appendChild(plain);

    const tricky = document.createElement("button");
    tricky.setAttribute("data-testid", 'x"] , body');
    document.body.appendChild(tricky);

    const snapshot = captureFocusTarget(tricky);
    expect(snapshot?.testId).toBe('x"] , body');
    expect(resolveFocusTarget(document, snapshot)).toBe(tricky);
  });

  it("falls back to a name inside a validated tag scope", () => {
    const byId = makeInput("with-id", { name: 'a"b' });
    expect(resolveFocusTarget(document, captureFocusTarget(byId))).toBe(byId);

    // Same name, no id → the name branch, scoped by tag and compared by value.
    const byName = document.createElement("select");
    byName.setAttribute("name", 'a"b');
    document.body.appendChild(byName);

    const snapshot = captureFocusTarget(byName);
    expect(snapshot).toEqual({ id: "", testId: "", name: 'a"b', tagName: "select" });
    expect(resolveFocusTarget(document, snapshot)).toBe(byName);
  });

  it("returns null for an element that is gone instead of throwing", () => {
    const input = makeInput("vanishing");
    const snapshot = captureFocusTarget(input);
    input.remove();

    expect(resolveFocusTarget(document, snapshot)).toBeNull();
    expect(restoreFocus(document, snapshot)).toBe(false);
  });

  it("moves focus to the remembered element", () => {
    const input = makeInput("search...");
    const other = makeInput("elsewhere");
    other.focus();
    expect(document.activeElement).toBe(other);

    expect(restoreFocus(document, captureFocusTarget(input))).toBe(true);
    expect(document.activeElement).toBe(input);
  });

  it("remembers nothing for non-elements and bare containers", () => {
    expect(captureFocusTarget(null)).toBeNull();
    expect(captureFocusTarget(undefined)).toBeNull();
    expect(captureFocusTarget(document)).toBeNull();
    expect(captureFocusTarget(document.createElement("div"))).toBeNull();
    expect(resolveFocusTarget(document, null)).toBeNull();
    expect(resolveFocusTarget(null, captureFocusTarget(makeInput("x")))).toBeNull();
  });
});
