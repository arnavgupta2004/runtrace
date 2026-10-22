/**
 * lib/schema.ts
 *
 * Canonical TypeScript types shared across all Runtrace modules.
 * No runtime logic lives here — types only.
 */

// ---------------------------------------------------------------------------
// Core artifact types
// ---------------------------------------------------------------------------

/** A reference to a dataset used during this run. */
export interface DatasetRef {
  name: string;
  version?: string;
  hash?: string;
}

/** A reference to an evaluation split used during this run. */
export interface EvalSplit {
  name: string;
  size?: number;
  hash?: string;
}

/**
 * Reproducibility metadata extracted from config, git_info.json,
 * requirements.txt, and environment.yml files inside the artifact ZIP.
 */
export interface RunMetadata {
  /** Full commit SHA or short hash from git metadata. */
  gitRevision?: string;
  /**
   * True when the working tree had uncommitted modifications at run time.
   * This indicates elevated reproducibility risk: the commit hash alone
   * may not fully describe the code state. It does NOT confirm reproduction
   * is impossible — only that additional uncertainty exists.
   */
  gitDirty?: boolean;
  /**
   * Named random seeds keyed by component (e.g. "global", "numpy", "torch").
   * An empty object means no seeds were found.
   */
  randomSeeds: Record<string, number>;
  /** Dataset references extracted from config files. */
  datasetIdentifiers: DatasetRef[];
  /** Evaluation splits referenced in config files. */
  evalSplits: EvalSplit[];
  /** Dependency name → version string from requirements.txt or environment.yml. */
  dependencyVersions: Record<string, string>;
  /** ML framework detected from config or dependency list (e.g. "pytorch", "tensorflow"). */
  framework?: string;
  /** ISO 8601 timestamp from config or MLflow tags, if present. */
  timestamp?: string;
}

/**
 * Index of all parsed artifacts found in the ZIP.
 * rawFiles contains every filename found, used as an evidence trail.
 */
export interface ArtifactIndex {
  /** Filenames of all files found inside the ZIP (relative paths). */
  rawFiles: string[];
  /** Filenames that were recognised as metrics sources. */
  metricsSourceFiles: string[];
  /** Filenames that were recognised as config sources. */
  configSourceFiles: string[];
  /** Filenames that were recognised as dependency sources. */
  dependencySourceFiles: string[];
  /** Filenames that were recognised as git metadata sources. */
  gitSourceFiles: string[];
}

/** A single parsed ML experiment run. */
export interface ExperimentRun {
  /** Derived from ZIP filename (without extension). */
  id: string;
  /** Display name (same as id by default). */
  name: string;
  /** Reproducibility metadata. */
  metadata: RunMetadata;
  /**
   * Metric name → value map. Only finite numeric values are stored here.
   * Non-finite values (NaN, Infinity, -Infinity) are excluded at parse time.
   */
  metrics: Record<string, number>;
  /** Index of all artifacts found, for evidence display. */
  artifacts: ArtifactIndex;
}

// ---------------------------------------------------------------------------
// Comparison types
// ---------------------------------------------------------------------------

/** Direction for optimising a metric. */
export type OptimizationDirection = "maximize" | "minimize";

/** A single run's position in a comparison ranking. */
export interface RankedRun {
  run: ExperimentRun;
  /** 1-based rank. Runs with no value for the selected metric are ranked last. */
  rank: number;
  /**
   * The metric value for this run, or null if the run has no value for the
   * selected metric.
   */
  metricValue: number | null;
  /**
   * Signed difference from the rank-1 run's value, or null for rank-1 itself
   * and for runs with no value.
   */
  delta: number | null;
}

/**
 * Dataset / eval-split compatibility status across the runs being compared.
 *
 * - "compatible"  — all runs report the same identifiers and splits (or none
 *                   report any, which is itself a missing-evidence case handled
 *                   by the auditor rather than the comparator).
 * - "mismatch"    — at least one run's identifier or split differs from another's.
 *                   A scientific comparison of metrics across these runs may not
 *                   be valid. This does NOT claim the runs are definitively
 *                   incomparable — only that a difference was detected.
 * - "unverified"  — at least one run has no dataset or split metadata at all,
 *                   so compatibility cannot be confirmed or denied. The
 *                   comparator makes no assumption about compatibility.
 */
export type CompatibilityStatus = "compatible" | "mismatch" | "unverified";

/**
 * Structured compatibility assessment produced by the comparator.
 * Kept separate from audit results so the UI can surface it inline.
 */
export interface CompatibilityResult {
  status: CompatibilityStatus;
  /**
   * Human-readable explanation of why this status was assigned.
   * Never contains fabricated information — only facts drawn from metadata.
   */
  reason: string;
  /**
   * Run IDs that have no dataset identifiers or eval splits recorded.
   * Populated when status is "unverified".
   */
  runsWithMissingMetadata: string[];
  /**
   * The distinct dataset identifier names seen across all runs.
   * Empty when no run has any dataset identifiers.
   */
  datasetNames: string[];
  /**
   * The distinct eval split names seen across all runs.
   * Empty when no run has any eval splits.
   */
  splitNames: string[];
}

/** Result of comparing multiple runs on a single metric. */
export interface ComparisonResult {
  runs: ExperimentRun[];
  /** The metric name being compared. */
  metric: string;
  direction: OptimizationDirection;
  ranking: RankedRun[];
  /**
   * Structured compatibility assessment for dataset / eval-split consistency.
   * Replaces the former boolean datasetMismatch field with richer typing.
   *
   * Schema change note (Phase 3): `datasetMismatch: boolean` has been replaced
   * by `compatibility: CompatibilityResult`. This is additive — the boolean
   * can be derived as `compatibility.status === "mismatch"` where needed.
   */
  compatibility: CompatibilityResult;
}

// ---------------------------------------------------------------------------
// Audit types
// ---------------------------------------------------------------------------

/**
 * The five reproducibility dimensions Runtrace audits.
 */
export type AuditDimension =
  | "git_revision"
  | "random_seeds"
  | "dataset_identifiers"
  | "eval_splits"
  | "dependency_versions";

/**
 * Audit check status.
 *
 * - "confirmed" — evidence is present and the value is clean.
 * - "missing"   — no evidence found; no inference is made.
 * - "problem"   — evidence is present but indicates a known reproducibility risk.
 */
export type AuditStatus = "confirmed" | "missing" | "problem";

/**
 * Overall reproducibility score for a run.
 *
 * - "good"    — all dimensions confirmed, no problems.
 * - "partial" — some dimensions missing but no confirmed problems.
 * - "poor"    — one or more dimensions have a confirmed problem.
 */
export type AuditScore = "good" | "partial" | "poor";

/** A single reproducibility check for one dimension of one run. */
export interface AuditCheck {
  dimension: AuditDimension;
  status: AuditStatus;
  /**
   * Filenames or field paths that support this finding.
   * Never fabricated — only paths actually found during parsing.
   */
  evidence: string[];
  /** Human-readable summary of the finding. */
  message: string;
}

/** Full reproducibility audit for a single run. */
export interface AuditReport {
  runId: string;
  checks: AuditCheck[];
  overallScore: AuditScore;
}

// ---------------------------------------------------------------------------
// Export types
// ---------------------------------------------------------------------------

/** The payload passed to exporter functions. */
export interface ExportPayload {
  comparison: ComparisonResult;
  audits: AuditReport[];
}
