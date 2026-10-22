/**
 * lib/auditor/checks/evalSplits.ts
 *
 * Audit check for the "eval_splits" dimension.
 *
 * Status rules
 * ------------
 * confirmed — at least one EvalSplit is present.
 * missing   — evalSplits is an empty array.
 *
 * A present split name is recorded evidence, not proof that the split was
 * applied correctly or that the same split is used across runs.  Cross-run
 * split consistency is assessed by the comparator's CompatibilityResult.
 *
 * Evidence
 * --------
 * Populated from artifacts.configSourceFiles.
 */

import type { ExperimentRun, AuditCheck } from "@/lib/schema";

export function checkEvalSplits(run: ExperimentRun): AuditCheck {
  const splits = run.metadata.evalSplits;
  const evidence = run.artifacts.configSourceFiles.filter(Boolean);

  if (splits.length === 0) {
    return {
      dimension: "eval_splits",
      status: "missing",
      evidence: [],
      message:
        "No evaluation split information was found in this archive. " +
        "Which data partition was used for evaluation cannot be determined.",
    };
  }

  const names = splits
    .map((s) => (s.size !== undefined ? `${s.name}(n=${s.size})` : s.name))
    .join(", ");

  return {
    dimension: "eval_splits",
    status: "confirmed",
    evidence,
    message:
      `Evaluation split(s) recorded: ${names}. ` +
      `Note: this confirms split names were captured — it does not verify that the same split ` +
      `was used consistently across all compared runs.`,
  };
}
