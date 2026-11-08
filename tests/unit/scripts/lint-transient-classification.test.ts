/**
 * @file tests/unit/scripts/lint-transient-classification.test.ts
 * @description Fixtures for the destructive-recovery scanner: deleting a
 * collection/config file inside a catch handler is only allowed when the error
 * is classified first.
 */

import { describe, expect, it } from "vitest";
import { findUnclassifiedDeletes } from "../../../scripts/lint/lint-transient-classification";

const file = (path: string, source: string) => ({ path, source });

describe("findUnclassifiedDeletes", () => {
  it("flags an unclassified collection delete in a catch block", () => {
    const offenses = findUnclassifiedDeletes([
      file("src/a.ts", "try { await work(); } catch (err) { await unlink(collectionFile); }"),
    ]);

    expect(offenses).toHaveLength(1);
    expect(offenses[0]).toMatchObject({ file: "src/a.ts", call: "unlink" });
  });

  it("accepts a catch that classifies ENOENT", () => {
    const offenses = findUnclassifiedDeletes([
      file(
        "src/b.ts",
        'try { await work(); } catch (err) { if (err.code !== "ENOENT") throw err; await unlink(collectionFile); }',
      ),
    ]);

    expect(offenses).toEqual([]);
  });

  it("flags an unclassified delete in a .catch() handler", () => {
    const offenses = findUnclassifiedDeletes([
      file("src/c.ts", "await work().catch(() => unlink(compiledFile));"),
    ]);

    expect(offenses).toHaveLength(1);
    expect(offenses[0]?.call).toBe("unlink");
  });

  it("ignores temp-file cleanup", () => {
    const offenses = findUnclassifiedDeletes([
      file("src/d.ts", "try { await work(); } catch { await unlink(tempPath); }"),
    ]);

    expect(offenses).toEqual([]);
  });

  it("honours the suppression marker", () => {
    const offenses = findUnclassifiedDeletes([
      file(
        "src/e.ts",
        "// lint-transient: allow\ntry { await work(); } catch { await unlink(collectionFile); }",
      ),
    ]);

    expect(offenses).toEqual([]);
  });
});
