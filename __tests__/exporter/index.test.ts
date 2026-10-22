/**
 * __tests__/exporter/index.test.ts
 *
 * Tests for lib/exporter/markdown.ts and lib/exporter/json.ts
 */

import { describe, it, expect } from "vitest";
import { toMarkdown, escapeMdCell, escapeMdInline } from "@/lib/exporter/markdown";
import { toJSON } from "@/lib/exporter/json";
import type {
  ExportPayload,
  ComparisonResult,
  AuditReport,
  RankedRun,
  CompatibilityResult,
} from "@/lib/schema";
import {
  makeRun,
  makeDatasetRef,
  makeEvalSplit,
  makeArtifacts,
} from "../helpers/factories";

// ---------------------------------------------------------------------------
// Payload factory helpers
// ---------------------------------------------------------------------------

const FIXED_DATE = "2024-01-15T10:00:00.000Z";

function makeCompatibility(
  status: CompatibilityResult["status"],
  reason = "Test reason.",
  overrides: Partial<CompatibilityResult> = {}
): CompatibilityResult {
  return {
    status,
    reason,
    runsWithMissingMetadata: [],
    datasetNames: [],
    splitNames: [],
    ...overrides,
  };
}

function makeRankedRun(
  id: string,
  rank: number,
  metricValue: number | null,
  delta: number | null,
  nameOverride?: string
): RankedRun {
  const run = makeRun(id, metricValue !== null ? { accuracy: metricValue } : {});
  if (nameOverride) (run as { name: string }).name = nameOverride;
  return { run, rank, metricValue, delta };
}

function makeComparison(
  overrides: Partial<ComparisonResult> = {}
): ComparisonResult {
  const runA = makeRun("run-a", { accuracy: 0.95 });
  const runB = makeRun("run-b", { accuracy: 0.88 });
  return {
    runs: [runA, runB],
    metric: "accuracy",
    direction: "maximize",
    ranking: [
      { run: runA, rank: 1, metricValue: 0.95, delta: 0 },
      { run: runB, rank: 2, metricValue: 0.88, delta: -0.07 },
    ],
    compatibility: makeCompatibility("compatible", "All runs report matching dataset identifiers and evaluation splits."),
    ...overrides,
  };
}

function makeAudit(
  runId: string,
  overrides: Partial<AuditReport> = {}
): AuditReport {
  return {
    runId,
    overallScore: "good",
    checks: [
      { dimension: "git_revision", status: "confirmed", evidence: ["git_info.json"], message: "Git revision recorded: abc123." },
      { dimension: "random_seeds", status: "confirmed", evidence: ["config.yaml"], message: "Random seed(s) recorded: seed=42." },
      { dimension: "dataset_identifiers", status: "confirmed", evidence: ["config.yaml"], message: "Dataset identifier(s) recorded: cifar10." },
      { dimension: "eval_splits", status: "confirmed", evidence: ["config.yaml"], message: "Evaluation split(s) recorded: test." },
      { dimension: "dependency_versions", status: "confirmed", evidence: ["requirements.txt"], message: "2 dependency/ies recorded with exact version pins." },
    ],
    ...overrides,
  };
}

function makePayload(
  compOverrides: Partial<ComparisonResult> = {},
  auditOverrides: Partial<AuditReport>[] = []
): ExportPayload {
  const comparison = makeComparison(compOverrides);
  const defaultAudits = comparison.runs.map((r) => makeAudit(r.id));
  const audits = auditOverrides.length > 0
    ? defaultAudits.map((a, i) => ({ ...a, ...(auditOverrides[i] ?? {}) }))
    : defaultAudits;
  return { comparison, audits };
}

// ---------------------------------------------------------------------------
// Markdown — structural tests
// ---------------------------------------------------------------------------

describe("toMarkdown — structure", () => {
  it("includes a title", () => {
    const md = toMarkdown(makePayload(), { generatedAt: FIXED_DATE });
    expect(md).toMatch(/^# Runtrace Report/m);
  });

  it("includes the generated date", () => {
    const md = toMarkdown(makePayload(), { generatedAt: FIXED_DATE });
    expect(md).toContain(FIXED_DATE);
  });

  it("includes Comparison Overview section", () => {
    const md = toMarkdown(makePayload(), { generatedAt: FIXED_DATE });
    expect(md).toMatch(/## Comparison Overview/);
  });

  it("includes metric name and direction", () => {
    const md = toMarkdown(makePayload(), { generatedAt: FIXED_DATE });
    expect(md).toMatch(/accuracy/);
    expect(md).toMatch(/maximize/);
  });

  it("includes Metric Rankings section with table header", () => {
    const md = toMarkdown(makePayload(), { generatedAt: FIXED_DATE });
    expect(md).toMatch(/## Metric Rankings/);
    expect(md).toMatch(/\| Rank \| Run \|/);
  });

  it("includes Reproducibility Audits section", () => {
    const md = toMarkdown(makePayload(), { generatedAt: FIXED_DATE });
    expect(md).toMatch(/## Reproducibility Audits/);
  });

  it("includes Limitations section", () => {
    const md = toMarkdown(makePayload(), { generatedAt: FIXED_DATE });
    expect(md).toMatch(/## Limitations/);
  });

  it("includes Dataset / Split Compatibility subsection", () => {
    const md = toMarkdown(makePayload(), { generatedAt: FIXED_DATE });
    expect(md).toMatch(/Dataset \/ Split Compatibility/);
  });
});

// ---------------------------------------------------------------------------
// Markdown — ranking table
// ---------------------------------------------------------------------------

describe("toMarkdown — ranking table", () => {
  it("renders correct rank and run name", () => {
    const md = toMarkdown(makePayload(), { generatedAt: FIXED_DATE });
    expect(md).toMatch(/\| 1 \| run-a \|/);
    expect(md).toMatch(/\| 2 \| run-b \|/);
  });

  it("renders metric values in table cells", () => {
    const md = toMarkdown(makePayload(), { generatedAt: FIXED_DATE });
    expect(md).toMatch(/0\.95/);
    expect(md).toMatch(/0\.88/);
  });

  it("renders rank-1 delta as 0", () => {
    const md = toMarkdown(makePayload(), { generatedAt: FIXED_DATE });
    // First data row should have delta 0
    const lines = md.split("\n").filter((l) => l.startsWith("| 1 |"));
    expect(lines[0]).toMatch(/\| 0 \|/);
  });

  it("renders negative delta with minus sign for maximize", () => {
    const md = toMarkdown(makePayload(), { generatedAt: FIXED_DATE });
    // Second run should have −0.07 (using proper minus sign character)
    expect(md).toMatch(/−0\.07/);
  });

  it("renders positive delta with + sign for minimize", () => {
    const runA = makeRun("best", { loss: 0.08 });
    const runB = makeRun("worse", { loss: 0.20 });
    const comparison: ComparisonResult = {
      runs: [runA, runB],
      metric: "loss",
      direction: "minimize",
      ranking: [
        { run: runA, rank: 1, metricValue: 0.08, delta: 0 },
        { run: runB, rank: 2, metricValue: 0.20, delta: 0.12 },
      ],
      compatibility: makeCompatibility("compatible"),
    };
    const md = toMarkdown({ comparison, audits: [] }, { generatedAt: FIXED_DATE });
    expect(md).toMatch(/\+0\.12/);
  });

  it("renders null metricValue as em dash", () => {
    const runA = makeRun("run-a", { accuracy: 0.9 });
    const runB = makeRun("run-b", {}); // no accuracy metric
    const comparison: ComparisonResult = {
      runs: [runA, runB],
      metric: "accuracy",
      direction: "maximize",
      ranking: [
        { run: runA, rank: 1, metricValue: 0.9, delta: 0 },
        { run: runB, rank: 2, metricValue: null, delta: null },
      ],
      compatibility: makeCompatibility("compatible"),
    };
    const md = toMarkdown({ comparison, audits: [] }, { generatedAt: FIXED_DATE });
    // null → "—"
    const runBRows = md.split("\n").filter((l) => l.includes("run-b"));
    expect(runBRows.some((l) => l.includes("—"))).toBe(true);
  });

  it("renders an empty table message when no ranking entries", () => {
    const comparison: ComparisonResult = {
      runs: [],
      metric: "accuracy",
      direction: "maximize",
      ranking: [],
      compatibility: makeCompatibility("compatible"),
    };
    const md = toMarkdown({ comparison, audits: [] }, { generatedAt: FIXED_DATE });
    expect(md).toMatch(/No runs to display/i);
  });
});

// ---------------------------------------------------------------------------
// Markdown — compatibility notices
// ---------------------------------------------------------------------------

describe("toMarkdown — compatibility", () => {
  it("shows a warning block for mismatch status", () => {
    const payload = makePayload({
      compatibility: makeCompatibility(
        "mismatch",
        "Dataset identifiers differ across runs.",
        { datasetNames: ["cifar10", "imagenet"] }
      ),
    });
    const md = toMarkdown(payload, { generatedAt: FIXED_DATE });
    expect(md).toMatch(/Mismatch Detected/);
    expect(md).toMatch(/⚠️/);
    expect(md).toMatch(/Dataset identifiers differ across runs/);
  });

  it("shows an info note for unverified status", () => {
    const payload = makePayload({
      compatibility: makeCompatibility(
        "unverified",
        "Some runs have no metadata recorded.",
        { runsWithMissingMetadata: ["run-b"] }
      ),
    });
    const md = toMarkdown(payload, { generatedAt: FIXED_DATE });
    expect(md).toMatch(/Unverified/);
    expect(md).toMatch(/ℹ️/);
    expect(md).toMatch(/Some runs have no metadata recorded/);
  });

  it("shows compatible without a warning block", () => {
    const payload = makePayload({
      compatibility: makeCompatibility("compatible", "All runs match."),
    });
    const md = toMarkdown(payload, { generatedAt: FIXED_DATE });
    expect(md).toMatch(/Compatible/);
    // No warning icon in compatible case
    const compatSection = md.split("## Metric Rankings")[0];
    expect(compatSection).not.toMatch(/⚠️/);
  });

  it("does not claim scientific superiority in mismatch text", () => {
    const payload = makePayload({
      compatibility: makeCompatibility("mismatch", "Datasets differ."),
    });
    const md = toMarkdown(payload, { generatedAt: FIXED_DATE });
    // These would be unsupported scientific claims
    expect(md).not.toMatch(/one run is better/i);
    expect(md).not.toMatch(/superior/i);
    expect(md).not.toMatch(/definitively incomparable/i);
  });
});

// ---------------------------------------------------------------------------
// Markdown — audit sections
// ---------------------------------------------------------------------------

describe("toMarkdown — audit sections", () => {
  it("includes one audit section per run", () => {
    const md = toMarkdown(makePayload(), { generatedAt: FIXED_DATE });
    expect(md).toMatch(/### Run: run-a/);
    expect(md).toMatch(/### Run: run-b/);
  });

  it("shows correct overall score label", () => {
    const payload = makePayload({}, [
      { overallScore: "good" },
      { overallScore: "poor" },
    ]);
    const md = toMarkdown(payload, { generatedAt: FIXED_DATE });
    expect(md).toMatch(/✅ Good/);
    expect(md).toMatch(/❌ Poor/);
  });

  it("renders all five audit dimensions in the table", () => {
    const md = toMarkdown(makePayload(), { generatedAt: FIXED_DATE });
    expect(md).toMatch(/Git Revision/);
    expect(md).toMatch(/Random Seeds/);
    expect(md).toMatch(/Dataset Identifiers/);
    expect(md).toMatch(/Evaluation Splits/);
    expect(md).toMatch(/Dependency Versions/);
  });

  it("renders confirmed / missing / problem status icons", () => {
    const payload = makePayload({}, [
      {
        overallScore: "poor",
        checks: [
          { dimension: "git_revision", status: "problem", evidence: ["git_info.json"], message: "Dirty." },
          { dimension: "random_seeds", status: "missing", evidence: [], message: "No seeds." },
          { dimension: "dataset_identifiers", status: "confirmed", evidence: ["config.yaml"], message: "Found." },
          { dimension: "eval_splits", status: "missing", evidence: [], message: "No splits." },
          { dimension: "dependency_versions", status: "confirmed", evidence: ["requirements.txt"], message: "Pinned." },
        ],
      },
    ]);
    const md = toMarkdown(payload, { generatedAt: FIXED_DATE });
    expect(md).toMatch(/⚠️ Problem/);
    expect(md).toMatch(/❓ Missing/);
    expect(md).toMatch(/✅ Confirmed/);
  });

  it("lists evidence file paths under the audit table", () => {
    const md = toMarkdown(makePayload(), { generatedAt: FIXED_DATE });
    expect(md).toMatch(/`git_info\.json`/);
    expect(md).toMatch(/`requirements\.txt`/);
  });

  it("skips evidence block when no checks have evidence", () => {
    const noEvidenceChecks = [
      { dimension: "git_revision" as const, status: "missing" as const, evidence: [], message: "No revision." },
      { dimension: "random_seeds" as const, status: "missing" as const, evidence: [], message: "No seeds." },
      { dimension: "dataset_identifiers" as const, status: "missing" as const, evidence: [], message: "No datasets." },
      { dimension: "eval_splits" as const, status: "missing" as const, evidence: [], message: "No splits." },
      { dimension: "dependency_versions" as const, status: "missing" as const, evidence: [], message: "No deps." },
    ];
    // Override BOTH audits so neither has any evidence.
    const payload = makePayload({}, [
      { overallScore: "partial", checks: noEvidenceChecks },
      { overallScore: "partial", checks: noEvidenceChecks },
    ]);
    const md = toMarkdown(payload, { generatedAt: FIXED_DATE });
    expect(md).not.toMatch(/Evidence sources/);
  });

  it("renders audit section when audits array is empty", () => {
    const comparison = makeComparison();
    const md = toMarkdown({ comparison, audits: [] }, { generatedAt: FIXED_DATE });
    // No "## Reproducibility Audits" when audits is empty
    expect(md).not.toMatch(/## Reproducibility Audits/);
  });
});

// ---------------------------------------------------------------------------
// Markdown — Markdown injection / escaping
// ---------------------------------------------------------------------------

describe("toMarkdown — Markdown escaping", () => {
  it("escapes pipe characters in run names inside table cells", () => {
    const runWithPipe = makeRun("run|name");
    const comparison: ComparisonResult = {
      runs: [runWithPipe],
      metric: "accuracy",
      direction: "maximize",
      ranking: [{ run: runWithPipe, rank: 1, metricValue: 0.9, delta: 0 }],
      compatibility: makeCompatibility("compatible"),
    };
    const md = toMarkdown({ comparison, audits: [] }, { generatedAt: FIXED_DATE });
    // Raw "|" in the run name should be escaped to &#124;
    expect(md).toMatch(/&#124;/);
    // Should not contain an unescaped "run|name" inside a table row
    const tableRows = md.split("\n").filter((l) => l.startsWith("| 1 |"));
    expect(tableRows.every((r) => !r.includes("run|name"))).toBe(true);
  });

  it("strips newlines from run names in table cells", () => {
    const runWithNewline = makeRun("run\nname");
    const comparison: ComparisonResult = {
      runs: [runWithNewline],
      metric: "accuracy",
      direction: "maximize",
      ranking: [{ run: runWithNewline, rank: 1, metricValue: 0.9, delta: 0 }],
      compatibility: makeCompatibility("compatible"),
    };
    const md = toMarkdown({ comparison, audits: [] }, { generatedAt: FIXED_DATE });
    // Table row should not contain a literal newline inside the cell
    const tableRows = md.split("\n").filter((l) => l.startsWith("| 1 |"));
    expect(tableRows).toHaveLength(1); // not split across two lines
    expect(tableRows[0]).toMatch(/run name/); // newline replaced with space
  });

  it("escapes pipes in file path evidence", () => {
    const payload = makePayload({}, [
      {
        checks: [
          {
            dimension: "git_revision",
            status: "confirmed",
            evidence: ["path/to/file|with|pipes.json"],
            message: "Found.",
          },
          { dimension: "random_seeds", status: "missing", evidence: [], message: "." },
          { dimension: "dataset_identifiers", status: "missing", evidence: [], message: "." },
          { dimension: "eval_splits", status: "missing", evidence: [], message: "." },
          { dimension: "dependency_versions", status: "missing", evidence: [], message: "." },
        ],
        overallScore: "partial",
      },
    ]);
    const md = toMarkdown(payload, { generatedAt: FIXED_DATE });
    // Pipes in evidence paths should be escaped in the inline code span
    expect(md).not.toMatch(/file\|with\|pipes/);
  });

  it("escapes backticks in evidence paths inside inline code spans", () => {
    const payload = makePayload({}, [
      {
        checks: [
          {
            dimension: "git_revision",
            status: "confirmed",
            evidence: ["path/with`backtick.json"],
            message: "Found.",
          },
          { dimension: "random_seeds", status: "missing", evidence: [], message: "." },
          { dimension: "dataset_identifiers", status: "missing", evidence: [], message: "." },
          { dimension: "eval_splits", status: "missing", evidence: [], message: "." },
          { dimension: "dependency_versions", status: "missing", evidence: [], message: "." },
        ],
        overallScore: "partial",
      },
    ]);
    const md = toMarkdown(payload, { generatedAt: FIXED_DATE });
    // A raw backtick would break the inline code span; it should be replaced
    expect(md).not.toMatch(/`path\/with`backtick/);
  });

  it("strips newlines from run names in heading", () => {
    const runWithNewline = makeRun("run\nwith\nnewlines");
    const audit = makeAudit("run\nwith\nnewlines");
    const comparison: ComparisonResult = {
      runs: [runWithNewline],
      metric: "accuracy",
      direction: "maximize",
      ranking: [{ run: runWithNewline, rank: 1, metricValue: 0.9, delta: 0 }],
      compatibility: makeCompatibility("compatible"),
    };
    const md = toMarkdown({ comparison, audits: [audit] }, { generatedAt: FIXED_DATE });
    // Heading should be a single line
    const headingLines = md.split("\n").filter((l) => l.startsWith("### Run:"));
    expect(headingLines).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Markdown — escape helper unit tests
// ---------------------------------------------------------------------------

describe("escapeMdCell", () => {
  it("replaces pipe with &#124;", () => {
    expect(escapeMdCell("a|b")).toBe("a&#124;b");
  });
  it("replaces newline with space", () => {
    expect(escapeMdCell("a\nb")).toBe("a b");
  });
  it("replaces CRLF with space", () => {
    expect(escapeMdCell("a\r\nb")).toBe("a b");
  });
  it("leaves plain text unchanged", () => {
    expect(escapeMdCell("hello world")).toBe("hello world");
  });
});

describe("escapeMdInline", () => {
  it("replaces backtick", () => {
    expect(escapeMdInline("a`b")).toBe("aʼb");
  });
  it("replaces newline with space", () => {
    expect(escapeMdInline("a\nb")).toBe("a b");
  });
});

// ---------------------------------------------------------------------------
// Markdown — determinism
// ---------------------------------------------------------------------------

describe("toMarkdown — determinism", () => {
  it("produces identical output for identical inputs", () => {
    const payload = makePayload();
    const a = toMarkdown(payload, { generatedAt: FIXED_DATE });
    const b = toMarkdown(payload, { generatedAt: FIXED_DATE });
    expect(a).toBe(b);
  });
});

// ---------------------------------------------------------------------------
// Markdown — immutability
// ---------------------------------------------------------------------------

describe("toMarkdown — immutability", () => {
  it("does not mutate the payload", () => {
    const payload = makePayload();
    const originalMetric = payload.comparison.metric;
    const originalRunsLength = payload.comparison.runs.length;
    toMarkdown(payload, { generatedAt: FIXED_DATE });
    expect(payload.comparison.metric).toBe(originalMetric);
    expect(payload.comparison.runs).toHaveLength(originalRunsLength);
  });
});

// ---------------------------------------------------------------------------
// Markdown — limitations section
// ---------------------------------------------------------------------------

describe("toMarkdown — limitations", () => {
  it("includes caveat that good score does not prove reproducibility", () => {
    const md = toMarkdown(makePayload(), { generatedAt: FIXED_DATE });
    expect(md).toMatch(/does not prove/i);
  });

  it("includes caveat that missing metadata is not fabricated", () => {
    const md = toMarkdown(makePayload(), { generatedAt: FIXED_DATE });
    expect(md).toMatch(/fabricated/i);
  });
});

// ---------------------------------------------------------------------------
// JSON — structure and correctness
// ---------------------------------------------------------------------------

describe("toJSON — structure", () => {
  it("produces valid JSON", () => {
    const json = toJSON(makePayload());
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("pretty-prints with 2-space indent", () => {
    const json = toJSON(makePayload());
    // Check that the second line is indented by exactly 2 spaces.
    const lines = json.split("\n");
    expect(lines[1].startsWith("  ")).toBe(true);
    expect(lines[1].startsWith("   ")).toBe(false);
  });

  it("preserves comparison.metric", () => {
    const parsed = JSON.parse(toJSON(makePayload()));
    expect(parsed.comparison.metric).toBe("accuracy");
  });

  it("preserves comparison.direction", () => {
    const parsed = JSON.parse(toJSON(makePayload()));
    expect(parsed.comparison.direction).toBe("maximize");
  });

  it("preserves ranking rank, metricValue, and delta", () => {
    const parsed = JSON.parse(toJSON(makePayload()));
    expect(parsed.comparison.ranking[0].rank).toBe(1);
    expect(parsed.comparison.ranking[0].metricValue).toBeCloseTo(0.95);
    expect(parsed.comparison.ranking[0].delta).toBe(0);
    expect(parsed.comparison.ranking[1].rank).toBe(2);
    expect(parsed.comparison.ranking[1].metricValue).toBeCloseTo(0.88);
    expect(parsed.comparison.ranking[1].delta).toBeCloseTo(-0.07);
  });

  it("preserves null metricValue as JSON null", () => {
    const runA = makeRun("a", { acc: 0.9 });
    const runB = makeRun("b", {});
    const comparison: ComparisonResult = {
      runs: [runA, runB],
      metric: "acc",
      direction: "maximize",
      ranking: [
        { run: runA, rank: 1, metricValue: 0.9, delta: 0 },
        { run: runB, rank: 2, metricValue: null, delta: null },
      ],
      compatibility: makeCompatibility("compatible"),
    };
    const parsed = JSON.parse(toJSON({ comparison, audits: [] }));
    expect(parsed.comparison.ranking[1].metricValue).toBeNull();
    expect(parsed.comparison.ranking[1].delta).toBeNull();
  });

  it("preserves compatibility structure", () => {
    const payload = makePayload({
      compatibility: makeCompatibility("mismatch", "Datasets differ.", {
        datasetNames: ["cifar10", "imagenet"],
      }),
    });
    const parsed = JSON.parse(toJSON(payload));
    expect(parsed.comparison.compatibility.status).toBe("mismatch");
    expect(parsed.comparison.compatibility.datasetNames).toContain("cifar10");
    expect(parsed.comparison.compatibility.datasetNames).toContain("imagenet");
  });

  it("preserves audit checks, statuses, and evidence", () => {
    const parsed = JSON.parse(toJSON(makePayload()));
    const audit = parsed.audits[0];
    expect(audit.runId).toBe("run-a");
    expect(audit.overallScore).toBe("good");
    expect(audit.checks).toHaveLength(5);
    const gitCheck = audit.checks.find(
      (c: { dimension: string }) => c.dimension === "git_revision"
    );
    expect(gitCheck.status).toBe("confirmed");
    expect(gitCheck.evidence).toContain("git_info.json");
  });

  it("preserves nested run metadata", () => {
    const runA = makeRun(
      "a",
      { accuracy: 0.9 },
      {
        gitRevision: "abc123",
        randomSeeds: { seed: 42 },
        datasetIdentifiers: [makeDatasetRef("cifar10", "1.0")],
        evalSplits: [makeEvalSplit("test", 10000)],
        dependencyVersions: { numpy: "1.24.0" },
      },
      makeArtifacts({ gitSourceFiles: ["git_info.json"] })
    );
    const comparison: ComparisonResult = {
      runs: [runA],
      metric: "accuracy",
      direction: "maximize",
      ranking: [{ run: runA, rank: 1, metricValue: 0.9, delta: 0 }],
      compatibility: makeCompatibility("compatible"),
    };
    const parsed = JSON.parse(toJSON({ comparison, audits: [] }));
    const run = parsed.comparison.runs[0];
    expect(run.metadata.gitRevision).toBe("abc123");
    expect(run.metadata.randomSeeds.seed).toBe(42);
    expect(run.metadata.datasetIdentifiers[0].name).toBe("cifar10");
    expect(run.metadata.datasetIdentifiers[0].version).toBe("1.0");
    expect(run.metadata.evalSplits[0].size).toBe(10000);
    expect(run.metadata.dependencyVersions.numpy).toBe("1.24.0");
  });
});

// ---------------------------------------------------------------------------
// JSON — non-finite value handling
// ---------------------------------------------------------------------------

describe("toJSON — non-finite metric values", () => {
  it("replaces NaN with __INVALID_METRIC__ sentinel", () => {
    const run = makeRun("a", {});
    // Inject NaN bypassing the parser (simulates a bad caller).
    (run.metrics as Record<string, unknown>)["bad"] = NaN;
    const comparison: ComparisonResult = {
      runs: [run],
      metric: "bad",
      direction: "maximize",
      ranking: [{ run, rank: 1, metricValue: null, delta: null }],
      compatibility: makeCompatibility("compatible"),
    };
    const parsed = JSON.parse(toJSON({ comparison, audits: [] }));
    // NaN would silently become null in plain JSON.stringify;
    // our exporter makes it explicit.
    expect(parsed.comparison.runs[0].metrics.bad).toBe("__INVALID_METRIC__");
  });

  it("valid finite metrics are serialised as numbers", () => {
    const parsed = JSON.parse(toJSON(makePayload()));
    expect(typeof parsed.comparison.runs[0].metrics.accuracy).toBe("number");
    expect(parsed.comparison.runs[0].metrics.accuracy).toBeCloseTo(0.95);
  });
});

// ---------------------------------------------------------------------------
// JSON — determinism
// ---------------------------------------------------------------------------

describe("toJSON — determinism", () => {
  it("produces identical output for identical inputs", () => {
    const payload = makePayload();
    expect(toJSON(payload)).toBe(toJSON(payload));
  });
});

// ---------------------------------------------------------------------------
// JSON — immutability
// ---------------------------------------------------------------------------

describe("toJSON — immutability", () => {
  it("does not mutate the payload", () => {
    const run = makeRun("a", { accuracy: 0.9 });
    const comparison: ComparisonResult = {
      runs: [run],
      metric: "accuracy",
      direction: "maximize",
      ranking: [{ run, rank: 1, metricValue: 0.9, delta: 0 }],
      compatibility: makeCompatibility("compatible"),
    };
    const payload = { comparison, audits: [] };
    toJSON(payload);
    // Original run metrics should still be a finite number.
    expect(typeof run.metrics.accuracy).toBe("number");
    expect(run.metrics.accuracy).toBe(0.9);
  });

  it("does not mutate even when NaN is injected", () => {
    const run = makeRun("a", {});
    (run.metrics as Record<string, unknown>)["bad"] = NaN;
    const comparison: ComparisonResult = {
      runs: [run],
      metric: "bad",
      direction: "maximize",
      ranking: [{ run, rank: 1, metricValue: null, delta: null }],
      compatibility: makeCompatibility("compatible"),
    };
    toJSON({ comparison, audits: [] });
    // Original run.metrics.bad should still be NaN.
    expect(Number.isNaN(run.metrics.bad)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// JSON — no browser / DOM APIs
// ---------------------------------------------------------------------------

describe("toJSON — no DOM dependency", () => {
  it("runs without any browser globals (pure Node environment)", () => {
    // If toJSON or toMarkdown access document/window they would throw here.
    // No assertions needed beyond the function not throwing.
    expect(() => toJSON(makePayload())).not.toThrow();
  });
});

describe("toMarkdown — no DOM dependency", () => {
  it("runs without any browser globals", () => {
    expect(() => toMarkdown(makePayload(), { generatedAt: FIXED_DATE })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// JSON — complete payload round-trip
// ---------------------------------------------------------------------------

describe("toJSON — round-trip completeness", () => {
  it("includes all top-level keys: comparison and audits", () => {
    const parsed = JSON.parse(toJSON(makePayload()));
    expect(parsed).toHaveProperty("comparison");
    expect(parsed).toHaveProperty("audits");
  });

  it("includes all ComparisonResult keys", () => {
    const parsed = JSON.parse(toJSON(makePayload()));
    const c = parsed.comparison;
    expect(c).toHaveProperty("runs");
    expect(c).toHaveProperty("metric");
    expect(c).toHaveProperty("direction");
    expect(c).toHaveProperty("ranking");
    expect(c).toHaveProperty("compatibility");
  });

  it("handles an empty comparison gracefully", () => {
    const comparison: ComparisonResult = {
      runs: [],
      metric: "accuracy",
      direction: "maximize",
      ranking: [],
      compatibility: makeCompatibility("compatible", "No runs."),
    };
    const parsed = JSON.parse(toJSON({ comparison, audits: [] }));
    expect(parsed.comparison.runs).toHaveLength(0);
    expect(parsed.audits).toHaveLength(0);
  });
});
