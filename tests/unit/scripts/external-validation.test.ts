/**
 * @file tests/unit/scripts/external-validation.test.ts
 * @description Unit tests for the external-validation record gate
 *   (`scripts/security/check-external-validation.ts`). Pins the Valibot schema,
 *   the freshness rules, the Scorecard target rule, and the JSON/CLI contract
 *   against a fixed clock so the result never depends on the test-run date.
 */

import { describe, expect, it } from "vitest";
import {
  PEN_TEST_MAX_AGE_DAYS,
  REVIEW_MAX_AGE_DAYS,
  buildJsonReport,
  evaluateExternalValidation,
  parseCliArgs,
  parseExternalValidation,
  renderStatusTable,
  runCli,
  type ExternalValidationDocument,
} from "../../../scripts/security/check-external-validation";

/** Fixed clock: the date the record was seeded. */
const NOW = new Date("2026-11-05T00:00:00.000Z");

interface MutableRecord {
  version: number;
  updated_at: string;
  penetration_test: {
    status: string;
    date: string | null;
    provider: string | null;
    report_url: string | null;
    scope: string;
  };
  bug_bounty: {
    status: string;
    platform: string | null;
    url: string | null;
    scope_url: string | null;
  };
  openssf_scorecard: {
    status: string;
    target_score: number;
    latest_score: number | null;
    report_url: string | null;
  };
  slsa: { status: string; level: number | null };
  sigstore: { status: string; identity: string | null };
  last_reviewed_at: string;
}

function pendingRecord(): MutableRecord {
  return {
    version: 1,
    updated_at: "2026-11-05",
    penetration_test: {
      status: "pending",
      date: null,
      provider: null,
      report_url: null,
      scope: "Running deployment: API, authentication, authorization, uploads.",
    },
    bug_bounty: {
      status: "pending",
      platform: null,
      url: null,
      scope_url: null,
    },
    openssf_scorecard: {
      status: "pending",
      target_score: 8,
      latest_score: null,
      report_url: null,
    },
    slsa: { status: "pending", level: null },
    sigstore: { status: "pending", identity: null },
    last_reviewed_at: "2026-11-05",
  };
}

function parseRecord(raw: unknown): ExternalValidationDocument {
  const result = parseExternalValidation(raw);
  if (!result.success) throw new Error(result.issues.join("; "));
  return result.document;
}

function evaluate(raw: unknown, now: Date = NOW) {
  return evaluateExternalValidation(parseRecord(raw), now);
}

function failureFields(raw: unknown, now: Date = NOW): string[] {
  return evaluate(raw, now).failures.map((failure) => failure.field);
}

describe("external validation schema", () => {
  it("accepts the seeded all-pending record", () => {
    const result = parseExternalValidation(pendingRecord());
    expect(result.success).toBe(true);

    const evaluation = evaluate(pendingRecord());
    expect(evaluation.ok).toBe(true);
    expect(evaluation.failures).toEqual([]);
  });

  it("rejects an unknown penetration-test status", () => {
    const record = pendingRecord();
    record.penetration_test.status = "in-progress";

    const result = parseExternalValidation(record);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.join(" ")).toContain("penetration_test.status");
    }
  });

  it("rejects a record with a missing required section", () => {
    const record = pendingRecord() as unknown as Record<string, unknown>;
    delete record.slsa;

    const result = parseExternalValidation(record);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.join(" ")).toContain("slsa");
    }
  });

  it("rejects an unknown top-level field instead of ignoring it", () => {
    const record = pendingRecord() as unknown as Record<string, unknown>;
    record.unexpected_field = true;

    expect(parseExternalValidation(record).success).toBe(false);
  });
});

describe("penetration-test freshness", () => {
  it("accepts a completed test inside the 365-day window", () => {
    const record = pendingRecord();
    record.penetration_test.status = "completed";
    record.penetration_test.date = "2026-09-01";
    record.penetration_test.provider = "Independent assessor";
    record.penetration_test.report_url = "https://example.com/report.pdf";

    expect(evaluate(record).ok).toBe(true);
  });

  it("accepts a completed test at exactly the 365-day boundary", () => {
    const record = pendingRecord();
    record.penetration_test.status = "completed";
    record.penetration_test.date = "2025-11-05";

    expect(evaluate(record).ok).toBe(true);
    expect(PEN_TEST_MAX_AGE_DAYS).toBe(365);
  });

  it("rejects a completed test older than 365 days", () => {
    const record = pendingRecord();
    record.penetration_test.status = "completed";
    record.penetration_test.date = "2024-11-04";

    const evaluation = evaluate(record);
    expect(evaluation.ok).toBe(false);
    expect(failureFields(record)).toContain("penetration_test.date");
    expect(evaluation.failures[0]?.message).toContain("365");
  });

  it("rejects a completed test without a report date", () => {
    const record = pendingRecord();
    record.penetration_test.status = "completed";
    record.penetration_test.date = null;

    expect(failureFields(record)).toContain("penetration_test.date");
  });

  it("rejects a scheduled test without a planned date", () => {
    const record = pendingRecord();
    record.penetration_test.status = "scheduled";
    record.penetration_test.date = null;

    expect(failureFields(record)).toContain("penetration_test.date");
  });
});

describe("OpenSSF Scorecard target", () => {
  it("accepts a tracked score at the target", () => {
    const record = pendingRecord();
    record.openssf_scorecard.status = "tracked";
    record.openssf_scorecard.latest_score = 8;

    expect(evaluate(record).ok).toBe(true);
  });

  it("rejects a tracked score below the target", () => {
    const record = pendingRecord();
    record.openssf_scorecard.status = "tracked";
    record.openssf_scorecard.latest_score = 7.5;

    const evaluation = evaluate(record);
    expect(evaluation.ok).toBe(false);
    expect(failureFields(record)).toContain("openssf_scorecard.latest_score");
    expect(evaluation.failures[0]?.message).toContain("below the target");
  });

  it("rejects a tracked status without a recorded score", () => {
    const record = pendingRecord();
    record.openssf_scorecard.status = "tracked";
    record.openssf_scorecard.latest_score = null;

    expect(failureFields(record)).toContain("openssf_scorecard.latest_score");
  });
});

describe("review freshness", () => {
  it("accepts a review at exactly the 180-day boundary", () => {
    const record = pendingRecord();
    record.last_reviewed_at = "2026-05-09";

    expect(evaluate(record).ok).toBe(true);
    expect(REVIEW_MAX_AGE_DAYS).toBe(180);
  });

  it("rejects a review older than 180 days", () => {
    const record = pendingRecord();
    record.last_reviewed_at = "2025-01-01";

    const evaluation = evaluate(record);
    expect(evaluation.ok).toBe(false);
    expect(failureFields(record)).toContain("last_reviewed_at");
    expect(evaluation.failures[0]?.message).toContain("180");
  });
});

describe("CLI contract", () => {
  it("defaults to --check against the repository record", () => {
    const parsed = parseCliArgs([]);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.options.json).toBe(false);
      expect(parsed.options.file.replaceAll("\\", "/")).toContain(
        "docs/security/external-validation.json",
      );
    }
  });

  it("fails closed on an unknown argument", () => {
    expect(parseCliArgs(["--verbose"]).ok).toBe(false);
  });

  it("emits a stable JSON report and exits 0 for the seeded record", () => {
    const lines: string[] = [];
    const exitCode = runCli(["--json"], {
      readFile: () => JSON.stringify(pendingRecord()),
      now: () => NOW,
      stdout: (line) => lines.push(line),
      stderr: () => {},
    });

    expect(exitCode).toBe(0);
    const report = JSON.parse(lines.join("\n")) as Record<string, unknown>;
    expect(Object.keys(report).sort()).toEqual([
      "checked_at",
      "failures",
      "ok",
      "source",
      "status",
    ]);
    expect(report.ok).toBe(true);
    expect(report.checked_at).toBe("2026-11-05");
    expect(report.failures).toEqual([]);
    expect(report.status).toMatchObject({
      penetration_test: "pending",
      bug_bounty: "pending",
      openssf_scorecard: "pending",
      slsa: "pending",
      sigstore: "pending",
      last_reviewed_at: "2026-11-05",
    });
  });

  it("returns exit code 2 when the record cannot be read", () => {
    const errors: string[] = [];
    const exitCode = runCli([], {
      readFile: () => {
        throw new Error("ENOENT: no such file");
      },
      now: () => NOW,
      stdout: () => {},
      stderr: (line) => errors.push(line),
    });

    expect(exitCode).toBe(2);
    expect(errors.join(" ")).toContain("Could not read");
  });

  it("returns exit code 1 for a schema violation", () => {
    const record = pendingRecord();
    record.penetration_test.status = "unknown";
    const errors: string[] = [];
    const exitCode = runCli([], {
      readFile: () => JSON.stringify(record),
      now: () => NOW,
      stdout: () => {},
      stderr: (line) => errors.push(line),
    });

    expect(exitCode).toBe(1);
    expect(errors.join(" ")).toContain("schema validation");
  });
});

describe("report rendering", () => {
  it("renders every metric row and the pass marker", () => {
    const document = parseRecord(pendingRecord());
    const evaluation = evaluateExternalValidation(document, NOW);
    const table = renderStatusTable(document, evaluation, NOW);

    for (const label of [
      "Penetration test",
      "Bug bounty",
      "OpenSSF Scorecard",
      "SLSA",
      "Sigstore",
      "Last review",
    ]) {
      expect(table).toContain(label);
    }
    expect(table).toContain("✓");
  });

  it("buildJsonReport keeps the failure list machine-readable", () => {
    const document = parseRecord(pendingRecord());
    const evaluation = evaluateExternalValidation(document, NOW);
    const report = buildJsonReport(document, evaluation, {
      now: NOW,
      source: "docs/security/external-validation.json",
    });

    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
    expect(report.status.penetration_test).toBe("pending");
    expect(report.source).toBe("docs/security/external-validation.json");
  });
});
