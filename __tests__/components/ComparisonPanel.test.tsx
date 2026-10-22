/**
 * __tests__/components/ComparisonPanel.test.tsx
 *
 * Integration tests for ComparisonPanel.
 *
 * Verifies the full orchestration: metric derivation, direction control,
 * comparator integration, and correct responses to run additions/removals.
 *
 * ResponsiveContainer is mocked so Recharts doesn't crash in jsdom.
 * The comparator is NOT mocked — real compareRuns is used throughout.
 */

import React, { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ComparisonPanel } from "@/components/comparison/ComparisonPanel";
import { makeRun, makeDatasetRef, makeEvalSplit } from "@/__tests__/helpers/factories";
import type { ExperimentRun } from "@/lib/schema";

// ---------------------------------------------------------------------------
// Mock ResponsiveContainer to prevent Recharts layout crash in jsdom.
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
// Controlled wrapper for testing dynamic run addition/removal
// ---------------------------------------------------------------------------

function ControlledPanel({ initialRuns }: { initialRuns: ExperimentRun[] }) {
  const [runs, setRuns] = useState(initialRuns);
  return (
    <div>
      <button onClick={() => setRuns((r) => r.slice(0, -1))}>Remove last</button>
      <button onClick={() => setRuns((r) => [...r, makeRun(`run-${r.length}`, { accuracy: 0.5 })])}>
        Add run
      </button>
      <ComparisonPanel runs={runs} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe("ComparisonPanel — empty state", () => {
  it("shows helpful empty state when no runs are provided", () => {
    render(<ComparisonPanel runs={[]} />);
    expect(screen.getByText(/No experiments to compare yet/i)).toBeInTheDocument();
  });

  it("does not render metric selector in empty state", () => {
    render(<ComparisonPanel runs={[]} />);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Single run
// ---------------------------------------------------------------------------

describe("ComparisonPanel — single run", () => {
  it("renders the comparison table for a single run", () => {
    const runs = [makeRun("solo", { accuracy: 0.9 })];
    render(<ComparisonPanel runs={runs} />);
    // There are two tables: sr-only chart summary + main comparison table
    // Check that at least one table is present
    expect(screen.getAllByRole("table").length).toBeGreaterThanOrEqual(1);
    // Run name appears (may appear in both tables)
    expect(screen.getAllByText("solo").length).toBeGreaterThan(0);
  });

  it("renders the metric selector for a single run", () => {
    const runs = [makeRun("solo", { accuracy: 0.9 })];
    render(<ComparisonPanel runs={runs} />);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Metric derivation
// ---------------------------------------------------------------------------

describe("ComparisonPanel — metric derivation", () => {
  it("shows all metrics from successful runs in the selector", () => {
    const runs = [
      makeRun("r1", { accuracy: 0.9 }),
      makeRun("r2", { loss: 0.1 }),
    ];
    render(<ComparisonPanel runs={runs} />);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    const options = within(select)
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(options).toContain("accuracy");
    expect(options).toContain("loss");
  });

  it("shows no-metrics empty state when runs have no metrics", () => {
    const runs = [makeRun("r1", {}), makeRun("r2", {})];
    render(<ComparisonPanel runs={runs} />);
    expect(screen.getByText(/No metrics available/i)).toBeInTheDocument();
  });

  it("selects a default metric deterministically on first render", () => {
    const runs = [makeRun("r1", { z_metric: 1, accuracy: 0.9 })];
    render(<ComparisonPanel runs={runs} />);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    // Should prefer "accuracy" over "z_metric"
    expect(select.value).toBe("accuracy");
  });
});

// ---------------------------------------------------------------------------
// Metric selection interaction
// ---------------------------------------------------------------------------

describe("ComparisonPanel — metric selection", () => {
  it("updates the table when metric is changed", async () => {
    const runs = [makeRun("r1", { accuracy: 0.9, loss: 0.1 })];
    render(<ComparisonPanel runs={runs} />);
    const select = screen.getByRole("combobox");
    // Initially accuracy is selected (preferred)
    await userEvent.selectOptions(select, "loss");
    // "loss" appears in multiple places (option, header, chart) — check at least one
    expect(screen.getAllByText("loss").length).toBeGreaterThan(0);
    // The column header in the ranking table should contain "loss"
    const columnHeaders = screen.getAllByRole("columnheader");
    const lossHeader = columnHeaders.find((h) => h.textContent?.includes("loss"));
    expect(lossHeader).toBeDefined();
  });

  it("updates the chart direction label when minimize is selected", async () => {
    const runs = [makeRun("r1", { loss: 0.1 })];
    render(<ComparisonPanel runs={runs} />);
    const minimize = screen.getByRole("radio", { name: /Minimize/i });
    await userEvent.click(minimize);
    expect(screen.getByText(/lower is better/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Run addition and removal
// ---------------------------------------------------------------------------

describe("ComparisonPanel — run changes", () => {
  it("updates when a run is added", async () => {
    render(<ControlledPanel initialRuns={[makeRun("r1", { accuracy: 0.9 })]} />);
    // Initially one run — appears in table and sr-only summary
    expect(screen.getAllByText("r1").length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole("button", { name: /Add run/i }));
    // New run appears
    expect(screen.getAllByText("run-1").length).toBeGreaterThan(0);
  });

  it("updates table when a run is removed", async () => {
    const runs = [
      makeRun("keeper", { accuracy: 0.9 }),
      makeRun("removed", { accuracy: 0.7 }),
    ];
    render(<ControlledPanel initialRuns={runs} />);
    expect(screen.getAllByText("removed").length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole("button", { name: /Remove last/i }));
    expect(screen.queryByText("removed")).not.toBeInTheDocument();
    expect(screen.getAllByText("keeper").length).toBeGreaterThan(0);
  });

  it("falls back to empty state when all runs are removed", async () => {
    render(<ControlledPanel initialRuns={[makeRun("only", { accuracy: 0.9 })]} />);
    await userEvent.click(screen.getByRole("button", { name: /Remove last/i }));
    expect(screen.getByText(/No experiments to compare yet/i)).toBeInTheDocument();
  });

  it("recovers gracefully when selected metric disappears after run removal", async () => {
    // r1 has accuracy only, r2 has accuracy+loss
    // After r2 (last) is removed, loss disappears
    const runs = [
      makeRun("r1", { accuracy: 0.9 }),
      makeRun("r2", { accuracy: 0.8, loss: 0.1 }),
    ];
    render(<ControlledPanel initialRuns={runs} />);
    // Select loss
    const select = screen.getByRole("combobox");
    await userEvent.selectOptions(select, "loss");
    expect((select as HTMLSelectElement).value).toBe("loss");

    // Remove r2 (last) — loss disappears from the union of metrics
    await userEvent.click(screen.getByRole("button", { name: /Remove last/i }));
    // Panel should still render a valid state — no crash
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    // Selected metric should now be something valid (accuracy — the only remaining metric)
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("accuracy");
  });
});

// ---------------------------------------------------------------------------
// Only successful uploads feed the comparison
// ---------------------------------------------------------------------------

describe("ComparisonPanel — only successful runs", () => {
  it("uses only the runs passed in (caller is responsible for filtering)", () => {
    // Panel receives only successful runs — loading/error filtering is in page.tsx.
    const runs = [makeRun("ok-run", { accuracy: 0.9 })];
    render(<ComparisonPanel runs={runs} />);
    expect(screen.getAllByText("ok-run").length).toBeGreaterThan(0);
  });

  it("does not display anything from a run that was not passed in", () => {
    const runs = [makeRun("included", { accuracy: 0.9 })];
    render(<ComparisonPanel runs={runs} />);
    expect(screen.queryByText("not-included")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Compatibility warnings show up in the panel
// ---------------------------------------------------------------------------

describe("ComparisonPanel — compatibility warnings", () => {
  it("shows a compatibility warning when datasets differ", () => {
    const runs = [
      makeRun("r1", { accuracy: 0.9 }, { datasetIdentifiers: [makeDatasetRef("imagenet")], evalSplits: [makeEvalSplit("val")] }),
      makeRun("r2", { accuracy: 0.8 }, { datasetIdentifiers: [makeDatasetRef("cifar10")], evalSplits: [makeEvalSplit("test")] }),
    ];
    render(<ComparisonPanel runs={runs} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/mismatch/i);
  });
});
