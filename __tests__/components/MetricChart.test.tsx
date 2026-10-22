/**
 * __tests__/components/MetricChart.test.tsx
 *
 * Tests for MetricChart component.
 *
 * Recharts renders SVG which jsdom handles poorly. Strategy:
 * - Test the accessible text summary (sr-only <table>) which is always rendered.
 * - Test empty states and omitted-run notices.
 * - Mock ResponsiveContainer to render its children at a fixed size so
 *   Recharts doesn't crash on missing layout measurements.
 * - Use real ComparisonResult from compareRuns, not fabricated data.
 */

import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeAll } from "vitest";
import { MetricChart } from "@/components/comparison/MetricChart";
import { compareRuns } from "@/lib/comparator";
import { makeRun } from "@/__tests__/helpers/factories";

// ---------------------------------------------------------------------------
// Mock ResponsiveContainer so Recharts can render without layout measurements.
// ---------------------------------------------------------------------------
vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 400, height: 220 }}>{children}</div>
    ),
  };
});

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

/** Query the accessible sr-only summary table. */
function getSummaryTable() {
  return screen.getByRole("table", { name: /values by run/i });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MetricChart — empty state (all runs missing metric)", () => {
  it("shows empty state message when no runs have the metric", () => {
    const result = resultFor([makeRun("r1", {}), makeRun("r2", {})], "accuracy");
    render(<MetricChart result={result} />);
    // The message is split across elements; check the container text
    const body = document.body;
    expect(body.textContent).toMatch(/No runs have a value for/i);
    // The metric name appears in the empty state
    expect(body.textContent).toContain("accuracy");
  });

  it("still renders the accessible summary table in empty state", () => {
    const result = resultFor([makeRun("r1", {})], "accuracy");
    render(<MetricChart result={result} />);
    const table = getSummaryTable();
    expect(table).toBeInTheDocument();
    // Run appears with N/A in summary
    expect(within(table).getByText("r1")).toBeInTheDocument();
    expect(within(table).getByText("N/A")).toBeInTheDocument();
  });
});

describe("MetricChart — single run with value", () => {
  it("renders without crashing for a single run", () => {
    const result = resultFor([makeRun("only-run", { accuracy: 0.95 })]);
    render(<MetricChart result={result} />);
    // Accessible summary present
    const table = getSummaryTable();
    expect(within(table).getByText("only-run")).toBeInTheDocument();
    expect(within(table).getByText("0.95")).toBeInTheDocument();
  });

  it("shows direction label", () => {
    const result = resultFor([makeRun("r1", { accuracy: 0.9 })], "accuracy", "maximize");
    render(<MetricChart result={result} />);
    expect(screen.getByText(/higher is better/i)).toBeInTheDocument();
  });
});

describe("MetricChart — multiple runs", () => {
  it("shows direction label for minimize", () => {
    const runs = [makeRun("r1", { loss: 0.1 }), makeRun("r2", { loss: 0.2 })];
    const result = resultFor(runs, "loss", "minimize");
    render(<MetricChart result={result} />);
    expect(screen.getByText(/lower is better/i)).toBeInTheDocument();
  });

  it("accessible summary contains all runs with values", () => {
    const runs = [
      makeRun("alpha", { accuracy: 0.9 }),
      makeRun("beta", { accuracy: 0.7 }),
    ];
    const result = resultFor(runs, "accuracy", "maximize");
    render(<MetricChart result={result} />);
    const table = getSummaryTable();
    expect(within(table).getByText("alpha")).toBeInTheDocument();
    expect(within(table).getByText("beta")).toBeInTheDocument();
    expect(within(table).getByText("0.9")).toBeInTheDocument();
    expect(within(table).getByText("0.7")).toBeInTheDocument();
  });

  it("accessible summary shows N/A for runs missing the metric", () => {
    const runs = [
      makeRun("has-it", { accuracy: 0.9 }),
      makeRun("missing", {}),
    ];
    const result = resultFor(runs, "accuracy", "maximize");
    render(<MetricChart result={result} />);
    const table = getSummaryTable();
    expect(within(table).getByText("N/A")).toBeInTheDocument();
    expect(within(table).getByText("has-it")).toBeInTheDocument();
    expect(within(table).getByText("missing")).toBeInTheDocument();
  });

  it("shows omitted-runs notice when some runs lack the metric", () => {
    const runs = [
      makeRun("has-it", { accuracy: 0.9 }),
      makeRun("missing", {}),
    ];
    const result = resultFor(runs, "accuracy", "maximize");
    render(<MetricChart result={result} />);
    expect(screen.getByText(/1 run omitted from chart/i)).toBeInTheDocument();
  });

  it("does not show omitted notice when all runs have the metric", () => {
    const runs = [
      makeRun("r1", { accuracy: 0.9 }),
      makeRun("r2", { accuracy: 0.8 }),
    ];
    const result = resultFor(runs, "accuracy", "maximize");
    render(<MetricChart result={result} />);
    expect(screen.queryByText(/omitted from chart/i)).not.toBeInTheDocument();
  });
});

describe("MetricChart — negative values", () => {
  it("renders accessible summary with negative metric values", () => {
    const runs = [
      makeRun("neg-high", { score: -0.1 }),
      makeRun("neg-low", { score: -0.9 }),
    ];
    const result = resultFor(runs, "score", "maximize");
    render(<MetricChart result={result} />);
    const table = getSummaryTable();
    expect(within(table).getByText("-0.1")).toBeInTheDocument();
    expect(within(table).getByText("-0.9")).toBeInTheDocument();
  });
});

describe("MetricChart — tied values", () => {
  it("shows both tied runs in the accessible summary", () => {
    const runs = [
      makeRun("tie-a", { accuracy: 0.9 }),
      makeRun("tie-b", { accuracy: 0.9 }),
    ];
    const result = resultFor(runs, "accuracy", "maximize");
    render(<MetricChart result={result} />);
    const table = getSummaryTable();
    expect(within(table).getByText("tie-a")).toBeInTheDocument();
    expect(within(table).getByText("tie-b")).toBeInTheDocument();
  });
});

describe("MetricChart — accessible summary structure", () => {
  it("accessible table has rank, run, and metric columns", () => {
    const result = resultFor([makeRun("r1", { accuracy: 0.9 })]);
    render(<MetricChart result={result} />);
    const table = getSummaryTable();
    const headers = within(table).getAllByRole("columnheader");
    const headerTexts = headers.map((h) => h.textContent?.trim());
    expect(headerTexts).toContain("Rank");
    expect(headerTexts).toContain("Run");
    expect(headerTexts).toContain("accuracy");
  });
});

describe("MetricChart — metric name display", () => {
  it("displays the metric name in the direction label paragraph", () => {
    const result = resultFor([makeRun("r1", { my_metric: 0.5 })], "my_metric");
    render(<MetricChart result={result} />);
    // The direction label contains the metric name
    const dirLabel = screen.getByLabelText(/Optimization direction/i);
    expect(dirLabel.textContent).toContain("my_metric");
  });
});
