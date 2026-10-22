/**
 * lib/comparator/index.ts
 *
 * Comparison engine for Runtrace.
 *
 * Public API
 * ----------
 *   compareRuns(runs, metric, direction): ComparisonResult
 *
 * Ranking rules
 * -------------
 * 1. Only finite numeric values from each run's `metrics` map are considered.
 *    The schema guarantees the metrics map contains only finite values (set by
 *    the parser), so any key present in run.metrics is valid.  A run that has
 *    no entry for the selected metric key receives metricValue: null and is
 *    ranked after all runs that do have a value.
 *
 * 2. Among runs WITH a valid value, ordering follows the direction:
 *      maximize → descending (highest first)
 *      minimize → ascending  (lowest first)
 *
 * 3. Tied values receive the SAME rank.  Ties are broken deterministically
 *    using run.name ascending, then run.id ascending.  This ensures the
 *    ranking is stable across calls with the same inputs.
 *    Note: tied runs share the same rank number.  The next rank after a group
 *    of N tied runs at rank R is R + N (standard competition ranking / 1224).
 *
 * 4. Runs without a valid value are placed after ranked runs.  Among
 *    themselves they are ordered by run.name ascending, then run.id ascending.
 *    They all receive rank = (last ranked run's rank) + 1.
 *
 * Delta
 * -----
 * delta is the signed difference: thisRun.value − bestRun.value.
 * The "best run" is the rank-1 run (the first entry in the ranking with a
 * valid value).
 *   - For the rank-1 run itself: delta = 0 (not null — it is explicitly zero
 *     relative to itself).
 *   - For runs ranked 2+: delta = thisRun.value − bestRun.value.
 *     This is negative for maximize (lower than best) and positive for
 *     minimize (higher than best).
 *   - For runs without a valid value: delta = null.
 *
 * Immutability
 * -----------
 * The input array and all ExperimentRun objects are never mutated.
 *
 * Compatibility
 * -------------
 * The comparator inspects dataset identifiers and eval splits from each run's
 * metadata and produces a CompatibilityResult:
 *   - "compatible"  — all runs with metadata report the same names.
 *   - "mismatch"    — differing names detected across runs.
 *   - "unverified"  — at least one run has no dataset or split metadata,
 *                     so compatibility cannot be confirmed or denied.
 *
 * Missing metadata is reported as unverified, never assumed to match.
 */

import type {
  ExperimentRun,
  ComparisonResult,
  RankedRun,
  OptimizationDirection,
  CompatibilityResult,
  CompatibilityStatus,
} from "@/lib/schema";

// ---------------------------------------------------------------------------
// Compatibility assessment
// ---------------------------------------------------------------------------

/**
 * Assess dataset / eval-split compatibility across a set of runs.
 * Called by compareRuns; also exported for direct use in tests.
 */
export function assessCompatibility(runs: ExperimentRun[]): CompatibilityResult {
  if (runs.length === 0) {
    return {
      status: "compatible",
      reason: "No runs to compare.",
      runsWithMissingMetadata: [],
      datasetNames: [],
      splitNames: [],
    };
  }

  const runsWithMissingMetadata: string[] = [];
  const allDatasetNameSets: Set<string>[] = [];
  const allSplitNameSets: Set<string>[] = [];

  for (const run of runs) {
    const hasDatasets = run.metadata.datasetIdentifiers.length > 0;
    const hasSplits = run.metadata.evalSplits.length > 0;

    if (!hasDatasets && !hasSplits) {
      runsWithMissingMetadata.push(run.id);
    }
    allDatasetNameSets.push(new Set(run.metadata.datasetIdentifiers.map((d) => d.name)));
    allSplitNameSets.push(new Set(run.metadata.evalSplits.map((s) => s.name)));
  }

  // Collect all distinct names.
  const datasetNames = Array.from(
    new Set(runs.flatMap((r) => r.metadata.datasetIdentifiers.map((d) => d.name)))
  ).sort();
  const splitNames = Array.from(
    new Set(runs.flatMap((r) => r.metadata.evalSplits.map((s) => s.name)))
  ).sort();

  // If any run is missing all metadata → unverified.
  if (runsWithMissingMetadata.length > 0) {
    return {
      status: "unverified",
      reason:
        `${runsWithMissingMetadata.length} run(s) have no dataset identifiers or ` +
        `evaluation split metadata recorded (run IDs: ${runsWithMissingMetadata.join(", ")}). ` +
        `Compatibility cannot be confirmed or denied.`,
      runsWithMissingMetadata,
      datasetNames,
      splitNames,
    };
  }

  // All runs have at least one piece of metadata — check for mismatches.
  // Dataset mismatch: the union of all dataset name sets has > 1 element
  // only if different runs report different sets.
  const firstDatasets = allDatasetNameSets[0];
  const firstSplits = allSplitNameSets[0];

  const datasetMismatch = allDatasetNameSets.some(
    (s) => !setsEqual(s, firstDatasets)
  );
  const splitMismatch = allSplitNameSets.some(
    (s) => !setsEqual(s, firstSplits)
  );

  if (datasetMismatch || splitMismatch) {
    const parts: string[] = [];
    if (datasetMismatch) {
      parts.push(`dataset identifiers differ across runs (found: ${datasetNames.join(", ")})`);
    }
    if (splitMismatch) {
      parts.push(`evaluation splits differ across runs (found: ${splitNames.join(", ")})`);
    }
    return {
      status: "mismatch",
      reason:
        `Potential scientific comparison concern: ${parts.join("; ")}. ` +
        `Metric comparisons across these runs may not be meaningful. ` +
        `This does not confirm the runs are definitively incomparable.`,
      runsWithMissingMetadata: [],
      datasetNames,
      splitNames,
    };
  }

  return {
    status: "compatible",
    reason: "All runs report matching dataset identifiers and evaluation splits.",
    runsWithMissingMetadata: [],
    datasetNames,
    splitNames,
  };
}

// ---------------------------------------------------------------------------
// Comparator
// ---------------------------------------------------------------------------

/**
 * Compare experiment runs on a single metric.
 *
 * @param runs      The runs to compare. The array and its elements are not
 *                  mutated. May be empty.
 * @param metric    The metric name to compare (must match a key in
 *                  ExperimentRun.metrics).
 * @param direction "maximize" or "minimize".
 * @returns         A ComparisonResult with ranked runs and compatibility info.
 */
export function compareRuns(
  runs: readonly ExperimentRun[],
  metric: string,
  direction: OptimizationDirection
): ComparisonResult {
  // Work on a shallow copy so we don't sort the caller's array.
  const runsCopy = [...runs];

  // Split into runs WITH a valid value and runs WITHOUT.
  const withValue: { run: ExperimentRun; value: number }[] = [];
  const withoutValue: ExperimentRun[] = [];

  for (const run of runsCopy) {
    const v = run.metrics[metric];
    // The schema guarantees metrics only contains finite values, but guard
    // defensively to protect against callers that bypass the parser.
    if (typeof v === "number" && Number.isFinite(v)) {
      withValue.push({ run, value: v });
    } else {
      withoutValue.push(run);
    }
  }

  // Sort runs-with-value by metric, then by name, then by id.
  withValue.sort((a, b) => {
    const primary = direction === "maximize"
      ? b.value - a.value  // descending
      : a.value - b.value; // ascending
    if (primary !== 0) return primary;
    // Stable tie-break: name ascending, then id ascending.
    const nameOrder = a.run.name.localeCompare(b.run.name);
    if (nameOrder !== 0) return nameOrder;
    return a.run.id.localeCompare(b.run.id);
  });

  // Sort runs-without-value by name, then id (deterministic).
  withoutValue.sort((a, b) => {
    const nameOrder = a.name.localeCompare(b.name);
    if (nameOrder !== 0) return nameOrder;
    return a.id.localeCompare(b.id);
  });

  // Assign ranks. Tied values share the same rank (standard competition / 1224).
  const ranking: RankedRun[] = [];
  let currentRank = 1;
  let bestValue: number | null = null;

  for (let i = 0; i < withValue.length; i++) {
    const { run, value } = withValue[i];

    // Detect ties: same rank if value equals previous entry's value.
    if (i > 0 && value === withValue[i - 1].value) {
      // Tied with previous — keep the same rank as the previous entry.
      const prevRank = ranking[ranking.length - 1].rank;
      ranking.push({
        run,
        rank: prevRank,
        metricValue: value,
        delta: bestValue !== null ? value - bestValue : 0,
      });
    } else {
      // New rank = position (1-based).
      currentRank = i + 1;
      if (i === 0) {
        bestValue = value;
      }
      ranking.push({
        run,
        rank: currentRank,
        metricValue: value,
        // Rank-1 run: delta is 0 (relative to itself, explicitly).
        delta: bestValue !== null ? value - bestValue : 0,
      });
    }
  }

  // Runs without a value: rank = last ranked position + 1, or 1 if no ranked runs.
  const noValueRank = withValue.length + 1;
  for (const run of withoutValue) {
    ranking.push({
      run,
      rank: noValueRank,
      metricValue: null,
      delta: null,
    });
  }

  // Assess compatibility (on the original runs array, not the copy).
  const compatibility = assessCompatibility([...runs]);

  return {
    runs: [...runs],
    metric,
    direction,
    ranking,
    compatibility,
  };
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}
