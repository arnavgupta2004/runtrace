/**
 * lib/exporter/json.ts
 *
 * Pure JSON serialiser for Runtrace.
 *
 * Public API
 * ----------
 *   toJSON(payload: ExportPayload): string
 *
 * The function is pure: no DOM access, no side effects, no external calls.
 * Identical inputs always produce identical output.
 *
 * Formatting
 * ----------
 * Output is pretty-printed with 2-space indentation for human readability.
 *
 * Non-finite metric values
 * ------------------------
 * The ExperimentRun.metrics map contains only finite numbers (schema
 * guarantee set by the parser).  RankedRun.metricValue and delta are
 * number | null; null serialises correctly as JSON null.
 *
 * JSON.stringify has a well-known limitation: it silently converts NaN,
 * Infinity, and -Infinity to null.  If a non-finite value somehow reaches
 * the exporter (e.g. via a caller that bypasses the parser), it would be
 * serialised as null without explanation.  To surface this rather than hide
 * it, we walk the metrics maps of all runs and replace any non-finite value
 * with the sentinel string "__INVALID_METRIC__".  This prevents a silent
 * data loss and makes the problem visible in the exported file.
 *
 * Immutability
 * ------------
 * The payload is deep-cloned before serialisation; the original is never
 * mutated.  The clone is created with structuredClone (available in Node
 * ≥ 17 and all modern browsers).
 */

import type { ExportPayload, ExperimentRun } from "@/lib/schema";

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Serialise an ExportPayload to a pretty-printed JSON string.
 * The payload is not mutated.
 */
export function toJSON(payload: ExportPayload): string {
  // Deep-clone so we can safely sanitise non-finite values without mutating.
  const clone = structuredClone(payload) as ExportPayload;

  // Sanitise metrics on all runs inside comparison.runs.
  for (const run of clone.comparison.runs) {
    sanitiseMetrics(run);
  }
  // Also sanitise runs referenced inside ranking entries.
  for (const ranked of clone.comparison.ranking) {
    sanitiseMetrics(ranked.run);
    // metricValue and delta are number | null — both serialise correctly
    // as JSON numbers or null. Non-finite numbers (should not exist) are
    // guarded here.
    if (ranked.metricValue !== null && !Number.isFinite(ranked.metricValue)) {
      (ranked as { metricValue: unknown }).metricValue = "__INVALID_METRIC__";
    }
    if (ranked.delta !== null && !Number.isFinite(ranked.delta ?? 0)) {
      (ranked as { delta: unknown }).delta = "__INVALID_DELTA__";
    }
  }

  return JSON.stringify(clone, null, 2);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Replace any non-finite value in run.metrics with the sentinel string
 * "__INVALID_METRIC__" so it is visible in the exported JSON rather than
 * being silently converted to null by JSON.stringify.
 */
function sanitiseMetrics(run: ExperimentRun): void {
  for (const key of Object.keys(run.metrics)) {
    const v = run.metrics[key];
    if (!Number.isFinite(v)) {
      (run.metrics as Record<string, unknown>)[key] = "__INVALID_METRIC__";
    }
  }
}
