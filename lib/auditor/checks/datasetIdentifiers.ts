/**
 * lib/auditor/checks/datasetIdentifiers.ts
 *
 * Audit check for the "dataset_identifiers" dimension.
 *
 * Status rules
 * ------------
 * confirmed — at least one DatasetRef is present.
 * missing   — datasetIdentifiers is an empty array.
 *
 * A present dataset name is recorded evidence, not proof that the exact
 * dataset version was used or that it is publicly available.
 *
 * Evidence
 * --------
 * Populated from artifacts.configSourceFiles.
 */

import type { ExperimentRun, AuditCheck } from "@/lib/schema";

export function checkDatasetIdentifiers(run: ExperimentRun): AuditCheck {
  const datasets = run.metadata.datasetIdentifiers;
  const evidence = run.artifacts.configSourceFiles.filter(Boolean);

  if (datasets.length === 0) {
    return {
      dimension: "dataset_identifiers",
      status: "missing",
      evidence: [],
      message:
        "No dataset identifiers were found in this archive. " +
        "The dataset used for this run cannot be determined from the available metadata.",
    };
  }

  const names = datasets
    .map((d) => (d.version ? `${d.name}@${d.version}` : d.name))
    .join(", ");

  return {
    dimension: "dataset_identifiers",
    status: "confirmed",
    evidence,
    message:
      `Dataset identifier(s) recorded: ${names}. ` +
      `Note: this confirms a name was captured — it does not verify dataset integrity or availability.`,
  };
}
