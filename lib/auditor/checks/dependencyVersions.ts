/**
 * lib/auditor/checks/dependencyVersions.ts
 *
 * Audit check for the "dependency_versions" dimension.
 *
 * Status rules
 * ------------
 * confirmed — all recorded dependencies have non-empty version strings.
 * problem   — at least one dependency has an empty version string, meaning it
 *             was detected in requirements.txt or environment.yml but its exact
 *             version could not be determined (unpinned, range-specifier, VCS
 *             install, etc.).  This is an elevated risk: the dependency is
 *             recorded but the specific version used is unknown.
 * missing   — dependencyVersions is an empty object (no dependency file found).
 *
 * A "problem" status never fabricates version information.  The message
 * identifies which packages were unpinned and which were pinned.
 *
 * Evidence
 * --------
 * Populated from artifacts.dependencySourceFiles.
 */

import type { ExperimentRun, AuditCheck } from "@/lib/schema";

export function checkDependencyVersions(run: ExperimentRun): AuditCheck {
  const deps = run.metadata.dependencyVersions;
  const evidence = run.artifacts.dependencySourceFiles.filter(Boolean);

  const entries = Object.entries(deps);

  if (entries.length === 0) {
    return {
      dimension: "dependency_versions",
      status: "missing",
      evidence: [],
      message:
        "No dependency information was found in this archive. " +
        "The software environment used for this run cannot be determined from the available metadata.",
    };
  }

  const pinned = entries.filter(([, v]) => v !== "");
  const unpinned = entries.filter(([, v]) => v === "");

  if (unpinned.length > 0) {
    const unpinnedNames = unpinned.map(([k]) => k).join(", ");
    const pinnedSummary =
      pinned.length > 0
        ? `${pinned.length} package(s) pinned`
        : "no packages pinned";

    return {
      dimension: "dependency_versions",
      status: "problem",
      evidence,
      message:
        `${unpinned.length} dependency/ies recorded without an exact version pin: ${unpinnedNames}. ` +
        `(${pinnedSummary}.) ` +
        `Unpinned or range-constrained dependencies may resolve to different versions on reinstallation. ` +
        `The exact version used during this run is unknown for these packages — no version has been fabricated.`,
    };
  }

  return {
    dimension: "dependency_versions",
    status: "confirmed",
    evidence,
    message:
      `${pinned.length} dependency/ies recorded with exact version pins. ` +
      `Note: this confirms versions were captured — it does not verify the packages are available or authentic.`,
  };
}
