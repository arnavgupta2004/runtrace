/**
 * __tests__/components/ComparisonTable.test.tsx
 *
 * Tests for ComparisonTable component.
 *
 * Uses the real compareRuns function (no mocking of comparator logic)
 * to ensure the UI faithfully represents actual comparison results.
 */

import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ComparisonTable } from "@/components/comparison/ComparisonTable";
import { compareRuns } from "@/lib/comparator";
import { makeRun, makeDatasetRef, makeEvalSplit } from "@/__tests__/helpers/factories";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resultFor(
  runs: ReturnType<typeof makeRun>[],
  metric = "accuracy",
  direction: "maximize" | "minimize" = "maximize"
) {
  return compareRuns(runs, metric, direction);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ComparisonTable — empty state", () => {
  it("shows 'No runs to compare' when ranking is empty", () => {
    const result = resultFor([]);
    render(<ComparisonTable result={result} />);
    expect(screen.getByText(/No runs to compare/i)).toBeInTheDocument();
  });
});

describe("ComparisonTable — single run", () => {
  it("renders one row for a single run", () => {
    const result = resultFor([makeRun("run-a", { accuracy: 0.9 })]);
    render(<ComparisonTable result={result} />);
    expect(screen.getByText("run-a")).toBeInTheDocument();
  });

  it("shows the metric value", () => {
    const result = resultFor([makeRun("run-a", { accuracy: 0.9 })]);
    render(<ComparisonTable result={result} />);
    // 0.9 formatted — check it appears
    expect(screen.getByText("0.9")).toBeInTheDocument();
  });

  it("shows rank #1 for the only run", () => {
    const result = resultFor([makeRun("run-a", { accuracy: 0.9 })]);
    render(<ComparisonTable result={result} />);
    expect(screen.getByText("#1")).toBeInTheDocument();
  });

  it("shows em dash for delta on the rank-1 run (delta = 0)", () => {
    const result = resultFor([makeRun("run-a", { accuracy: 0.9 })]);
    render(<ComparisonTable result={result} />);
    // delta=0 renders as "—"
    const deltas = screen.getAllByText("—");
    expect(deltas.length).toBeGreaterThan(0);
  });
});

describe("ComparisonTable — multiple runs", () => {
  it("displays all run names", () => {
    const runs = [
      makeRun("baseline", { accuracy: 0.8 }),
      makeRun("improved", { accuracy: 0.9 }),
    ];
    const result = resultFor(runs);
    render(<ComparisonTable result={result} />);
    expect(screen.getByText("improved")).toBeInTheDocument();
    expect(screen.getByText("baseline")).toBeInTheDocument();
  });

  it("ranks the higher accuracy run first when maximizing", () => {
    const runs = [
      makeRun("low", { accuracy: 0.7 }),
      makeRun("high", { accuracy: 0.9 }),
    ];
    const result = resultFor(runs, "accuracy", "maximize");
    render(<ComparisonTable result={result} />);
    const rows = screen.getAllByRole("row");
    // First data row (index 1 after header) should have "high"
    expect(within(rows[1]).getByText("high")).toBeInTheDocument();
    expect(within(rows[2]).getByText("low")).toBeInTheDocument();
  });

  it("ranks the lower loss run first when minimizing", () => {
    const runs = [
      makeRun("bad", { loss: 0.5 }),
      makeRun("good", { loss: 0.1 }),
    ];
    const result = resultFor(runs, "loss", "minimize");
    render(<ComparisonTable result={result} />);
    const rows = screen.getAllByRole("row");
    expect(within(rows[1]).getByText("good")).toBeInTheDocument();
    expect(within(rows[2]).getByText("bad")).toBeInTheDocument();
  });

  it("shows delta for rank-2 run (negative for maximize)", () => {
    const runs = [
      makeRun("best", { accuracy: 0.9 }),
      makeRun("second", { accuracy: 0.7 }),
    ];
    const result = resultFor(runs, "accuracy", "maximize");
    render(<ComparisonTable result={result} />);
    // delta = 0.7 - 0.9 = -0.2 → displays as "-0.2"
    expect(screen.getByText(/-0\.2/)).toBeInTheDocument();
  });
});

describe("ComparisonTable — missing metric values", () => {
  it("shows N/A (not zero) for runs missing the selected metric", () => {
    const runs = [
      makeRun("with-metric", { accuracy: 0.9 }),
      makeRun("no-metric", {}),  // no accuracy key
    ];
    const result = resultFor(runs, "accuracy", "maximize");
    render(<ComparisonTable result={result} />);
    expect(screen.getByText("N/A")).toBeInTheDocument();
    // Make sure it doesn't show "0"
    const cells = screen.getAllByRole("cell");
    const zeroCell = cells.find((c) => c.textContent?.trim() === "0");
    expect(zeroCell).toBeUndefined();
  });

  it("shows dash for delta when metric value is missing", () => {
    const runs = [
      makeRun("has-it", { accuracy: 0.9 }),
      makeRun("missing", {}),
    ];
    const result = resultFor(runs, "accuracy", "maximize");
    render(<ComparisonTable result={result} />);
    // delta=null → "—" in the delta cell for the missing row
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("handles all runs missing the metric gracefully", () => {
    const runs = [makeRun("r1", {}), makeRun("r2", {})];
    const result = resultFor(runs, "nonexistent", "maximize");
    render(<ComparisonTable result={result} />);
    const naItems = screen.getAllByText("N/A");
    expect(naItems).toHaveLength(2);
  });
});

describe("ComparisonTable — ties", () => {
  it("shows tied rank indicator (=N) for tied runs", () => {
    const runs = [
      makeRun("a", { accuracy: 0.9 }),
      makeRun("b", { accuracy: 0.9 }),
    ];
    const result = resultFor(runs, "accuracy", "maximize");
    render(<ComparisonTable result={result} />);
    // Both tied at rank 1 → shows "=1" badges
    const tieBadges = screen.getAllByText("=1");
    expect(tieBadges).toHaveLength(2);
  });
});

describe("ComparisonTable — negative values", () => {
  it("handles negative metric values correctly", () => {
    const runs = [
      makeRun("neg-best", { score: -0.1 }),
      makeRun("neg-worse", { score: -0.9 }),
    ];
    const result = resultFor(runs, "score", "maximize");
    render(<ComparisonTable result={result} />);
    expect(screen.getByText("-0.1")).toBeInTheDocument();
    expect(screen.getByText("-0.9")).toBeInTheDocument();
  });
});

describe("ComparisonTable — metric name in header", () => {
  it("displays the metric name in the table header", () => {
    const result = resultFor([makeRun("r1", { my_custom_metric: 1.0 })], "my_custom_metric");
    render(<ComparisonTable result={result} />);
    expect(screen.getByText("my_custom_metric")).toBeInTheDocument();
  });
});

describe("ComparisonTable — run name safety", () => {
  it("renders long run names without layout crash", () => {
    const longName = "a".repeat(200);
    const result = resultFor([makeRun(longName, { accuracy: 0.9 })]);
    render(<ComparisonTable result={result} />);
    expect(screen.getByText(longName)).toBeInTheDocument();
  });

  it("renders run names with special characters safely", () => {
    const name = "run <v2> & test";
    const result = resultFor([makeRun(name, { accuracy: 0.5 })]);
    render(<ComparisonTable result={result} />);
    expect(screen.getByText(name)).toBeInTheDocument();
  });
});

describe("ComparisonTable — accessibility", () => {
  it("renders a semantic <table> element", () => {
    const result = resultFor([makeRun("r1", { accuracy: 0.9 })]);
    render(<ComparisonTable result={result} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("table has column headers", () => {
    const result = resultFor([makeRun("r1", { accuracy: 0.9 })]);
    render(<ComparisonTable result={result} />);
    expect(screen.getAllByRole("columnheader").length).toBeGreaterThan(0);
  });
});

describe("ComparisonTable — compatibility banners", () => {
  it("shows no banner when compatibility is 'compatible'", () => {
    const runs = [
      makeRun("r1", { accuracy: 0.9 }, { datasetIdentifiers: [makeDatasetRef("mnist")], evalSplits: [makeEvalSplit("test")] }),
      makeRun("r2", { accuracy: 0.8 }, { datasetIdentifiers: [makeDatasetRef("mnist")], evalSplits: [makeEvalSplit("test")] }),
    ];
    const result = resultFor(runs);
    render(<ComparisonTable result={result} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a warning banner when compatibility is 'mismatch'", () => {
    const runs = [
      makeRun("r1", { accuracy: 0.9 }, { datasetIdentifiers: [makeDatasetRef("imagenet")], evalSplits: [makeEvalSplit("val")] }),
      makeRun("r2", { accuracy: 0.8 }, { datasetIdentifiers: [makeDatasetRef("cifar10")], evalSplits: [makeEvalSplit("test")] }),
    ];
    const result = resultFor(runs);
    render(<ComparisonTable result={result} />);
    const banner = screen.getByRole("alert");
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(/mismatch/i);
    expect(banner).toHaveTextContent(/may not represent a fair scientific comparison/i);
  });

  it("shows an info banner when compatibility is 'unverified'", () => {
    // One run has metadata, another doesn't → unverified
    const runs = [
      makeRun("r1", { accuracy: 0.9 }, { datasetIdentifiers: [makeDatasetRef("mnist")], evalSplits: [] }),
      makeRun("r2", { accuracy: 0.8 }),  // no dataset or splits
    ];
    const result = resultFor(runs);
    render(<ComparisonTable result={result} />);
    const banner = screen.getByRole("alert");
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(/missing/i);
    expect(banner).toHaveTextContent(/cannot be verified/i);
  });
});
