/**
 * lib/parser/config.ts
 *
 * Parses configuration files (YAML and JSON) and maps recognised keys into
 * the canonical RunMetadata shape.
 *
 * Supported file names
 * --------------------
 *   config.yaml / config.yml
 *   params.yaml / params.yml
 *   config.json
 *   hparams.yaml / hparams.yml       (common in PyTorch Lightning)
 *   hyperparams.yaml / hyperparams.json
 *
 * Mapping rules
 * -------------
 * All key comparisons are case-insensitive.  Nested keys are flattened with
 * dot notation before matching (e.g. git.revision → "git.revision").
 *
 * Random seeds    seed, random_seed, data_seed, numpy_seed, torch_seed,
 *                 global_seed, base_seed
 * Dataset IDs     dataset, dataset_name, data_path, data_dir,
 *                 dataset_version, dataset_id, data_name
 * Eval splits     eval_split, test_split, val_split, evaluation_split,
 *                 dev_split
 * Git revision    git_revision, git.revision, commit, git.commit,
 *                 git_commit, sha, git_sha
 * Git dirty       git_dirty, git.dirty, is_dirty, dirty
 * Framework       framework, ml_framework, model_framework
 * Timestamp       timestamp, created_at, start_time, run_time, date
 */

import { load as yamlLoad } from "js-yaml";
import type { RunMetadata, DatasetRef, EvalSplit } from "@/lib/schema";

// ---------------------------------------------------------------------------
// Key alias tables (lower-cased)
// ---------------------------------------------------------------------------

const SEED_KEYS = new Set([
  "seed", "random_seed", "data_seed", "numpy_seed", "torch_seed",
  "global_seed", "base_seed",
]);

const DATASET_KEYS = new Set([
  "dataset", "dataset_name", "data_path", "data_dir",
  "dataset_version", "dataset_id", "data_name",
]);

const EVAL_SPLIT_KEYS = new Set([
  "eval_split", "test_split", "val_split", "evaluation_split", "dev_split",
]);

const GIT_REVISION_KEYS = new Set([
  "git_revision", "git.revision", "commit", "git.commit",
  "git_commit", "sha", "git_sha",
]);

const GIT_DIRTY_KEYS = new Set([
  "git_dirty", "git.dirty", "is_dirty", "dirty",
]);

const FRAMEWORK_KEYS = new Set([
  "framework", "ml_framework", "model_framework",
]);

const TIMESTAMP_KEYS = new Set([
  "timestamp", "created_at", "start_time", "run_time", "date",
]);

// ---------------------------------------------------------------------------
// File name classification
// ---------------------------------------------------------------------------

/** Returns true if the basename matches a supported config file name. */
export function isConfigFile(filename: string): boolean {
  const base = filename.split("/").pop()?.toLowerCase() ?? "";
  return (
    base === "config.yaml" ||
    base === "config.yml" ||
    base === "config.json" ||
    base === "params.yaml" ||
    base === "params.yml" ||
    base === "hparams.yaml" ||
    base === "hparams.yml" ||
    base === "hyperparams.yaml" ||
    base === "hyperparams.yml" ||
    base === "hyperparams.json"
  );
}

// ---------------------------------------------------------------------------
// Object flattening
// ---------------------------------------------------------------------------

/**
 * Recursively flatten a nested object into dot-notation keys.
 * Only string and number leaf values are retained.
 * Arrays are skipped to avoid false positives from list-typed config values.
 */
function flattenObject(
  obj: Record<string, unknown>,
  prefix = ""
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v === null || v === undefined) continue;
    if (typeof v === "boolean") {
      out[key] = v;
    } else if (typeof v === "number") {
      out[key] = v;
    } else if (typeof v === "string") {
      out[key] = v;
    } else if (typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, flattenObject(v as Record<string, unknown>, key));
    }
    // Arrays and other types are intentionally skipped.
  }
  return out;
}

// ---------------------------------------------------------------------------
// Core config parser
// ---------------------------------------------------------------------------

/**
 * Parse a YAML or JSON config string into a flat key→value map.
 * Returns an empty object on parse failure (failure is non-fatal; the caller
 * records the file in evidence but treats metadata as absent).
 */
export function parseConfigContent(
  content: string,
  filename: string
): Record<string, string | number | boolean> {
  if (content.trim() === "") return {};

  const lower = filename.toLowerCase();
  const isYaml = lower.endsWith(".yaml") || lower.endsWith(".yml");
  const isJson = lower.endsWith(".json");

  let parsed: unknown;

  try {
    if (isYaml) {
      parsed = yamlLoad(content);
    } else if (isJson) {
      parsed = JSON.parse(content);
    } else {
      // Unknown extension — try YAML first (superset of JSON), then JSON.
      try {
        parsed = yamlLoad(content);
      } catch {
        parsed = JSON.parse(content);
      }
    }
  } catch {
    return {};
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }

  return flattenObject(parsed as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// Metadata extraction
// ---------------------------------------------------------------------------

/**
 * Extract RunMetadata fields from a flat config key→value map.
 * Only keys with recognised names are mapped; unrecognised keys are ignored.
 * Missing metadata is represented as the absence of the field, not as null or
 * a fabricated value.
 */
export function extractMetadataFromConfig(
  flat: Record<string, string | number | boolean>,
  sourceFile: string
): Partial<RunMetadata> {
  const meta: Partial<RunMetadata> = {};
  const seedMap: Record<string, number> = {};
  const datasets: DatasetRef[] = [];
  const evalSplits: EvalSplit[] = [];

  for (const [rawKey, value] of Object.entries(flat)) {
    const key = rawKey.toLowerCase();

    // --- Seed keys ---
    if (SEED_KEYS.has(key)) {
      const n = typeof value === "number" ? value : Number(value);
      if (Number.isFinite(n)) {
        // Use the leaf key segment as the seed component name.
        const component = rawKey.split(".").pop() ?? rawKey;
        seedMap[component] = n;
      }
      continue;
    }

    // --- Dataset keys ---
    if (DATASET_KEYS.has(key)) {
      const strVal = String(value).trim();
      if (strVal) {
        datasets.push({ name: strVal });
      }
      continue;
    }

    // --- Eval split keys ---
    if (EVAL_SPLIT_KEYS.has(key)) {
      const strVal = String(value).trim();
      if (strVal) {
        evalSplits.push({ name: strVal });
      }
      continue;
    }

    // --- Git revision ---
    if (GIT_REVISION_KEYS.has(key)) {
      const strVal = String(value).trim();
      if (strVal) meta.gitRevision = strVal;
      continue;
    }

    // --- Git dirty ---
    if (GIT_DIRTY_KEYS.has(key)) {
      if (typeof value === "boolean") {
        meta.gitDirty = value;
      } else {
        const strVal = String(value).toLowerCase().trim();
        meta.gitDirty = strVal === "true" || strVal === "1" || strVal === "yes";
      }
      continue;
    }

    // --- Framework ---
    if (FRAMEWORK_KEYS.has(key)) {
      const strVal = String(value).trim();
      if (strVal) meta.framework = strVal;
      continue;
    }

    // --- Timestamp ---
    if (TIMESTAMP_KEYS.has(key)) {
      const strVal = String(value).trim();
      if (strVal) meta.timestamp = strVal;
      continue;
    }
  }

  if (Object.keys(seedMap).length > 0) meta.randomSeeds = seedMap;
  if (datasets.length > 0) meta.datasetIdentifiers = datasets;
  if (evalSplits.length > 0) meta.evalSplits = evalSplits;

  // Source file is recorded by the caller (index.ts) in ArtifactIndex,
  // not here — we only return the metadata.
  void sourceFile;

  return meta;
}

/**
 * Parse a config file and return extracted RunMetadata.
 * The source filename must be passed for extension detection.
 * Parse errors are swallowed; missing metadata is returned as partial.
 */
export function parseConfigFile(
  content: string,
  filename: string
): Partial<RunMetadata> {
  const flat = parseConfigContent(content, filename);
  return extractMetadataFromConfig(flat, filename);
}

// ---------------------------------------------------------------------------
// Git info JSON
// ---------------------------------------------------------------------------

/**
 * Parse a git_info.json file and return gitRevision / gitDirty.
 * Supported keys: revision, commit, sha  (for revision)
 *                 dirty, is_dirty        (for dirty flag)
 */
export function parseGitInfoJson(content: string): Partial<RunMetadata> {
  if (content.trim() === "") return {};
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return {};
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return {};

  const obj = raw as Record<string, unknown>;
  const meta: Partial<RunMetadata> = {};

  const revValue = obj["revision"] ?? obj["commit"] ?? obj["sha"];
  if (typeof revValue === "string" && revValue.trim()) {
    meta.gitRevision = revValue.trim();
  }

  const dirtyValue = obj["dirty"] ?? obj["is_dirty"];
  if (dirtyValue !== undefined) {
    if (typeof dirtyValue === "boolean") {
      meta.gitDirty = dirtyValue;
    } else {
      const s = String(dirtyValue).toLowerCase().trim();
      meta.gitDirty = s === "true" || s === "1" || s === "yes";
    }
  }

  return meta;
}

// ---------------------------------------------------------------------------
// Merge helpers
// ---------------------------------------------------------------------------

/**
 * Merge partial metadata from multiple sources into one RunMetadata.
 * First non-undefined value wins for scalar fields.
 * Seeds, datasets, and evalSplits are merged / deduplicated.
 */
export function mergeMetadata(
  parts: Partial<RunMetadata>[]
): RunMetadata {
  const merged: RunMetadata = {
    randomSeeds: {},
    datasetIdentifiers: [],
    evalSplits: [],
    dependencyVersions: {},
  };

  for (const part of parts) {
    if (part.gitRevision !== undefined && merged.gitRevision === undefined) {
      merged.gitRevision = part.gitRevision;
    }
    if (part.gitDirty !== undefined && merged.gitDirty === undefined) {
      merged.gitDirty = part.gitDirty;
    }
    if (part.framework !== undefined && merged.framework === undefined) {
      merged.framework = part.framework;
    }
    if (part.timestamp !== undefined && merged.timestamp === undefined) {
      merged.timestamp = part.timestamp;
    }
    if (part.randomSeeds) {
      Object.assign(merged.randomSeeds, part.randomSeeds);
    }
    if (part.datasetIdentifiers) {
      // Deduplicate by name.
      for (const d of part.datasetIdentifiers) {
        if (!merged.datasetIdentifiers.some((x) => x.name === d.name)) {
          merged.datasetIdentifiers.push(d);
        }
      }
    }
    if (part.evalSplits) {
      for (const s of part.evalSplits) {
        if (!merged.evalSplits.some((x) => x.name === s.name)) {
          merged.evalSplits.push(s);
        }
      }
    }
    if (part.dependencyVersions) {
      Object.assign(merged.dependencyVersions, part.dependencyVersions);
    }
  }

  return merged;
}
