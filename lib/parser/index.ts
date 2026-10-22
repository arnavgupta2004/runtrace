/**
 * lib/parser/index.ts
 *
 * Public API for ZIP ingestion.
 *
 * parseZip(file: File): Promise<ParseResult>
 *
 * All parsing runs entirely in the browser using JSZip.  No data is sent to
 * any external service.  JSZip's loadAsync is non-blocking but does NOT run
 * in a web worker — large ZIPs will still occupy the main thread.
 *
 * Upload limits (configurable via PARSE_LIMITS)
 * ----------------------------------------------
 *   maxCompressedBytes   200 MB   checked before unzipping
 *   maxEntries           5 000    total files inside the ZIP
 *   maxUncompressedBytes 500 MB   total across all files
 *
 * File selection and precedence
 * ------------------------------
 * When multiple candidate files match a role (e.g. both metrics.json and
 * metrics.csv exist), precedence is:
 *   metrics: metrics.csv  > metrics.json  > results.json  > results_*.json
 *   config:  config.yaml  > config.yml    > params.yaml   > params.yml
 *            > hparams.yaml > hparams.yml > config.json
 *            > hyperparams.yaml > hyperparams.json
 *   deps:    requirements.txt  > environment.yml  > environment.yaml
 *   git:     git_info.json  (then any config key for revision/dirty)
 *
 * MLflow local file store (best-effort)
 * --------------------------------------
 * Detected when the ZIP contains a path matching:
 *   mlruns/<exp_id>/<run_id>/meta.yaml
 * Only ZIPs with EXACTLY ONE run_id are parsed; ZIPs with multiple run IDs
 * return a ParseError to avoid producing one misleading ExperimentRun.
 *
 * Error model
 * -----------
 * parseZip returns a ParseResult discriminated union:
 *   { ok: true;  run: ExperimentRun; warnings: string[] }
 *   { ok: false; error: string }
 *
 * Warnings are non-fatal; they describe skipped files, duplicate candidates,
 * or missing metadata.  The run is still returned.
 */

import JSZip from "jszip";
import type { ExperimentRun, RunMetadata, ArtifactIndex } from "@/lib/schema";
import { parseMetricsCsv, parseMetricsJson } from "./metrics";
import {
  parseConfigFile,
  parseGitInfoJson,
  isConfigFile,
  mergeMetadata,
} from "./config";
import { parseRequirementsTxt, parseEnvironmentYml } from "./requirements";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ParseSuccess {
  ok: true;
  run: ExperimentRun;
  warnings: string[];
}

export interface ParseError {
  ok: false;
  error: string;
}

export type ParseResult = ParseSuccess | ParseError;

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

export interface ParseLimits {
  maxCompressedBytes: number;
  maxEntries: number;
  maxUncompressedBytes: number;
}

export const DEFAULT_LIMITS: ParseLimits = {
  maxCompressedBytes: 200 * 1024 * 1024,   // 200 MB
  maxEntries: 5_000,
  maxUncompressedBytes: 500 * 1024 * 1024, // 500 MB
};

// ---------------------------------------------------------------------------
// File role classification
// ---------------------------------------------------------------------------

type FileRole =
  | "metrics_csv"
  | "metrics_json"
  | "results_json"
  | "config"
  | "git_info"
  | "requirements_txt"
  | "environment_yml"
  | "mlflow_metric"
  | "mlflow_param"
  | "mlflow_tag"
  | "mlflow_meta"
  | "other";

function classifyFile(relativePath: string): FileRole {
  const lower = relativePath.toLowerCase();
  const base = lower.split("/").pop() ?? lower;

  // MLflow roles — checked before generic roles.
  if (/mlruns\/[^/]+\/[^/]+\/metrics\/[^/]+$/.test(lower)) return "mlflow_metric";
  if (/mlruns\/[^/]+\/[^/]+\/params\/[^/]+$/.test(lower)) return "mlflow_param";
  if (/mlruns\/[^/]+\/[^/]+\/tags\/[^/]+$/.test(lower)) return "mlflow_tag";
  if (/mlruns\/[^/]+\/[^/]+\/meta\.yaml$/.test(lower)) return "mlflow_meta";

  if (base === "metrics.csv") return "metrics_csv";
  if (base === "metrics.json") return "metrics_json";
  if (base === "results.json" || /^results_.*\.json$/.test(base)) return "results_json";
  if (base === "git_info.json") return "git_info";
  if (base === "requirements.txt") return "requirements_txt";
  if (base === "environment.yml" || base === "environment.yaml") return "environment_yml";
  if (isConfigFile(base)) return "config";

  return "other";
}

// ---------------------------------------------------------------------------
// Metrics precedence
// ---------------------------------------------------------------------------

const METRICS_PRECEDENCE: FileRole[] = [
  "metrics_csv",
  "metrics_json",
  "results_json",
];

// ---------------------------------------------------------------------------
// Config precedence helper
// ---------------------------------------------------------------------------

const CONFIG_PRECEDENCE_ORDER = [
  "config.yaml", "config.yml", "params.yaml", "params.yml",
  "hparams.yaml", "hparams.yml",
  "hyperparams.yaml", "hyperparams.yml",
  "config.json", "hyperparams.json",
];

function configPrecedenceIndex(filename: string): number {
  const base = filename.split("/").pop()?.toLowerCase() ?? "";
  const idx = CONFIG_PRECEDENCE_ORDER.indexOf(base);
  return idx === -1 ? CONFIG_PRECEDENCE_ORDER.length : idx;
}

// ---------------------------------------------------------------------------
// MLflow helpers
// ---------------------------------------------------------------------------

interface MlflowRunPaths {
  runId: string;
  metricPaths: string[];
  paramPaths: string[];
  tagPaths: string[];
  metaPath?: string;
}

/**
 * Detect MLflow run paths.
 *
 * @param originalPaths  The raw paths from the ZIP (pre-strip) — used for
 *                       MLflow structure detection which requires the full path.
 * @param strippedPaths  The prefix-stripped paths (same indices) — stored in
 *                       MlflowRunPaths so that findByStripped() can look them up.
 *
 * Returns:
 *   null   — not an MLflow archive
 *   string — error message (multiple run IDs found)
 *   MlflowRunPaths — single valid run
 */
function detectMlflowRun(
  originalPaths: string[],
  strippedPaths: string[]
): MlflowRunPaths | null | string {
  const runIds = new Set<string>();
  const runPathMap: Record<string, MlflowRunPaths> = {};

  for (let i = 0; i < originalPaths.length; i++) {
    const orig = originalPaths[i].toLowerCase();
    const stripped = strippedPaths[i];
    // Match MLflow structure in original (unstripped) path.
    const m = orig.match(/mlruns\/([^/]+)\/([^/]+)\//);
    if (!m) continue;
    const runId = m[2];
    runIds.add(runId);
    if (!runPathMap[runId]) {
      runPathMap[runId] = {
        runId,
        metricPaths: [],
        paramPaths: [],
        tagPaths: [],
      };
    }
    // Store STRIPPED paths for findByStripped() lookup.
    const role = classifyFile(orig);
    if (role === "mlflow_metric") runPathMap[runId].metricPaths.push(stripped);
    if (role === "mlflow_param") runPathMap[runId].paramPaths.push(stripped);
    if (role === "mlflow_tag") runPathMap[runId].tagPaths.push(stripped);
    if (role === "mlflow_meta") runPathMap[runId].metaPath = stripped;
  }

  if (runIds.size === 0) return null;
  if (runIds.size > 1) {
    return `ZIP contains ${runIds.size} MLflow run IDs. Only ZIPs with a single run are supported to avoid ambiguous results.`;
  }

  const [singleRunId] = runIds;
  return runPathMap[singleRunId];
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Parse a ZIP file and return an ExperimentRun.
 *
 * @param file   The ZIP File from the browser's File API.
 * @param name   Optional display name override; defaults to the filename
 *               without extension.
 * @param limits Optional size / entry limits (defaults to DEFAULT_LIMITS).
 */
export async function parseZip(
  file: File,
  name?: string,
  limits: ParseLimits = DEFAULT_LIMITS
): Promise<ParseResult> {
  // -------------------------------------------------------------------------
  // Limit: compressed size
  // -------------------------------------------------------------------------
  if (file.size > limits.maxCompressedBytes) {
    return {
      ok: false,
      error: `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum allowed compressed size is ${(limits.maxCompressedBytes / 1024 / 1024).toFixed(0)} MB.`,
    };
  }

  // -------------------------------------------------------------------------
  // Derive run ID / name
  // -------------------------------------------------------------------------
  const runId = deriveId(name ?? file.name);
  const runName = name ?? runId;
  const warnings: string[] = [];

  // -------------------------------------------------------------------------
  // Load ZIP
  // -------------------------------------------------------------------------
  let zip: JSZip;
  try {
    const arrayBuffer = await file.arrayBuffer();
    zip = await JSZip.loadAsync(arrayBuffer);
  } catch (e) {
    return {
      ok: false,
      error: `Could not open ZIP archive: ${(e as Error).message}`,
    };
  }

  // -------------------------------------------------------------------------
  // Enumerate entries (files only, no directories)
  // -------------------------------------------------------------------------
  const entries: { path: string; entry: JSZip.JSZipObject }[] = [];
  zip.forEach((relativePath, entry) => {
    if (!entry.dir) {
      entries.push({ path: relativePath, entry });
    }
  });

  // Limit: entry count
  if (entries.length > limits.maxEntries) {
    return {
      ok: false,
      error: `ZIP contains ${entries.length} files which exceeds the limit of ${limits.maxEntries}.`,
    };
  }

  const allPaths = entries.map((e) => e.path);

  // -------------------------------------------------------------------------
  // Detect common top-level directory and strip it for role classification
  // -------------------------------------------------------------------------
  const stripped = stripCommonPrefix(allPaths);

  // -------------------------------------------------------------------------
  // Classify files
  // -------------------------------------------------------------------------
  type ClassifiedEntry = {
    originalPath: string;
    strippedPath: string;
    role: FileRole;
    entry: JSZip.JSZipObject;
  };

  const classified: ClassifiedEntry[] = entries.map((e, i) => ({
    originalPath: e.path,
    strippedPath: stripped[i],
    role: classifyFile(stripped[i]),
    entry: e.entry,
  }));

  // -------------------------------------------------------------------------
  // Detect MLflow layout
  // -------------------------------------------------------------------------
  const mlflowDetection = detectMlflowRun(allPaths, stripped);

  if (typeof mlflowDetection === "string") {
    // Multiple run IDs — error.
    return { ok: false, error: mlflowDetection };
  }

  const isMlflow = mlflowDetection !== null;

  // -------------------------------------------------------------------------
  // Helpers to read file content
  // -------------------------------------------------------------------------
  async function readText(entry: JSZip.JSZipObject): Promise<string> {
    return entry.async("string");
  }

  // -------------------------------------------------------------------------
  // Track uncompressed bytes
  // -------------------------------------------------------------------------
  let totalUncompressedBytes = 0;
  async function readTextWithLimit(
    entry: JSZip.JSZipObject,
    path: string
  ): Promise<string | null> {
    const meta = entry as unknown as { _data?: { uncompressedSize?: number } };
    const uncompressedSize = meta._data?.uncompressedSize ?? 0;
    totalUncompressedBytes += uncompressedSize;
    if (totalUncompressedBytes > limits.maxUncompressedBytes) {
      warnings.push(
        `Skipped "${path}": total uncompressed size exceeds ${(limits.maxUncompressedBytes / 1024 / 1024).toFixed(0)} MB limit.`
      );
      return null;
    }
    return readText(entry);
  }

  // -------------------------------------------------------------------------
  // Artifact index
  // -------------------------------------------------------------------------
  const artifactIndex: ArtifactIndex = {
    rawFiles: allPaths,
    metricsSourceFiles: [],
    configSourceFiles: [],
    dependencySourceFiles: [],
    gitSourceFiles: [],
  };

  // -------------------------------------------------------------------------
  // Collect by role
  // -------------------------------------------------------------------------
  const byRole = new Map<FileRole, ClassifiedEntry[]>();
  for (const ce of classified) {
    const list = byRole.get(ce.role) ?? [];
    list.push(ce);
    byRole.set(ce.role, list);
  }

  // -------------------------------------------------------------------------
  // Parse metrics
  // -------------------------------------------------------------------------
  let metrics: Record<string, number> = {};

  if (isMlflow) {
    const mlflow = mlflowDetection as MlflowRunPaths;
    for (const metricPath of mlflow.metricPaths) {
      const ce = findByStripped(classified, metricPath);
      if (!ce) continue;
      const content = await readTextWithLimit(ce.entry, ce.originalPath);
      if (content === null) continue;
      const metricName = metricPath.split("/").pop() ?? "";
      if (!metricName) continue;
      const value = parseMLflowMetricFile(content);
      if (value !== undefined) {
        metrics[metricName] = value;
        if (!artifactIndex.metricsSourceFiles.includes(ce.originalPath)) {
          artifactIndex.metricsSourceFiles.push(ce.originalPath);
        }
      }
    }
  } else {
    // Find the highest-precedence metrics file.
    for (const role of METRICS_PRECEDENCE) {
      const candidates = byRole.get(role) ?? [];
      if (candidates.length === 0) continue;

      if (candidates.length > 1) {
        warnings.push(
          `Multiple ${role} files found; using "${candidates[0].strippedPath}". Others: ${candidates
            .slice(1)
            .map((c) => c.strippedPath)
            .join(", ")}.`
        );
      }

      const ce = candidates[0];
      const content = await readTextWithLimit(ce.entry, ce.originalPath);
      if (content === null) break;

      try {
        if (role === "metrics_csv") {
          metrics = parseMetricsCsv(content);
        } else {
          metrics = parseMetricsJson(content);
        }
        artifactIndex.metricsSourceFiles.push(ce.originalPath);
      } catch (e) {
        warnings.push(
          `Could not parse metrics from "${ce.originalPath}": ${(e as Error).message}`
        );
      }
      break; // Only use the first valid role.
    }
  }

  // -------------------------------------------------------------------------
  // Parse config / metadata
  // -------------------------------------------------------------------------
  const metadataParts: Partial<RunMetadata>[] = [];

  if (isMlflow) {
    const mlflow = mlflowDetection as MlflowRunPaths;

    // MLflow params (each file: single line "<value>")
    const paramMap: Record<string, string | number | boolean> = {};
    for (const paramPath of mlflow.paramPaths) {
      const ce = findByStripped(classified, paramPath);
      if (!ce) continue;
      const content = await readTextWithLimit(ce.entry, ce.originalPath);
      if (content === null) continue;
      const paramName = paramPath.split("/").pop() ?? "";
      if (!paramName) continue;
      paramMap[paramName] = content.trim();
      if (!artifactIndex.configSourceFiles.includes(ce.originalPath)) {
        artifactIndex.configSourceFiles.push(ce.originalPath);
      }
    }

    if (Object.keys(paramMap).length > 0) {
      const { extractMetadataFromConfig } = await import("./config");
      metadataParts.push(extractMetadataFromConfig(paramMap, "mlflow/params"));
    }

    // MLflow tags
    for (const tagPath of mlflow.tagPaths) {
      const ce = findByStripped(classified, tagPath);
      if (!ce) continue;
      const content = await readTextWithLimit(ce.entry, ce.originalPath);
      if (content === null) continue;
      const tagName = tagPath.split("/").pop() ?? "";
      if (!tagName) continue;
      const tagValue = content.trim();

      if (tagName === "mlflow.source.git.commit" && tagValue) {
        metadataParts.push({ gitRevision: tagValue });
        artifactIndex.gitSourceFiles.push(ce.originalPath);
      }
      // Other tags (e.g. mlflow.source.git.repoURL) are recorded in rawFiles.
    }
  } else {
    // Sort config candidates by precedence.
    const configCandidates = (byRole.get("config") ?? []).sort(
      (a, b) =>
        configPrecedenceIndex(a.strippedPath) -
        configPrecedenceIndex(b.strippedPath)
    );

    for (const ce of configCandidates) {
      const content = await readTextWithLimit(ce.entry, ce.originalPath);
      if (content === null) continue;
      const partial = parseConfigFile(content, ce.strippedPath);
      if (Object.keys(partial).length > 0) {
        metadataParts.push(partial);
      }
      artifactIndex.configSourceFiles.push(ce.originalPath);
    }
  }

  // Git info JSON (flat layout only; MLflow tags handle git for MLflow).
  if (!isMlflow) {
    const gitInfoCandidates = byRole.get("git_info") ?? [];
    for (const ce of gitInfoCandidates) {
      const content = await readTextWithLimit(ce.entry, ce.originalPath);
      if (content === null) continue;
      const partial = parseGitInfoJson(content);
      if (Object.keys(partial).length > 0) {
        metadataParts.push(partial);
        artifactIndex.gitSourceFiles.push(ce.originalPath);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Parse dependencies
  // -------------------------------------------------------------------------
  let dependencyVersions: Record<string, string> = {};

  const reqCandidates = byRole.get("requirements_txt") ?? [];
  if (reqCandidates.length > 0) {
    if (reqCandidates.length > 1) {
      warnings.push(
        `Multiple requirements.txt files found; using "${reqCandidates[0].strippedPath}".`
      );
    }
    const ce = reqCandidates[0];
    const content = await readTextWithLimit(ce.entry, ce.originalPath);
    if (content !== null) {
      dependencyVersions = parseRequirementsTxt(content);
      artifactIndex.dependencySourceFiles.push(ce.originalPath);
    }
  }

  const envCandidates = [
    ...(byRole.get("environment_yml") ?? []),
  ];
  if (envCandidates.length > 0 && Object.keys(dependencyVersions).length === 0) {
    if (envCandidates.length > 1) {
      warnings.push(
        `Multiple environment.yml files found; using "${envCandidates[0].strippedPath}".`
      );
    }
    const ce = envCandidates[0];
    const content = await readTextWithLimit(ce.entry, ce.originalPath);
    if (content !== null) {
      dependencyVersions = parseEnvironmentYml(content);
      artifactIndex.dependencySourceFiles.push(ce.originalPath);
    }
  }

  // -------------------------------------------------------------------------
  // Assemble metadata
  // -------------------------------------------------------------------------
  const mergedMeta = mergeMetadata(metadataParts);
  if (Object.keys(dependencyVersions).length > 0) {
    mergedMeta.dependencyVersions = dependencyVersions;
  }

  // Warn if no metrics found.
  if (Object.keys(metrics).length === 0) {
    warnings.push(
      "No metrics were found in this archive. Ensure a metrics.csv, metrics.json, or results.json file is present."
    );
  }

  // -------------------------------------------------------------------------
  // Build result
  // -------------------------------------------------------------------------
  const run: ExperimentRun = {
    id: runId,
    name: runName,
    metadata: mergedMeta,
    metrics,
    artifacts: artifactIndex,
  };

  return { ok: true, run, warnings };
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/** Derive a stable ID from a filename (strip extension, sanitise). */
function deriveId(filename: string): string {
  return filename
    .replace(/\.zip$/i, "")
    .replace(/[^A-Za-z0-9_\-\.]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "") || "run";
}

/**
 * Strip a common path prefix if ALL entries share one.
 * This handles the case where a ZIP was created with a top-level folder
 * (e.g. "my-experiment/metrics.csv").
 */
function stripCommonPrefix(paths: string[]): string[] {
  if (paths.length === 0) return paths;

  const parts = paths[0].split("/");
  let prefixLength = 0;

  for (let depth = 1; depth <= parts.length; depth++) {
    const candidate = parts.slice(0, depth).join("/") + "/";
    if (paths.every((p) => p.startsWith(candidate))) {
      prefixLength = candidate.length;
    } else {
      break;
    }
  }

  if (prefixLength === 0) return paths;
  return paths.map((p) => p.slice(prefixLength));
}

/** Find a classified entry by its stripped path. */
function findByStripped(
  classified: { originalPath: string; strippedPath: string; entry: JSZip.JSZipObject; role: FileRole }[],
  strippedPath: string
): { originalPath: string; strippedPath: string; entry: JSZip.JSZipObject; role: FileRole } | undefined {
  return classified.find((c) => c.strippedPath === strippedPath);
}

/**
 * Parse an MLflow metric file.
 * Format: each line is "<timestamp> <value> <step>"
 * Returns the value from the LAST line with a finite numeric value.
 */
function parseMLflowMetricFile(content: string): number | undefined {
  const lines = content.trim().split("\n");
  // Iterate in reverse to find the last valid measurement.
  for (let i = lines.length - 1; i >= 0; i--) {
    const parts = lines[i].trim().split(/\s+/);
    if (parts.length < 2) continue;
    const value = Number(parts[1]);
    if (Number.isFinite(value)) return value;
  }
  return undefined;
}
