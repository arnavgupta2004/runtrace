/**
 * __tests__/helpers/factories.ts
 *
 * Minimal ExperimentRun factory helpers for use across test suites.
 * Produces well-typed objects without requiring ZIP parsing.
 */

import type {
  ExperimentRun,
  RunMetadata,
  ArtifactIndex,
  DatasetRef,
  EvalSplit,
} from "@/lib/schema";

export function makeArtifacts(overrides: Partial<ArtifactIndex> = {}): ArtifactIndex {
  return {
    rawFiles: [],
    metricsSourceFiles: [],
    configSourceFiles: [],
    dependencySourceFiles: [],
    gitSourceFiles: [],
    ...overrides,
  };
}

export function makeMetadata(overrides: Partial<RunMetadata> = {}): RunMetadata {
  return {
    randomSeeds: {},
    datasetIdentifiers: [],
    evalSplits: [],
    dependencyVersions: {},
    ...overrides,
  };
}

export function makeRun(
  id: string,
  metrics: Record<string, number> = {},
  metadataOverrides: Partial<RunMetadata> = {},
  artifactOverrides: Partial<ArtifactIndex> = {}
): ExperimentRun {
  return {
    id,
    name: id,
    metrics,
    metadata: makeMetadata(metadataOverrides),
    artifacts: makeArtifacts(artifactOverrides),
  };
}

export function makeDatasetRef(name: string, version?: string): DatasetRef {
  return { name, version };
}

export function makeEvalSplit(name: string, size?: number): EvalSplit {
  return { name, size };
}
