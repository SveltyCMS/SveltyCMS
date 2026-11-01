/**
 * @file tests/unit/routes/dashboard-widget-endpoints.test.ts
 * @description Dashboard widgets fetch a `dashboard` action by name; an action the
 * handler does not implement answers 404 (`Dashboard action '<x>' not implemented`)
 * and the widget renders empty. The "Last 5 Content" widget pointed at
 * `/api/dashboard/last5` while the handler implements `last5-content`.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const HANDLER = join(ROOT, "src/routes/api/[...path]/handlers/dashboard.ts");
const WIDGET = join(ROOT, "src/routes/(app)/dashboard/widgets/last5-content/index.svelte");

/** Action names the dashboard handler answers without falling through to 404. */
function implementedDashboardActions(): Set<string> {
  const source = readFileSync(HANDLER, "utf8");
  const actions = new Set<string>();
  for (const match of source.matchAll(/case\s+"([a-z0-9-]+)":/g)) actions.add(match[1]);
  return actions;
}

/** Dashboard action the widget polls, or null when it polls nothing. */
function widgetDashboardAction(): string | null {
  const source = readFileSync(WIDGET, "utf8");
  const match = source.match(/endpoint="\/api\/dashboard\/([a-z0-9-]+)[^"]*"/);
  return match ? match[1] : null;
}

describe("last5-content dashboard widget", () => {
  it("polls a dashboard action the handler actually implements", () => {
    const action = widgetDashboardAction();
    expect(action).toBeTruthy();
    expect(implementedDashboardActions()).toContain(action);
  });

  it("does not poll the unimplemented bare `last5` action", () => {
    expect(widgetDashboardAction()).not.toBe("last5");
    expect(implementedDashboardActions()).not.toContain("last5");
  });
});
