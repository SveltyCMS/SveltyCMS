/**
 * @file tests/unit/routes/migration-import-server.test.ts
 * @description Behaviour contract for `POST /api/migration/import` (SSE stream).
 *
 * Only boundaries are mocked: CSRF validation, the collection-builder permission
 * check, target-collection inference and the import runner itself. SSE framing,
 * response headers, form parsing and the 15 MB inline-size guard run for real.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  MigrationImportParams,
  MigrationImportResult,
} from "@plugins/smart-importer/import-runner";

vi.mock("@utils/security/csrf-utils", () => ({
  validateCsrfForRequest: vi.fn(),
}));

vi.mock("@src/databases/auth/permissions", () => ({
  hasCollectionBuilderPermission: vi.fn(),
}));

vi.mock("@plugins/smart-importer/infer-collection", () => ({
  resolveTargetCollection: vi.fn(),
}));

vi.mock("@plugins/smart-importer/import-runner", () => {
  class MigrationLicenseError extends Error {
    constructor(format: string) {
      super(`${format} import requires a Pro license`);
      this.name = "MigrationLicenseError";
    }
  }
  class MigrationDeltaError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "MigrationDeltaError";
    }
  }
  class MigrationPiiError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "MigrationPiiError";
    }
  }
  return {
    MigrationLicenseError,
    MigrationDeltaError,
    MigrationPiiError,
    getMigrationLicenseTier: vi.fn(),
    runMigrationImport: vi.fn(),
  };
});

import { POST } from "../../../src/routes/api/migration/import/+server";
import { validateCsrfForRequest } from "@utils/security/csrf-utils";
import { hasCollectionBuilderPermission } from "@src/databases/auth/permissions";
import { resolveTargetCollection } from "@plugins/smart-importer/infer-collection";
import { getMigrationLicenseTier, runMigrationImport } from "@plugins/smart-importer/import-runner";

const IMPORT_URL = "http://localhost/api/migration/import";

/** Rows accepted by the fake runner, shared by every POST in one test. */
const importedRows: string[] = [];

type SsePayload = {
  type?: string;
  success?: boolean;
  imported?: number;
  failed?: number;
  current?: number;
  total?: number;
  error?: string;
};

type ImportLocals = Record<string, unknown>;

function parseSseEvents(body: string): SsePayload[] {
  return body
    .split("\n\n")
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.startsWith("data:"))
    .map((chunk) => JSON.parse(chunk.slice("data:".length).trim()) as SsePayload);
}

function completeEvent(body: string): SsePayload | undefined {
  return parseSseEvents(body).find((event) => event.type === "complete");
}

function makeCsvForm(text: string, name = "rows.csv", format: string | null = "csv"): FormData {
  const form = new FormData();
  form.set("file", new File([text], name, { type: "text/csv" }));
  if (format !== null) form.set("format", format);
  return form;
}

function makeLocals(overrides: ImportLocals = {}): ImportLocals {
  return {
    user: { _id: "u-import", email: "editor@example.com", role: "editor" },
    roles: [],
    isAdmin: false,
    tenantId: "t1",
    cms: { db: { kind: "fake-adapter" } },
    ...overrides,
  };
}

function makeEvent(form: FormData, locals: ImportLocals): Parameters<typeof POST>[0] {
  return {
    request: new Request(IMPORT_URL, { method: "POST", body: form }),
    locals,
    cookies: { get: () => undefined },
    url: new URL(IMPORT_URL),
  } as unknown as Parameters<typeof POST>[0];
}

async function readImportedRows(): Promise<string[]> {
  return [...importedRows];
}

describe("POST /api/migration/import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    importedRows.length = 0;

    vi.mocked(validateCsrfForRequest).mockReturnValue({ isValid: true });
    vi.mocked(hasCollectionBuilderPermission).mockReturnValue(true);
    vi.mocked(resolveTargetCollection).mockReturnValue("posts");
    vi.mocked(getMigrationLicenseTier).mockResolvedValue({ valid: true, tier: "free" });

    // The fake runner accumulates accepted rows, so the reported `imported`
    // count is the running total of the store — not just this request's rows.
    vi.mocked(runMigrationImport).mockImplementation(
      async (params: MigrationImportParams): Promise<MigrationImportResult> => {
        const rows = params.fileText
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.length > 0);
        importedRows.push(...rows);
        params.onProgress?.({
          current: rows.length,
          total: rows.length,
          phase: "processing",
          currentItem: "rows",
        });
        return {
          success: true,
          imported: importedRows.length,
          failed: 0,
          transactionToken: "txn-test",
          timestamp: "2026-01-01T00:00:00.000Z",
        };
      },
    );
  });

  it("streams progress and a complete event for a valid multipart import (load-contract)", async () => {
    const response = await POST(makeEvent(makeCsvForm("alpha\nbeta"), makeLocals()));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");

    const body = await response.text();
    const events = parseSseEvents(body);

    expect(events[0]).toMatchObject({ type: "progress", current: 0, phase: "extracting" });
    expect(events.some((event) => event.type === "progress" && event.current === 2)).toBe(true);

    const complete = completeEvent(body);
    expect(complete).toMatchObject({
      type: "complete",
      success: true,
      imported: 2,
      failed: 0,
    });

    expect(vi.mocked(runMigrationImport)).toHaveBeenCalledWith(
      expect.objectContaining({
        fileText: "alpha\nbeta",
        format: "csv",
        targetCollection: "posts",
        licenseTier: "free",
        tenantId: "t1",
      }),
    );
  });

  it("refuses an invalid CSRF token with 403 before touching the runner", async () => {
    vi.mocked(validateCsrfForRequest).mockReturnValue({
      isValid: false,
      error: "CSRF token mismatch",
    });

    const response = await POST(makeEvent(makeCsvForm("alpha"), makeLocals()));

    expect(response.status).toBe(403);
    expect(await response.text()).toContain("Security violation: CSRF token mismatch");
    expect(vi.mocked(runMigrationImport)).not.toHaveBeenCalled();
  });

  it("rejects anonymous callers with 401", async () => {
    const response = await POST(makeEvent(makeCsvForm("alpha"), makeLocals({ user: undefined })));

    expect(response.status).toBe(401);
    expect(await response.text()).toBe("Unauthorized");
    expect(vi.mocked(runMigrationImport)).not.toHaveBeenCalled();
  });

  it("rejects authenticated users without the collection-builder permission (403)", async () => {
    vi.mocked(hasCollectionBuilderPermission).mockReturnValue(false);

    const response = await POST(makeEvent(makeCsvForm("alpha"), makeLocals()));

    expect(response.status).toBe(403);
    expect(await response.text()).toContain("config:collectionbuilder permission required");
    expect(vi.mocked(runMigrationImport)).not.toHaveBeenCalled();
  });

  it("fails closed with 500 when no database adapter is available", async () => {
    const response = await POST(makeEvent(makeCsvForm("alpha"), makeLocals({ cms: undefined })));

    expect(response.status).toBe(500);
    expect(await response.text()).toBe("Database not available");
  });

  it("rejects a form without a file or without a format with 400", async () => {
    const withoutFormat = await POST(
      makeEvent(makeCsvForm("alpha", "rows.csv", null), makeLocals()),
    );
    expect(withoutFormat.status).toBe(400);
    expect(await withoutFormat.text()).toBe("file and format required");

    const emptyForm = new FormData();
    emptyForm.set("format", "csv");
    const withoutFile = await POST(makeEvent(emptyForm, makeLocals()));
    expect(withoutFile.status).toBe(400);
    expect(await withoutFile.text()).toBe("file and format required");
  });

  it("rejects inline uploads above 15 MB with 413 and a CLI hint", async () => {
    const oversize = new File([new Uint8Array(15 * 1024 * 1024 + 1)], "huge.csv", {
      type: "text/csv",
    });
    const form = new FormData();
    form.set("file", oversize);
    form.set("format", "csv");

    const response = await POST(makeEvent(form, makeLocals()));

    expect(response.status).toBe(413);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toContain("File too large for inline import");
    expect(vi.mocked(runMigrationImport)).not.toHaveBeenCalled();
  });

  it("rejects an oversized declared body before parsing the multipart form", async () => {
    // The route used to parse the whole multipart body and then check file.size;
    // the declared Content-Length is enough to refuse without buffering it.
    const formData = vi.fn();
    const event = {
      request: {
        headers: new Headers({ "content-length": String(20 * 1024 * 1024) }),
        formData,
      },
      locals: makeLocals(),
      cookies: { get: () => undefined },
      url: new URL(IMPORT_URL),
    } as unknown as Parameters<typeof POST>[0];

    const response = await POST(event);

    expect(response.status).toBe(413);
    expect(formData).not.toHaveBeenCalled();
    expect(vi.mocked(runMigrationImport)).not.toHaveBeenCalled();
  });

  it("keeps mutations across requests and reports the accumulated total (persistence)", async () => {
    const importOnce = async (rows: string): Promise<string> => {
      const form = new FormData();
      form.set("file", new File([rows], "incremental.csv", { type: "text/csv" }));
      form.set("format", "csv");
      const response = await POST({
        request: new Request(IMPORT_URL, { method: "POST", body: form }),
        locals: makeLocals(),
        cookies: { get: () => undefined },
        url: new URL(IMPORT_URL),
      } as unknown as Parameters<typeof POST>[0]);
      return response.text();
    };

    const firstComplete = completeEvent(await importOnce("alpha\nbeta"));
    expect(firstComplete).toMatchObject({ success: true, imported: 2, failed: 0 });

    const secondComplete = completeEvent(await importOnce("gamma"));
    expect(secondComplete).toMatchObject({ success: true, imported: 3, failed: 0 });

    expect(await readImportedRows()).toEqual(["alpha", "beta", "gamma"]);
  });

  it("loses nothing when two imports stream concurrently (concurrency)", async () => {
    const importOnce = async (csv: string, name: string): Promise<string> => {
      const form = new FormData();
      form.set("file", new File([csv], name, { type: "text/csv" }));
      form.set("format", "csv");
      const response = await POST({
        request: new Request(IMPORT_URL, { method: "POST", body: form }),
        locals: makeLocals(),
        cookies: { get: () => undefined },
        url: new URL(IMPORT_URL),
      } as unknown as Parameters<typeof POST>[0]);
      return response.text();
    };

    const [firstBody, secondBody] = await Promise.all([
      importOnce("one", "one.csv"),
      importOnce("two", "two.csv"),
    ]);

    expect(completeEvent(firstBody)?.success).toBe(true);
    expect(completeEvent(secondBody)?.success).toBe(true);

    const stored = await readImportedRows();
    expect([...stored].sort()).toEqual(["one", "two"]);
    expect(vi.mocked(runMigrationImport)).toHaveBeenCalledTimes(2);

    // Both streams completed against the shared store: one saw total 1, the other 2.
    const totals = [completeEvent(firstBody)?.imported, completeEvent(secondBody)?.imported].sort(
      (a, b) => (a ?? 0) - (b ?? 0),
    );
    expect(totals).toEqual([1, 2]);
  });
});
