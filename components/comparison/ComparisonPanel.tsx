"use client";

/**
 * components/comparison/ComparisonPanel.tsx
 *
 * Orchestrates MetricSelector, ComparisonTable, and MetricChart.
 *
 * - Accepts only successfully parsed ExperimentRun objects.
 * - Manages selected metric and direction locally, OR accepts controlled
 *   values via the optional onMetricChange / onDirectionChange props so
 *   a parent component (e.g. page.tsx) can share the selection with export
 *   controls without duplicating comparison logic.
 * - Safely recovers when the selected metric disappears (e.g. after a run
 *   is removed): picks a new valid metric or resets to null.
 * - Renders a helpful empty state before any runs are loaded.
 * - Shows a single-run view (chart + table work with one run).
 */

import React, { useState, useEffect, useMemo } from "react";
import type { ExperimentRun, OptimizationDirection } from "@/lib/schema";
import { compareRuns } from "@/lib/comparator";
import {
  MetricSelector,
  deriveMetricNames,
  pickDefaultMetric,
} from "./MetricSelector";
import { ComparisonTable } from "./ComparisonTable";
import { MetricChart } from "./MetricChart";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ComparisonPanelProps {
  runs: ExperimentRun[];
  /**
   * Optional controlled metric value. When provided, the parent owns
   * the selection. ComparisonPanel calls onMetricChange when it would
   * change the selection (e.g. on first render or when the selected metric
   * disappears after a run is removed).
   */
  selectedMetric?: string | null;
  /** Optional controlled direction. */
  direction?: OptimizationDirection;
  /** Called when the metric selection changes. */
  onMetricChange?: (metric: string | null) => void;
  /** Called when the direction changes. */
  onDirectionChange?: (direction: OptimizationDirection) => void;
}

// ---------------------------------------------------------------------------
// ComparisonPanel
// ---------------------------------------------------------------------------

export function ComparisonPanel({
  runs,
  selectedMetric: controlledMetric,
  direction: controlledDirection,
  onMetricChange,
  onDirectionChange,
}: ComparisonPanelProps) {
  const metricNames = useMemo(() => deriveMetricNames(runs), [runs]);

  // Internal state — used when the parent does NOT pass controlled values.
  const [internalMetric, setInternalMetric] = useState<string | null>(
    () => pickDefaultMetric(metricNames)
  );
  const [internalDirection, setInternalDirection] = useState<OptimizationDirection>("maximize");

  // Resolve to controlled or internal values.
  const isControlled = controlledMetric !== undefined;
  const selectedMetric = isControlled ? controlledMetric : internalMetric;
  const direction = controlledDirection ?? internalDirection;

  // Handlers: propagate up if controlled, otherwise update internal state.
  const handleMetricChange = (metric: string) => {
    if (onMetricChange) onMetricChange(metric);
    else setInternalMetric(metric);
  };
  const handleDirectionChange = (dir: OptimizationDirection) => {
    if (onDirectionChange) onDirectionChange(dir);
    else setInternalDirection(dir);
  };

  // When runs change, ensure selectedMetric is still valid.
  useEffect(() => {
    if (metricNames.length === 0) {
      if (onMetricChange) onMetricChange(null);
      else setInternalMetric(null);
      return;
    }
    if (selectedMetric === null || !metricNames.includes(selectedMetric)) {
      const next = pickDefaultMetric(metricNames);
      if (onMetricChange) onMetricChange(next);
      else setInternalMetric(next);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metricNames]);

  // Compute comparison result — memoised so it only re-runs when inputs change.
  const result = useMemo(() => {
    if (runs.length === 0 || selectedMetric === null) return null;
    return compareRuns(runs, selectedMetric, direction);
  }, [runs, selectedMetric, direction]);

  // -------------------------------------------------------------------------
  // Empty state — no runs uploaded yet
  // -------------------------------------------------------------------------
  if (runs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-200 bg-white px-6 py-14 text-center">
        <svg
          aria-hidden="true"
          className="mb-4 h-10 w-10 text-zinc-300"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
          />
        </svg>
        <p className="text-sm font-medium text-zinc-600">
          No experiments to compare yet
        </p>
        <p className="mt-1 text-xs text-zinc-400">
          Successfully parsed runs will appear here for comparison.
        </p>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render panel
  // -------------------------------------------------------------------------
  return (
    <div className="flex flex-col gap-6">
      {/* Metric + direction controls */}
      <MetricSelector
        runs={runs}
        selectedMetric={selectedMetric}
        direction={direction}
        onMetricChange={handleMetricChange}
        onDirectionChange={handleDirectionChange}
      />

      {result !== null ? (
        <>
          {/* Chart */}
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-zinc-700">
              Metric chart
            </h3>
            <MetricChart result={result} />
          </div>

          {/* Table */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-zinc-700">
              Ranking
            </h3>
            <ComparisonTable result={result} />
          </div>
        </>
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-white px-4 py-8 text-center text-sm text-zinc-400">
          No metric selected — upload runs that contain metric files.
        </div>
      )}
    </div>
  );
}
