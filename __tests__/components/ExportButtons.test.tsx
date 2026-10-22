/**
 * __tests__/components/ExportButtons.test.tsx
 *
 * Tests for components/export/ExportButtons.tsx.
 *
 * Covers:
 * - Disabled state when no runs exist
 * - Disabled state when no metric is selected
 * - Enabled state when runs + metric are present
 * - Correct exporter functions are invoked
 * - Export payload uses the selected metric and direction
 * - Filename includes the current date
 * - Blob / URL download mechanics
 * - Audit reports for all runs are included in the export
 * - Removing a run is reflected in subsequent exports
 * - No crash on empty state interaction
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ExportButtons } from "@/components/export/ExportButtons";
import { makeRun, makeDatasetRef, makeEvalSplit } from "@/__tests__/helpers/factories";
import type { ExperimentRun } from "@/lib/schema";

// ---------------------------------------------------------------------------
// Mock toMarkdown and toJSON so we can inspect what payload was passed.
// ---------------------------------------------------------------------------

vi.mock("@/lib/exporter/markdown", () => ({
  toMarkdown: vi.fn(() => "# Mock Markdown"),
}));

vi.mock("@/lib/exporter/json", () => ({
  toJSON: vi.fn(() => '{"mock":"json"}'),
}));

import { toMarkdown } from "@/lib/exporter/markdown";
import { toJSON } from "@/lib/exporter/json";
const mockToMarkdown = toMarkdown as ReturnType<typeof vi.fn>;
const mockToJSON = toJSON as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Mock URL / Blob / <a> download mechanics
// ---------------------------------------------------------------------------

const mockCreateObjectURL = vi.fn(() => "blob:mock-url");
const mockRevokeObjectURL = vi.fn();

// We need to track created anchor clicks.
const clickedAnchors: { href: string; download: string }[] = [];
const origCreateElement = document.createElement.bind(document);

beforeEach(() => {
  vi.clearAllMocks();
  clickedAnchors.length = 0;

  // Mock URL methods.
  Object.defineProperty(globalThis, "URL", {
    value: {
      createObjectURL: mockCreateObjectURL,
      revokeObjectURL: mockRevokeObjectURL,
    },
    configurable: true,
  });

  // Intercept document.createElement("a") to capture download calls.
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    if (tag === "a") {
      const anchor = origCreateElement("a");
      // Override click to record instead of navigating.
      anchor.addEventListener = (type: string, _handler: EventListenerOrEventListenerObject) => {};
      const origClick = anchor.click.bind(anchor);
      anchor.click = function () {
        clickedAnchors.push({ href: this.href, download: this.download });
        // Do NOT call origClick (that would trigger navigation in jsdom).
      };
      return anchor;
    }
    return origCreateElement(tag);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderExport(
  runs: ExperimentRun[] = [],
  selectedMetric: string | null = null,
  direction: "maximize" | "minimize" = "maximize"
) {
  return render(
    <ExportButtons
      runs={runs}
      selectedMetric={selectedMetric}
      direction={direction}
    />
  );
}

// ---------------------------------------------------------------------------
// Disabled states
// ---------------------------------------------------------------------------

describe("ExportButtons — disabled states", () => {
  it("disables both buttons when runs is empty", () => {
    renderExport([], null);
    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toBeDisabled();
    expect(buttons[1]).toBeDisabled();
  });

  it("disables both buttons when metric is null even with runs", () => {
    renderExport([makeRun("r1", { accuracy: 0.9 })], null);
    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toBeDisabled();
    expect(buttons[1]).toBeDisabled();
  });

  it("shows a helper message when no runs are loaded", () => {
    renderExport([], null);
    expect(screen.getByText(/Upload at least one experiment/i)).toBeInTheDocument();
  });

  it("shows a helper message when metric is null but runs exist", () => {
    renderExport([makeRun("r1", { accuracy: 0.9 })], null);
    expect(screen.getByText(/Select a metric/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Enabled states
// ---------------------------------------------------------------------------

describe("ExportButtons — enabled states", () => {
  it("enables both buttons when runs and metric are provided", () => {
    renderExport([makeRun("r1", { accuracy: 0.9 })], "accuracy");
    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).not.toBeDisabled();
    expect(buttons[1]).not.toBeDisabled();
  });

  it("hides the helper message when export is possible", () => {
    renderExport([makeRun("r1", { accuracy: 0.9 })], "accuracy");
    expect(screen.queryByText(/Upload at least one experiment/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Select a metric/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Markdown download
// ---------------------------------------------------------------------------

describe("ExportButtons — Markdown download", () => {
  it("calls toMarkdown when Markdown button is clicked", async () => {
    renderExport([makeRun("r1", { accuracy: 0.9 })], "accuracy");
    const mdButton = screen.getByRole("button", { name: /Export report as Markdown/i });
    await userEvent.click(mdButton);
    expect(mockToMarkdown).toHaveBeenCalledTimes(1);
  });

  it("does not call toMarkdown when disabled", async () => {
    renderExport([], null);
    // Buttons are disabled — clicking them should not invoke the exporter.
    const mdButton = screen.getByRole("button", { name: /Export report as Markdown/i });
    await userEvent.click(mdButton);
    expect(mockToMarkdown).not.toHaveBeenCalled();
  });

  it("passes the selected metric in the comparison payload to toMarkdown", async () => {
    renderExport([makeRun("r1", { accuracy: 0.9, loss: 0.1 })], "loss", "minimize");
    await userEvent.click(screen.getByRole("button", { name: /Export report as Markdown/i }));
    const payload = mockToMarkdown.mock.calls[0][0];
    expect(payload.comparison.metric).toBe("loss");
    expect(payload.comparison.direction).toBe("minimize");
  });

  it("includes audit reports for all runs in the Markdown payload", async () => {
    const runs = [makeRun("r1", { accuracy: 0.9 }), makeRun("r2", { accuracy: 0.8 })];
    renderExport(runs, "accuracy");
    await userEvent.click(screen.getByRole("button", { name: /Export report as Markdown/i }));
    const payload = mockToMarkdown.mock.calls[0][0];
    expect(payload.audits).toHaveLength(2);
    expect(payload.audits.map((a: { runId: string }) => a.runId)).toContain("r1");
    expect(payload.audits.map((a: { runId: string }) => a.runId)).toContain("r2");
  });

  it("triggers a download with a .md extension", async () => {
    renderExport([makeRun("r1", { accuracy: 0.9 })], "accuracy");
    await userEvent.click(screen.getByRole("button", { name: /Export report as Markdown/i }));
    // URL.createObjectURL should have been called.
    expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
    // The anchor click should include a .md filename.
    expect(clickedAnchors).toHaveLength(1);
    expect(clickedAnchors[0].download).toMatch(/\.md$/);
  });

  it("filename includes the current date in YYYY-MM-DD format", async () => {
    renderExport([makeRun("r1", { accuracy: 0.9 })], "accuracy");
    await userEvent.click(screen.getByRole("button", { name: /Export report as Markdown/i }));
    const filename = clickedAnchors[0]?.download ?? "";
    expect(filename).toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("filename starts with runtrace-report", async () => {
    renderExport([makeRun("r1", { accuracy: 0.9 })], "accuracy");
    await userEvent.click(screen.getByRole("button", { name: /Export report as Markdown/i }));
    expect(clickedAnchors[0].download).toMatch(/^runtrace-report/);
  });
});

// ---------------------------------------------------------------------------
// JSON download
// ---------------------------------------------------------------------------

describe("ExportButtons — JSON download", () => {
  it("calls toJSON when JSON button is clicked", async () => {
    renderExport([makeRun("r1", { accuracy: 0.9 })], "accuracy");
    await userEvent.click(screen.getByRole("button", { name: /Export report as JSON/i }));
    expect(mockToJSON).toHaveBeenCalledTimes(1);
  });

  it("does not call toJSON when disabled", async () => {
    renderExport([], null);
    await userEvent.click(screen.getByRole("button", { name: /Export report as JSON/i }));
    expect(mockToJSON).not.toHaveBeenCalled();
  });

  it("passes the selected metric and direction to toJSON", async () => {
    renderExport([makeRun("r1", { accuracy: 0.9 })], "accuracy", "minimize");
    await userEvent.click(screen.getByRole("button", { name: /Export report as JSON/i }));
    const payload = mockToJSON.mock.calls[0][0];
    expect(payload.comparison.metric).toBe("accuracy");
    expect(payload.comparison.direction).toBe("minimize");
  });

  it("includes audit reports for all runs in the JSON payload", async () => {
    const runs = [
      makeRun("a", { accuracy: 0.95 }, {
        gitRevision: "abc",
        randomSeeds: { seed: 42 },
        datasetIdentifiers: [makeDatasetRef("ds")],
        evalSplits: [makeEvalSplit("test")],
        dependencyVersions: { torch: "2.1.0" },
      }),
      makeRun("b", { accuracy: 0.88 }),
    ];
    renderExport(runs, "accuracy");
    await userEvent.click(screen.getByRole("button", { name: /Export report as JSON/i }));
    const payload = mockToJSON.mock.calls[0][0];
    expect(payload.audits).toHaveLength(2);
  });

  it("triggers a download with a .json extension", async () => {
    renderExport([makeRun("r1", { accuracy: 0.9 })], "accuracy");
    await userEvent.click(screen.getByRole("button", { name: /Export report as JSON/i }));
    expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
    expect(clickedAnchors[0].download).toMatch(/\.json$/);
  });

  it("filename starts with runtrace-report and includes date", async () => {
    renderExport([makeRun("r1", { accuracy: 0.9 })], "accuracy");
    await userEvent.click(screen.getByRole("button", { name: /Export report as JSON/i }));
    expect(clickedAnchors[0].download).toMatch(/^runtrace-report-\d{4}-\d{2}-\d{2}\.json$/);
  });
});

// ---------------------------------------------------------------------------
// Export reflects run removal
// ---------------------------------------------------------------------------

describe("ExportButtons — run removal reflected", () => {
  it("exports only the currently provided runs (run removal is handled by the parent)", async () => {
    // Render with two runs, then re-render with one — simulates removal.
    const { rerender } = render(
      <ExportButtons
        runs={[makeRun("r1", { accuracy: 0.9 }), makeRun("r2", { accuracy: 0.8 })]}
        selectedMetric="accuracy"
        direction="maximize"
      />
    );

    // Re-render with r2 removed.
    rerender(
      <ExportButtons
        runs={[makeRun("r1", { accuracy: 0.9 })]}
        selectedMetric="accuracy"
        direction="maximize"
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /Export report as JSON/i }));
    const payload = mockToJSON.mock.calls[0][0];
    // Only r1 should be in the comparison.
    expect(payload.comparison.runs).toHaveLength(1);
    expect(payload.comparison.runs[0].id).toBe("r1");
    expect(payload.audits).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

describe("ExportButtons — accessibility", () => {
  it("Markdown button has an accessible label", () => {
    renderExport([makeRun("r1", { accuracy: 0.9 })], "accuracy");
    expect(screen.getByRole("button", { name: /Export report as Markdown/i })).toBeInTheDocument();
  });

  it("JSON button has an accessible label", () => {
    renderExport([makeRun("r1", { accuracy: 0.9 })], "accuracy");
    expect(screen.getByRole("button", { name: /Export report as JSON/i })).toBeInTheDocument();
  });
});
