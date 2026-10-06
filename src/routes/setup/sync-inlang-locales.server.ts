/**
 * @file src/routes/setup/sync-inlang-locales.server.ts
 * @description Persist system languages to the Inlang project and generate catalogs.
 *
 * Features:
 * - Writes `project.inlang/settings.json` `locales` / `languageTags`
 * - Ensures `src/messages/{locale}.json` exists (cloned from English source)
 * - Runs `bun run translate` (Inlang machine translate) then `bun run paraglide`
 * - Skips filesystem/CLI work in the automated test harness (does not dirty git)
 */

import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isAutomatedTestHarness } from "@utils/private-config-policy";
import { isIso6391LanguageCode, languageBase, mergeSystemLanguages } from "@utils/system-locale";
import { logger } from "@utils/logger";

const SETTINGS_REL = "project.inlang/settings.json";
const MESSAGES_REL = "src/messages";

export interface SyncInlangResult {
  skipped: boolean;
  added: string[];
  locales: string[];
  translated: boolean;
  compiled: boolean;
  error?: string;
}

interface InlangSettings {
  baseLocale?: string;
  locales?: string[];
  sourceLanguageTag?: string;
  languageTags?: string[];
  [key: string]: unknown;
}

async function readJsonFile<T>(pathName: string): Promise<T> {
  return JSON.parse(await readFile(pathName, "utf8")) as T;
}

async function writeJsonFile(pathName: string, value: unknown): Promise<void> {
  await writeFile(pathName, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function syncInlangSystemLocales(
  requestedLocales: readonly string[] | undefined | null,
  options?: { translate?: boolean; compile?: boolean; cwd?: string },
): Promise<SyncInlangResult> {
  const cwd = options?.cwd ?? process.cwd();
  const translate = options?.translate !== false;
  const compile = options?.compile !== false;

  const merged = mergeSystemLanguages(requestedLocales);
  if (merged.length === 0) {
    return { skipped: true, added: [], locales: ["en"], translated: false, compiled: false };
  }

  if (isAutomatedTestHarness() && !options?.cwd) {
    logger.debug("[Inlang] Skipping catalog sync in automated test harness");
    return { skipped: true, added: [], locales: merged, translated: false, compiled: false };
  }

  const settingsPath = join(cwd, SETTINGS_REL);
  const messagesDir = join(cwd, MESSAGES_REL);

  let settings: InlangSettings;
  try {
    settings = await readJsonFile<InlangSettings>(settingsPath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[Inlang] Failed to read project.inlang/settings.json:", message);
    return {
      skipped: true,
      added: [],
      locales: merged,
      translated: false,
      compiled: false,
      error: message,
    };
  }

  const existing = mergeSystemLanguages([
    ...(settings.locales ?? []),
    ...(settings.languageTags ?? []),
  ]);
  const nextLocales = mergeSystemLanguages([...existing, ...merged]);
  const added = nextLocales.filter((code) => !existing.includes(code));

  const localesChanged =
    nextLocales.length !== existing.length || nextLocales.some((code, i) => code !== existing[i]);

  if (localesChanged) {
    settings.locales = nextLocales;
    settings.languageTags = nextLocales;
    await writeJsonFile(settingsPath, settings);
    logger.info(`[Inlang] Updated locales: ${nextLocales.join(", ")}`);
  }

  const enPath = join(messagesDir, "en.json");
  let enCatalog: Record<string, string> = {
    $schema: "https://inlang.com/schema/inlang-message-format",
  };
  try {
    enCatalog = await readJsonFile<Record<string, string>>(enPath);
  } catch (err) {
    logger.warn("[Inlang] Could not read src/messages/en.json:", err);
  }

  for (const code of nextLocales) {
    if (!isIso6391LanguageCode(code)) continue;
    const localePath = join(messagesDir, `${languageBase(code)}.json`);
    try {
      await access(localePath);
    } catch {
      await writeJsonFile(localePath, enCatalog);
      logger.info(`[Inlang] Created message catalog src/messages/${code}.json`);
    }
  }

  let translated = false;
  let compiled = false;
  let error: string | undefined;

  if (translate && added.length > 0) {
    try {
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execFileAsync = promisify(execFile);
      const { stdout, stderr } = await execFileAsync("bun", ["run", "translate"], {
        cwd,
        timeout: 180_000,
        env: process.env,
      });
      if (stdout) logger.info("[Inlang] machine translate:", stdout.slice(0, 2000));
      if (stderr) logger.debug("[Inlang] machine translate stderr:", stderr.slice(0, 1000));
      translated = true;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      logger.warn(
        "[Inlang] Machine translate failed (UI will use English until catalogs exist):",
        error,
      );
    }
  }

  if (compile && (added.length > 0 || translated)) {
    try {
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execFileAsync = promisify(execFile);
      const { stdout, stderr } = await execFileAsync("bun", ["run", "paraglide"], {
        cwd,
        timeout: 60_000,
        env: process.env,
      });
      if (stdout) logger.info("[Inlang] paraglide compile:", stdout.slice(0, 1000));
      if (stderr) logger.debug("[Inlang] paraglide stderr:", stderr.slice(0, 500));
      compiled = true;
    } catch (err) {
      const compileError = err instanceof Error ? err.message : String(err);
      error = error ? `${error}; ${compileError}` : compileError;
      logger.warn("[Inlang] Paraglide compile failed:", compileError);
    }
  }

  return { skipped: false, added, locales: nextLocales, translated, compiled, error };
}
