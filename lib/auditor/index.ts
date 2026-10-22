/**
 * lib/auditor/index.ts
 *
 * Reproducibility auditor for Runtrace.
 *
 * Public API
 * ----------
 *   auditRun(run: ExperimentRun): AuditReport
 *
 * Each call runs all five dimension checks and aggregates them into an
 * AuditReport with an overall score.
 *
 * Overall score rules
 * -------------------
 * "poor"    — at least one check has status "problem".
 * "partial" — no "problem" checks, but at least one check has status "missing".
 * "good"    — all five checks have status "confirmed".
 *
 * The score is a descriptive summary, not a statistical probability or
 * guarantee of reproducibility. A "good" score means all five dimensions have
 * recorded metadata — it does not certify that reproduction will succeed.
 *
 * Determinism
 * -----------
 * auditRun is a pure function with no external dependencies or side effects.
 * Given the same ExperimentRun, it always returns the same AuditReport.
 */

import type { ExperimentRun, AuditReport, AuditScore, AuditCheck } from "@/lib/schema";
import { checkGitRevision } from "./checks/gitRevision";
import { checkRandomSeeds } from "./checks/randomSeeds";
import { checkDatasetIdentifiers } from "./checks/datasetIdentifiers";
import { checkEvalSplits } from "./checks/evalSplits";
import { checkDependencyVersions } from "./checks/dependencyVersions";

/**
 * Run all five reproducibility checks on a single experiment run.
 */
export function auditRun(run: ExperimentRun): AuditReport {
  const checks: AuditCheck[] = [
    checkGitRevision(run),
    checkRandomSeeds(run),
    checkDatasetIdentifiers(run),
    checkEvalSplits(run),
    checkDependencyVersions(run),
  ];

  const overallScore = aggregateScore(checks);

  return {
    runId: run.id,
    checks,
    overallScore,
  };
}

/**
 * Aggregate individual check statuses into an overall AuditScore.
 *
 * Rules (in priority order):
 *   1. Any "problem" → "poor"
 *   2. Any "missing"  → "partial"
 *   3. All "confirmed" → "good"
 */
export function aggregateScore(checks: AuditCheck[]): AuditScore {
  const hasProblems = checks.some((c) => c.status === "problem");
  if (hasProblems) return "poor";

  const hasMissing = checks.some((c) => c.status === "missing");
  if (hasMissing) return "partial";

  return "good";
}
