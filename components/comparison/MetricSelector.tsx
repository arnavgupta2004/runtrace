"use client";

/**
 * components/comparison/MetricSelector.tsx
 *
 * Controls for choosing which metric to compare and the optimization direction.
 *
 * - Derives the available metric names from the real runs passed in.
 * - Uses a deterministic initial selection: prefer a common metric name
 *   ("accuracy", "loss", "f1") if present, otherwise the first
 *   alphabetically. The caller controls `selectedMetric`; this component
 *   only fires `onMetricChange` / `onDirectionChange`.
 * - Renders an informative empty state when no metrics are available.
 * - Direction control explains it determines ranking, not scientific validity.
 */

import React from "react";
import type { ExperimentRun, OptimizationDirection } from "@/lib/schema";

// ---------------------------------------------------------------------------
// Helper — derive sorted unique metric names from runs
// ---------------------------------------------------------------------------

export function deriveMetricNames(runs: ExperimentRun[]): string[] {
  const names = new Set<string>();
  for (const run of runs) {
    for (const key of Object.keys(run.metrics)) {
      names.add(key);
    }
  }
  return Array.from(names).sort();
}

/**
 * Choose a sensible default metric name from a sorted list.
 * Prefers common names in order; falls back to the first alphabetically.
 */
export const PREFERRED_METRICS = ["accuracy", "loss", "f1", "auc", "mse", "mae"];

export function pickDefaultMetric(names: string[]): string | null {
  if (names.length === 0) return null;
  for (const preferred of PREFERRED_METRICS) {
    if (names.includes(preferred)) return preferred;
  }
  return names[0];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface MetricSelectorProps {
  runs: ExperimentRun[];
  selectedMetric: string | null;
  direction: OptimizationDirection;
  onMetricChange: (metric: string) => void;
  onDirectionChange: (direction: OptimizationDirection) => void;
}

export function MetricSelector({
  runs,
  selectedMetric,
  direction,
  onMetricChange,
  onDirectionChange,
}: MetricSelectorProps) {
  const metricNames = deriveMetricNames(runs);
  const hasMetrics = metricNames.length > 0;

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6">
      {/* Metric picker */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="metric-select"
          className="text-xs font-semibold uppercase tracking-wide text-zinc-500"
        >
          Compare metric
        </label>
        {hasMetrics ? (
          <select
            id="metric-select"
            value={selectedMetric ?? ""}
            onChange={(e) => onMetricChange(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            aria-label="Select metric to compare"
          >
            {metricNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-sm text-zinc-400 italic">
            No metrics available — upload runs that contain metric files.
          </p>
        )}
      </div>

      {/* Direction control */}
      <fieldset className="flex flex-col gap-1">
        <legend className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Optimization direction
        </legend>
        <div className="flex gap-4">
          <label className="flex items-center gap-1.5 cursor-pointer text-sm text-zinc-700">
            <input
              type="radio"
              name="opt-direction"
              value="maximize"
              checked={direction === "maximize"}
              onChange={() => onDirectionChange("maximize")}
              className="accent-blue-600"
            />
            Maximize
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer text-sm text-zinc-700">
            <input
              type="radio"
              name="opt-direction"
              value="minimize"
              checked={direction === "minimize"}
              onChange={() => onDirectionChange("minimize")}
              className="accent-blue-600"
            />
            Minimize
          </label>
        </div>
        <p className="text-xs text-zinc-400">
          Sets ranking order. Does not establish scientific validity.
        </p>
      </fieldset>
    </div>
  );
}
