/**
 * @file tests/unit/components/dom/mocks/app-env.ts
 * @description Browser-true `$app/env` for client component tests.
 *
 * The shared unit mock sets `browser = false` because most server tests run in
 * Node. Component code that gates behavior on `browser` (saved views, theme
 * stores) needs the client path under jsdom.
 */

export const browser = true;
export const dev = true;
export const building = false;
export const version = "1.0.0";

export const __esModule = true;
export default { browser, dev, building, version };
