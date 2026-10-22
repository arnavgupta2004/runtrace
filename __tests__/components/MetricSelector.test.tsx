/**
 * __tests__/components/MetricSelector.test.tsx
 *
 * Tests for MetricSelector component and its helper functions.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  MetricSelector,
  deriveMetricNames,
  pickDefaultMetric,
  PREFERRED_METRICS,
} from "@/components/comparison/MetricSelector";
import { makeRun } from "@/__tests__/helpers/factories";
import type { OptimizationDirection } from "@/lib/schema";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function renderSelector(overrides: {
  runs?: ReturnType<typeof makeRun>[];
  selectedMetric?: string | null;
  direction?: OptimizationDirection;
  onMetricChange?: ReturnType<typeof vi.fn<(m: string) => void>>;
  onDirectionChange?: ReturnType<typeof vi.fn<(d: OptimizationDirection) => void>>;
}) {
  const onMetricChange = overrides.onMetricChange ?? vi.fn<(m: string) => void>();
  const onDirectionChange =
    overrides.onDirectionChange ?? vi.fn<(d: OptimizationDirection) => void>();
  render(
    <MetricSelector
      runs={overrides.runs ?? []}
      selectedMetric={overrides.selectedMetric ?? null}
      direction={overrides.direction ?? "maximize"}
      onMetricChange={onMetricChange}
      onDirectionChange={onDirectionChange}
    />
  );
  return { onMetricChange, onDirectionChange };
}

// ---------------------------------------------------------------------------
// deriveMetricNames helper
// ---------------------------------------------------------------------------

describe("deriveMetricNames", () => {
  it("returns empty array for empty runs", () => {
    expect(deriveMetricNames([])).toEqual([]);
  });

  it("returns sorted unique metric names from a single run", () => {
    const run = makeRun("r1", { loss: 0.1, accuracy: 0.9 });
    expect(deriveMetricNames([run])).toEqual(["accuracy", "loss"]);
  });

  it("unions metrics across multiple runs", () => {
    const r1 = makeRun("r1", { accuracy: 0.9 });
    const r2 = makeRun("r2", { loss: 0.1, f1: 0.8 });
    expect(deriveMetricNames([r1, r2])).toEqual(["accuracy", "f1", "loss"]);
  });

  it("deduplicates metrics shared across runs", () => {
    const r1 = makeRun("r1", { accuracy: 0.9 });
    const r2 = makeRun("r2", { accuracy: 0.85 });
    expect(deriveMetricNames([r1, r2])).toEqual(["accuracy"]);
  });

  it("returns metrics sorted alphabetically", () => {
    const run = makeRun("r1", { z_score: 1, a_metric: 2, m_score: 3 });
    expect(deriveMetricNames([run])).toEqual(["a_metric", "m_score", "z_score"]);
  });
});

// ---------------------------------------------------------------------------
// pickDefaultMetric helper
// ---------------------------------------------------------------------------

describe("pickDefaultMetric", () => {
  it("returns null for empty list", () => {
    expect(pickDefaultMetric([])).toBeNull();
  });

  it("prefers 'accuracy' over alphabetic fallback", () => {
    expect(pickDefaultMetric(["accuracy", "z_metric"])).toBe("accuracy");
  });

  it("prefers 'loss' if no higher-priority preferred metric is present", () => {
    expect(pickDefaultMetric(["loss", "z_metric"])).toBe("loss");
  });

  it("prefers preferred metrics in PREFERRED_METRICS order", () => {
    // Only f1 and loss present — loss comes before f1 in PREFERRED_METRICS
    const idx_loss = PREFERRED_METRICS.indexOf("loss");
    const idx_f1 = PREFERRED_METRICS.indexOf("f1");
    const names = ["f1", "loss"];
    const expected = idx_loss < idx_f1 ? "loss" : "f1";
    expect(pickDefaultMetric(names)).toBe(expected);
  });

  it("falls back to first alphabetically when no preferred metric is present", () => {
    // Pass a pre-sorted array (as deriveMetricNames produces)
    expect(pickDefaultMetric(["a_metric", "z_metric"])).toBe("a_metric");
  });
});

// ---------------------------------------------------------------------------
// MetricSelector rendering
// ---------------------------------------------------------------------------

describe("MetricSelector rendering", () => {
  it("shows an empty-state message when no metrics are available", () => {
    renderSelector({ runs: [] });
    expect(screen.getByText(/No metrics available/i)).toBeInTheDocument();
  });

  it("does not show a <select> when no metrics are available", () => {
    renderSelector({ runs: [] });
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("renders a <select> with the correct options when metrics are available", () => {
    const runs = [makeRun("r1", { accuracy: 0.9, loss: 0.1 })];
    renderSelector({ runs, selectedMetric: "accuracy" });
    const select = screen.getByRole("combobox");
    expect(select).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "accuracy" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "loss" })).toBeInTheDocument();
  });

  it("shows the selected metric as the active option", () => {
    const runs = [makeRun("r1", { accuracy: 0.9, loss: 0.1 })];
    renderSelector({ runs, selectedMetric: "loss" });
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("loss");
  });

  it("renders maximize and minimize radio buttons", () => {
    renderSelector({ runs: [] });
    expect(screen.getByRole("radio", { name: /Maximize/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Minimize/i })).toBeInTheDocument();
  });

  it("maximize radio is checked when direction is maximize", () => {
    renderSelector({ runs: [], direction: "maximize" });
    const radio = screen.getByRole("radio", { name: /Maximize/i }) as HTMLInputElement;
    expect(radio.checked).toBe(true);
  });

  it("minimize radio is checked when direction is minimize", () => {
    renderSelector({ runs: [], direction: "minimize" });
    const radio = screen.getByRole("radio", { name: /Minimize/i }) as HTMLInputElement;
    expect(radio.checked).toBe(true);
  });

  it("displays the direction disclaimer text", () => {
    renderSelector({ runs: [] });
    expect(screen.getByText(/Sets ranking order/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// MetricSelector interactions
// ---------------------------------------------------------------------------

describe("MetricSelector interactions", () => {
  it("calls onMetricChange when a different metric is selected", async () => {
    const runs = [makeRun("r1", { accuracy: 0.9, loss: 0.1 })];
    const { onMetricChange } = renderSelector({ runs, selectedMetric: "accuracy" });
    const select = screen.getByRole("combobox");
    await userEvent.selectOptions(select, "loss");
    expect(onMetricChange).toHaveBeenCalledWith("loss");
  });

  it("calls onDirectionChange with 'minimize' when minimize radio is clicked", async () => {
    const { onDirectionChange } = renderSelector({ runs: [], direction: "maximize" });
    const minimize = screen.getByRole("radio", { name: /Minimize/i });
    await userEvent.click(minimize);
    expect(onDirectionChange).toHaveBeenCalledWith("minimize");
  });

  it("calls onDirectionChange with 'maximize' when maximize radio is clicked", async () => {
    const { onDirectionChange } = renderSelector({ runs: [], direction: "minimize" });
    const maximize = screen.getByRole("radio", { name: /Maximize/i });
    await userEvent.click(maximize);
    expect(onDirectionChange).toHaveBeenCalledWith("maximize");
  });
});

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

describe("MetricSelector accessibility", () => {
  it("metric select has an accessible label", () => {
    const runs = [makeRun("r1", { accuracy: 0.9 })];
    renderSelector({ runs, selectedMetric: "accuracy" });
    expect(screen.getByLabelText(/Select metric to compare/i)).toBeInTheDocument();
  });

  it("direction radios are grouped in a fieldset with a legend", () => {
    renderSelector({ runs: [] });
    // The fieldset's legend text
    expect(screen.getByText(/Optimization direction/i)).toBeInTheDocument();
  });
});
