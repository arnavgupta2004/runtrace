/**
 * lib/auditor/checks/randomSeeds.ts
 *
 * Audit check for the "random_seeds" dimension.
 *
 * Status rules
 * ------------
 * confirmed — at least one seed entry is present in randomSeeds.
 *             A seed value of 0 is valid evidence; it must not be confused
 *             with the absence of seed metadata.
 * missing   — randomSeeds is an empty object (no seed keys found anywhere
 *             in the parsed artifacts).
 *
 * There is no "problem" status for seeds: a present seed value is recorded
 * evidence, not a guarantee of reproducibility (e.g. other libraries may
 * not be seeded). The auditor records what was found, not what was absent
 * from the code.
 *
 * Evidence
 * --------
 * Populated from artifacts.configSourceFiles (where seeds are extracted).
 */

import type { ExperimentRun, AuditCheck } from "@/lib/schema";

export function checkRandomSeeds(run: ExperimentRun): AuditCheck {
  const seeds = run.metadata.randomSeeds;
  const evidence = run.artifacts.configSourceFiles.filter(Boolean);

  const seedEntries = Object.entries(seeds);

  if (seedEntries.length === 0) {
    return {
      dimension: "random_seeds",
      status: "missing",
      evidence: [],
      message:
        "No random seed values were found in this archive. " +
        "Stochastic components of this run may not be reproducible.",
    };
  }

  const seedSummary = seedEntries
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");

  return {
    dimension: "random_seeds",
    status: "confirmed",
    evidence,
    message:
      `Random seed(s) recorded: ${seedSummary}. ` +
      `Note: this confirms seed values were captured — it does not guarantee all ` +
      `stochastic components were controlled.`,
  };
}
