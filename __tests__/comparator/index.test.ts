/**
 * __tests__/comparator/index.test.ts
 *
 * Tests for lib/comparator/index.ts
 */

import { describe, it, expect } from "vitest";
import { compareRuns, assessCompatibility } from "@/lib/comparator/index";
import {
  makeRun,
  makeMetadata,
  makeDatasetRef,
  makeEvalSplit,
} from "../helpers/factories";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rankingsOf(result: ReturnType<typeof compareRuns>) {
  return result.ranking.map((r) => ({
    id: r.run.id,
    rank: r.rank,
    value: r.metricValue,
    delta: r.delta,
  }));
}

// ---------------------------------------------------------------------------
// Basic ranking — maximize
// ---------------------------------------------------------------------------

describe("compareRuns — maximize", () => {
  it("ranks runs in descending order", () => {
    const runs = [
      makeRun("a", { accuracy: 0.80 }),
      makeRun("b", { accuracy: 0.95 }),
      makeRun("c", { accuracy: 0.88 }),
    ];
    const result = compareRuns(runs, "accuracy", "maximize");
    const ranks = rankingsOf(result);
    expect(ranks[0]).toMatchObject({ id: "b", rank: 1, value: 0.95 });
    expect(ranks[1]).toMatchObject({ id: "c", rank: 2, value: 0.88 });
    expect(ranks[2]).toMatchObject({ id: "a", rank: 3, value: 0.80 });
  });

  it("rank-1 run has delta of 0", () => {
    const runs = [makeRun("a", { acc: 0.9 }), makeRun("b", { acc: 0.8 })];
    const result = compareRuns(runs, "acc", "maximize");
    expect(result.ranking[0].delta).toBe(0);
  });

  it("computes correct deltas (maximize: lower values are negative)", () => {
    const runs = [
      makeRun("best", { acc: 0.95 }),
      makeRun("mid", { acc: 0.88 }),
      makeRun("low", { acc: 0.80 }),
    ];
    const result = compareRuns(runs, "acc", "maximize");
    expect(result.ranking[0].delta).toBe(0);           // best
    expect(result.ranking[1].delta).toBeCloseTo(-0.07); // 0.88 - 0.95
    expect(result.ranking[2].delta).toBeCloseTo(-0.15); // 0.80 - 0.95
  });
});

// ---------------------------------------------------------------------------
// Basic ranking — minimize
// ---------------------------------------------------------------------------

describe("compareRuns — minimize", () => {
  it("ranks runs in ascending order", () => {
    const runs = [
      makeRun("a", { loss: 0.20 }),
      makeRun("b", { loss: 0.08 }),
      makeRun("c", { loss: 0.15 }),
    ];
    const result = compareRuns(runs, "loss", "minimize");
    const ranks = rankingsOf(result);
    expect(ranks[0]).toMatchObject({ id: "b", rank: 1, value: 0.08 });
    expect(ranks[1]).toMatchObject({ id: "c", rank: 2, value: 0.15 });
    expect(ranks[2]).toMatchObject({ id: "a", rank: 3, value: 0.20 });
  });

  it("computes correct deltas (minimize: higher values are positive)", () => {
    const runs = [
      makeRun("best", { loss: 0.08 }),
      makeRun("worse", { loss: 0.20 }),
    ];
    const result = compareRuns(runs, "loss", "minimize");
    expect(result.ranking[0].delta).toBe(0);           // best
    expect(result.ranking[1].delta).toBeCloseTo(0.12); // 0.20 - 0.08
  });
});

// ---------------------------------------------------------------------------
// Tied values
// ---------------------------------------------------------------------------

describe("compareRuns — tied values", () => {
  it("tied runs share the same rank", () => {
    const runs = [
      makeRun("a", { acc: 0.90 }),
      makeRun("b", { acc: 0.90 }),
      makeRun("c", { acc: 0.80 }),
    ];
    const result = compareRuns(runs, "acc", "maximize");
    // Both tied at 0.90 share rank 1.
    const tiedEntries = result.ranking.filter((r) => r.metricValue === 0.90);
    expect(tiedEntries).toHaveLength(2);
    expect(tiedEntries[0].rank).toBe(1);
    expect(tiedEntries[1].rank).toBe(1);
    // The run at 0.80 gets rank 3 (competition ranking: 1, 1, 3).
    const thirdEntry = result.ranking.find((r) => r.metricValue === 0.80);
    expect(thirdEntry?.rank).toBe(3);
  });

  it("breaks ties deterministically by name then id", () => {
    const runs = [
      makeRun("z-run", { acc: 0.90 }),
      makeRun("a-run", { acc: 0.90 }),
    ];
    const result = compareRuns(runs, "acc", "maximize");
    // Same rank, but "a-run" should appear before "z-run" after name sort.
    expect(result.ranking[0].run.id).toBe("a-run");
    expect(result.ranking[1].run.id).toBe("z-run");
    // Both still rank 1.
    expect(result.ranking[0].rank).toBe(1);
    expect(result.ranking[1].rank).toBe(1);
  });

  it("tied rank-1 runs both have delta 0", () => {
    const runs = [
      makeRun("a", { acc: 0.90 }),
      makeRun("b", { acc: 0.90 }),
    ];
    const result = compareRuns(runs, "acc", "maximize");
    expect(result.ranking[0].delta).toBe(0);
    expect(result.ranking[1].delta).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Missing / non-finite metrics
// ---------------------------------------------------------------------------

describe("compareRuns — missing and non-finite metrics", () => {
  it("runs with no value for the selected metric get metricValue: null", () => {
    const runs = [
      makeRun("a", { accuracy: 0.9 }),
      makeRun("b", { loss: 0.1 }), // no accuracy
    ];
    const result = compareRuns(runs, "accuracy", "maximize");
    const bEntry = result.ranking.find((r) => r.run.id === "b");
    expect(bEntry?.metricValue).toBeNull();
    expect(bEntry?.delta).toBeNull();
  });

  it("runs without a value are ranked after runs with a value", () => {
    const runs = [
      makeRun("no-metric", { loss: 0.1 }),
      makeRun("has-metric", { accuracy: 0.9 }),
    ];
    const result = compareRuns(runs, "accuracy", "maximize");
    expect(result.ranking[0].run.id).toBe("has-metric");
    expect(result.ranking[1].run.id).toBe("no-metric");
    expect(result.ranking[0].rank).toBe(1);
    expect(result.ranking[1].rank).toBe(2); // noValueRank = 1 + 1 = 2
  });

  it("all runs missing the metric still returns a result (no crash)", () => {
    const runs = [makeRun("a", { loss: 0.1 }), makeRun("b", { loss: 0.2 })];
    const result = compareRuns(runs, "accuracy", "maximize");
    expect(result.ranking).toHaveLength(2);
    result.ranking.forEach((r) => {
      expect(r.metricValue).toBeNull();
      expect(r.delta).toBeNull();
    });
  });

  it("handles empty run array", () => {
    const result = compareRuns([], "accuracy", "maximize");
    expect(result.ranking).toHaveLength(0);
    expect(result.runs).toHaveLength(0);
  });

  it("non-finite values not present in metrics map (schema guarantee)", () => {
    // The parser strips non-finite values. Even if a caller bypasses the parser,
    // the comparator should defensively exclude them.
    const runWithNaN: typeof makeRun extends (...a: infer A) => infer R ? R : never =
      makeRun("bad");
    // Manually inject non-finite to simulate a bad caller.
    (runWithNaN.metrics as Record<string, number>)["acc"] = NaN;
    const result = compareRuns([runWithNaN], "acc", "maximize");
    const entry = result.ranking[0];
    expect(entry.metricValue).toBeNull();
    expect(entry.rank).toBe(1); // only run, no ranked runs before it
  });
});

// ---------------------------------------------------------------------------
// Result shape
// ---------------------------------------------------------------------------

describe("compareRuns — result shape", () => {
  it("includes original runs array in result", () => {
    const runs = [makeRun("a", { acc: 0.9 })];
    const result = compareRuns(runs, "acc", "maximize");
    expect(result.runs).toHaveLength(1);
    expect(result.runs[0].id).toBe("a");
  });

  it("records the metric and direction", () => {
    const result = compareRuns([makeRun("a", { loss: 0.1 })], "loss", "minimize");
    expect(result.metric).toBe("loss");
    expect(result.direction).toBe("minimize");
  });
});

// ---------------------------------------------------------------------------
// Immutability
// ---------------------------------------------------------------------------

describe("compareRuns — input immutability", () => {
  it("does not mutate the input array", () => {
    const runs = [
      makeRun("b", { acc: 0.8 }),
      makeRun("a", { acc: 0.9 }),
    ];
    const originalOrder = runs.map((r) => r.id);
    compareRuns(runs, "acc", "maximize");
    expect(runs.map((r) => r.id)).toEqual(originalOrder);
  });

  it("does not mutate ExperimentRun objects", () => {
    const run = makeRun("a", { acc: 0.9 });
    const originalMetrics = { ...run.metrics };
    compareRuns([run], "acc", "maximize");
    expect(run.metrics).toEqual(originalMetrics);
  });
});

// ---------------------------------------------------------------------------
// Compatibility — assessCompatibility
// ---------------------------------------------------------------------------

describe("assessCompatibility", () => {
  it("returns compatible when all runs have matching datasets and splits", () => {
    const runs = [
      makeRun("a", {}, {
        datasetIdentifiers: [makeDatasetRef("cifar10")],
        evalSplits: [makeEvalSplit("test")],
      }),
      makeRun("b", {}, {
        datasetIdentifiers: [makeDatasetRef("cifar10")],
        evalSplits: [makeEvalSplit("test")],
      }),
    ];
    const result = assessCompatibility(runs);
    expect(result.status).toBe("compatible");
    expect(result.runsWithMissingMetadata).toHaveLength(0);
  });

  it("returns mismatch when datasets differ", () => {
    const runs = [
      makeRun("a", {}, { datasetIdentifiers: [makeDatasetRef("cifar10")], evalSplits: [makeEvalSplit("test")] }),
      makeRun("b", {}, { datasetIdentifiers: [makeDatasetRef("imagenet")], evalSplits: [makeEvalSplit("test")] }),
    ];
    const result = assessCompatibility(runs);
    expect(result.status).toBe("mismatch");
    expect(result.datasetNames).toContain("cifar10");
    expect(result.datasetNames).toContain("imagenet");
  });

  it("returns mismatch when eval splits differ", () => {
    const runs = [
      makeRun("a", {}, { datasetIdentifiers: [makeDatasetRef("mnist")], evalSplits: [makeEvalSplit("val")] }),
      makeRun("b", {}, { datasetIdentifiers: [makeDatasetRef("mnist")], evalSplits: [makeEvalSplit("test")] }),
    ];
    const result = assessCompatibility(runs);
    expect(result.status).toBe("mismatch");
    expect(result.splitNames).toContain("val");
    expect(result.splitNames).toContain("test");
  });

  it("returns unverified when at least one run has no metadata", () => {
    const runs = [
      makeRun("a", {}, { datasetIdentifiers: [makeDatasetRef("cifar10")], evalSplits: [makeEvalSplit("test")] }),
      makeRun("b", {}), // no datasets or splits
    ];
    const result = assessCompatibility(runs);
    expect(result.status).toBe("unverified");
    expect(result.runsWithMissingMetadata).toContain("b");
  });

  it("returns unverified when ALL runs have no metadata (not mismatch or compatible)", () => {
    const runs = [makeRun("a", {}), makeRun("b", {})];
    const result = assessCompatibility(runs);
    // Both missing → unverified (cannot confirm or deny).
    expect(result.status).toBe("unverified");
    expect(result.runsWithMissingMetadata).toHaveLength(2);
  });

  it("returns compatible for empty run array", () => {
    const result = assessCompatibility([]);
    expect(result.status).toBe("compatible");
  });

  it("never claims scientific superiority in mismatch message", () => {
    const runs = [
      makeRun("a", {}, { datasetIdentifiers: [makeDatasetRef("d1")], evalSplits: [makeEvalSplit("test")] }),
      makeRun("b", {}, { datasetIdentifiers: [makeDatasetRef("d2")], evalSplits: [makeEvalSplit("test")] }),
    ];
    const result = assessCompatibility(runs);
    // Message must include a caveat, not a claim of incomparability.
    expect(result.reason).toMatch(/may not be meaningful|does not confirm/i);
  });

  it("includes mismatch message in compareRuns result", () => {
    const runs = [
      makeRun("a", { acc: 0.9 }, { datasetIdentifiers: [makeDatasetRef("cifar10")], evalSplits: [makeEvalSplit("test")] }),
      makeRun("b", { acc: 0.8 }, { datasetIdentifiers: [makeDatasetRef("imagenet")], evalSplits: [makeEvalSplit("test")] }),
    ];
    const result = compareRuns(runs, "acc", "maximize");
    expect(result.compatibility.status).toBe("mismatch");
  });

  it("missing metadata is reported as unverified, not assumed to match", () => {
    // One run has a dataset, the other has none.
    const runs = [
      makeRun("a", { acc: 0.9 }, { datasetIdentifiers: [makeDatasetRef("cifar10")], evalSplits: [makeEvalSplit("test")] }),
      makeRun("b", { acc: 0.8 }), // no metadata
    ];
    const result = compareRuns(runs, "acc", "maximize");
    // Should be unverified (not mismatch, not compatible).
    expect(result.compatibility.status).toBe("unverified");
  });
});
