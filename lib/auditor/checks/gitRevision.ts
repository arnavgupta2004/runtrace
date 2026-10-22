/**
 * lib/auditor/checks/gitRevision.ts
 *
 * Audit check for the "git_revision" dimension.
 *
 * Status rules
 * ------------
 * confirmed — gitRevision is present AND gitDirty is false (or absent, which
 *             means clean-state was not contradicted).
 * problem   — gitRevision is present AND gitDirty is explicitly true.
 *             The commit hash may not fully describe uncommitted changes.
 *             This is elevated risk, not a confirmed reproduction failure.
 * missing   — gitRevision is absent.  gitDirty is irrelevant without a hash.
 *             No inference is made about the code state.
 *
 * Evidence
 * --------
 * Populated from artifacts.gitSourceFiles + artifacts.configSourceFiles
 * where the actual git revision was found.
 */

import type { ExperimentRun, AuditCheck } from "@/lib/schema";

export function checkGitRevision(run: ExperimentRun): AuditCheck {
  const { gitRevision, gitDirty } = run.metadata;
  // Gather all potential git evidence sources.
  const evidence = [
    ...run.artifacts.gitSourceFiles,
    ...run.artifacts.configSourceFiles,
  ].filter(Boolean);

  if (!gitRevision) {
    return {
      dimension: "git_revision",
      status: "missing",
      evidence: [],
      message:
        "No Git revision was found in this archive. " +
        "The exact code state at the time of this run cannot be determined from the available metadata.",
    };
  }

  if (gitDirty === true) {
    return {
      dimension: "git_revision",
      status: "problem",
      evidence,
      message:
        `Git revision recorded (${gitRevision}), but the working tree had uncommitted modifications. ` +
        `The commit hash alone may not fully describe the code state at the time of this run. ` +
        `This is an elevated reproducibility risk, not a confirmed reproduction failure.`,
    };
  }

  return {
    dimension: "git_revision",
    status: "confirmed",
    evidence,
    message:
      `Git revision recorded: ${gitRevision}. ` +
      `No uncommitted modifications were detected${gitDirty === false ? " (working tree reported clean)" : ""}.`,
  };
}
