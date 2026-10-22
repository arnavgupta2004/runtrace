/**
 * __tests__/parser/samples.test.ts
 *
 * Parses the actual sample ZIP archives from public/samples/ using the real
 * parseZip() pipeline (no mocking).  Verifies that each archive produces a
 * valid ExperimentRun with the expected shape and that the comparator and
 * auditor behave correctly on them.
 *
 * These tests serve as an integration guard: if the sample ZIPs become
 * inconsistent with the parser, these tests will fail.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { parseZip } from "@/lib/parser";
import { compareRuns } from "@/lib/comparator";
import { auditRun } from "@/lib/auditor";
import type { ExperimentRun } from "@/lib/schema";

// ---------------------------------------------------------------------------
// Read the sample archives once before all tests.
// ---------------------------------------------------------------------------

function readSampleFile(name: string): File {
  const buf = readFileSync(
    resolve(__dirname, "../../public/samples", name)
  );
  return new File([buf], name, { type: "application/zip" });
}

let baseline: ExperimentRun;
let improved: ExperimentRun;
let warning: ExperimentRun;

beforeAll(async () => {
  const [r1, r2, r3] = await Promise.all([
    parseZip(readSampleFile("baseline-experiment.zip")),
    parseZip(readSampleFile("improved-experiment.zip")),
    parseZip(readSampleFile("reproducibility-warning.zip")),
  ]);

  if (!r1.ok) throw new Error(`baseline parse failed: ${r1.error}`);
  if (!r2.ok) throw new Error(`improved parse failed: ${r2.error}`);
  if (!r3.ok) throw new Error(`warning parse failed: ${r3.error}`);

  baseline = r1.run;
  improved = r2.run;
  warning = r3.run;
});

// ---------------------------------------------------------------------------
// Baseline experiment
// ---------------------------------------------------------------------------

describe("Sample: baseline-experiment", () => {
  it("parses successfully with ok: true", async () => {
    const result = await parseZip(readSampleFile("baseline-experiment.zip"));
    expect(result.ok).toBe(true);
  });

  it("has expected metrics (accuracy, loss)", () => {
    expect(typeof baseline.metrics.accuracy).toBe("number");
    expect(typeof baseline.metrics.loss).toBe("number");
    expect(Number.isFinite(baseline.metrics.accuracy)).toBe(true);
  });

  it("has a git revision", () => {
    expect(baseline.metadata.gitRevision).toBeTruthy();
  });

  it("git is not dirty", () => {
    expect(baseline.metadata.gitDirty).toBe(false);
  });

  it("has random seeds", () => {
    expect(Object.keys(baseline.metadata.randomSeeds).length).toBeGreaterThan(0);
  });

  it("has dataset identifiers", () => {
    expect(baseline.metadata.datasetIdentifiers.length).toBeGreaterThan(0);
  });

  it("has eval splits", () => {
    expect(baseline.metadata.evalSplits.length).toBeGreaterThan(0);
  });

  it("has dependency versions", () => {
    expect(Object.keys(baseline.metadata.dependencyVersions).length).toBeGreaterThan(0);
  });

  it("produces a 'good' audit score", () => {
    const report = auditRun(baseline);
    expect(report.overallScore).toBe("good");
  });
});

// ---------------------------------------------------------------------------
// Improved experiment
// ---------------------------------------------------------------------------

describe("Sample: improved-experiment", () => {
  it("parses successfully", async () => {
    const result = await parseZip(readSampleFile("improved-experiment.zip"));
    expect(result.ok).toBe(true);
  });

  it("has a higher accuracy than baseline", () => {
    expect(improved.metrics.accuracy).toBeGreaterThan(baseline.metrics.accuracy);
  });

  it("has a lower loss than baseline", () => {
    expect(improved.metrics.loss).toBeLessThan(baseline.metrics.loss);
  });

  it("produces a 'good' audit score", () => {
    const report = auditRun(improved);
    expect(report.overallScore).toBe("good");
  });

  it("has the same dataset as baseline", () => {
    const baselineDs = baseline.metadata.datasetIdentifiers.map((d) => d.name).sort();
    const improvedDs = improved.metadata.datasetIdentifiers.map((d) => d.name).sort();
    expect(improvedDs).toEqual(baselineDs);
  });
});

// ---------------------------------------------------------------------------
// Reproducibility warning experiment
// ---------------------------------------------------------------------------

describe("Sample: reproducibility-warning", () => {
  it("parses successfully", async () => {
    const result = await parseZip(readSampleFile("reproducibility-warning.zip"));
    expect(result.ok).toBe(true);
  });

  it("has gitDirty: true", () => {
    expect(warning.metadata.gitDirty).toBe(true);
  });

  it("produces a 'poor' audit score (dirty git)", () => {
    const report = auditRun(warning);
    expect(report.overallScore).toBe("poor");
  });

  it("has a different dataset than baseline", () => {
    const baselineDs = baseline.metadata.datasetIdentifiers.map((d) => d.name);
    const warningDs = warning.metadata.datasetIdentifiers.map((d) => d.name);
    // At least one name differs
    const different = warningDs.some((n) => !baselineDs.includes(n));
    expect(different).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Comparator integration
// ---------------------------------------------------------------------------

describe("Sample comparator integration", () => {
  it("baseline + improved are compatible (same dataset and split)", () => {
    const result = compareRuns([baseline, improved], "accuracy", "maximize");
    expect(result.compatibility.status).toBe("compatible");
  });

  it("improved ranks #1 when maximising accuracy", () => {
    const result = compareRuns([baseline, improved], "accuracy", "maximize");
    const rank1 = result.ranking.find((r) => r.rank === 1);
    expect(rank1?.run.id).toBe("improved-experiment");
  });

  it("baseline + warning show a mismatch (different dataset/split)", () => {
    const result = compareRuns([baseline, warning], "accuracy", "maximize");
    expect(result.compatibility.status).toBe("mismatch");
  });

  it("all three runs together show a mismatch", () => {
    const result = compareRuns([baseline, improved, warning], "accuracy", "maximize");
    expect(result.compatibility.status).toBe("mismatch");
  });

  it("removing warning run makes baseline+improved compatible again", () => {
    // Simulate user removing the warning run.
    const result = compareRuns([baseline, improved], "accuracy", "maximize");
    expect(result.compatibility.status).toBe("compatible");
  });
});

// ---------------------------------------------------------------------------
// Audit integration
// ---------------------------------------------------------------------------

describe("Sample audit integration", () => {
  it("all runs have 5 audit checks", () => {
    for (const run of [baseline, improved, warning]) {
      const report = auditRun(run);
      expect(report.checks).toHaveLength(5);
    }
  });

  it("warning run's git_revision check is 'problem'", () => {
    const report = auditRun(warning);
    const gitCheck = report.checks.find((c) => c.dimension === "git_revision");
    expect(gitCheck?.status).toBe("problem");
  });

  it("baseline run's git_revision check is 'confirmed'", () => {
    const report = auditRun(baseline);
    const gitCheck = report.checks.find((c) => c.dimension === "git_revision");
    expect(gitCheck?.status).toBe("confirmed");
  });
});
