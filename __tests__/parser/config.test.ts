/**
 * __tests__/parser/config.test.ts
 *
 * Tests for lib/parser/config.ts
 */

import { describe, it, expect } from "vitest";
import {
  parseConfigContent,
  parseConfigFile,
  parseGitInfoJson,
  mergeMetadata,
  isConfigFile,
} from "@/lib/parser/config";

// ---------------------------------------------------------------------------
// isConfigFile
// ---------------------------------------------------------------------------

describe("isConfigFile", () => {
  it("recognises supported config filenames", () => {
    expect(isConfigFile("config.yaml")).toBe(true);
    expect(isConfigFile("config.yml")).toBe(true);
    expect(isConfigFile("params.yaml")).toBe(true);
    expect(isConfigFile("params.yml")).toBe(true);
    expect(isConfigFile("hparams.yaml")).toBe(true);
    expect(isConfigFile("hparams.yml")).toBe(true);
    expect(isConfigFile("config.json")).toBe(true);
    expect(isConfigFile("hyperparams.yaml")).toBe(true);
    expect(isConfigFile("hyperparams.json")).toBe(true);
  });

  it("handles paths with directories", () => {
    expect(isConfigFile("run/config.yaml")).toBe(true);
    expect(isConfigFile("a/b/c/params.yml")).toBe(true);
  });

  it("rejects unrecognised filenames", () => {
    expect(isConfigFile("metrics.json")).toBe(false);
    expect(isConfigFile("requirements.txt")).toBe(false);
    expect(isConfigFile("model.pt")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseConfigContent
// ---------------------------------------------------------------------------

describe("parseConfigContent", () => {
  it("parses a simple YAML file", () => {
    const yaml = `seed: 42\ndataset: cifar10`;
    const result = parseConfigContent(yaml, "config.yaml");
    expect(result).toMatchObject({ seed: 42, dataset: "cifar10" });
  });

  it("flattens nested YAML keys with dot notation", () => {
    const yaml = `git:\n  revision: abc123\n  dirty: true`;
    const result = parseConfigContent(yaml, "config.yaml");
    expect(result["git.revision"]).toBe("abc123");
    expect(result["git.dirty"]).toBe(true);
  });

  it("parses a JSON config file", () => {
    const json = JSON.stringify({ seed: 42, dataset: "mnist" });
    const result = parseConfigContent(json, "config.json");
    expect(result).toMatchObject({ seed: 42, dataset: "mnist" });
  });

  it("returns empty object for an empty file", () => {
    expect(parseConfigContent("", "config.yaml")).toEqual({});
    expect(parseConfigContent("   ", "config.json")).toEqual({});
  });

  it("returns empty object for invalid YAML (non-crash)", () => {
    const broken = "key: [unclosed";
    const result = parseConfigContent(broken, "config.yaml");
    expect(result).toEqual({});
  });

  it("returns empty object for invalid JSON (non-crash)", () => {
    const broken = "{not: valid json";
    const result = parseConfigContent(broken, "config.json");
    expect(result).toEqual({});
  });

  it("skips array values (not flattened)", () => {
    const yaml = `layers: [128, 64, 32]`;
    const result = parseConfigContent(yaml, "config.yaml");
    // Array values are intentionally skipped; no "layers" key.
    expect(result).not.toHaveProperty("layers");
  });
});

// ---------------------------------------------------------------------------
// parseConfigFile — metadata extraction
// ---------------------------------------------------------------------------

describe("parseConfigFile", () => {
  it("extracts seed", () => {
    const yaml = `seed: 42`;
    const meta = parseConfigFile(yaml, "config.yaml");
    expect(meta.randomSeeds).toEqual({ seed: 42 });
  });

  it("extracts multiple seed aliases", () => {
    const yaml = `numpy_seed: 1\ntorch_seed: 2`;
    const meta = parseConfigFile(yaml, "config.yaml");
    expect(meta.randomSeeds).toMatchObject({ numpy_seed: 1, torch_seed: 2 });
  });

  it("ignores non-finite seed values", () => {
    const json = JSON.stringify({ seed: "notanumber" });
    const meta = parseConfigFile(json, "config.json");
    // NaN → not finite → excluded.
    expect(meta.randomSeeds ?? {}).toEqual({});
  });

  it("extracts dataset identifiers", () => {
    const yaml = `dataset: cifar10`;
    const meta = parseConfigFile(yaml, "config.yaml");
    expect(meta.datasetIdentifiers).toEqual([{ name: "cifar10" }]);
  });

  it("extracts eval splits", () => {
    const yaml = `eval_split: test`;
    const meta = parseConfigFile(yaml, "config.yaml");
    expect(meta.evalSplits).toEqual([{ name: "test" }]);
  });

  it("extracts git revision from config key", () => {
    const yaml = `git_revision: abc123def`;
    const meta = parseConfigFile(yaml, "config.yaml");
    expect(meta.gitRevision).toBe("abc123def");
  });

  it("extracts nested git.revision", () => {
    const yaml = `git:\n  revision: deadbeef`;
    const meta = parseConfigFile(yaml, "config.yaml");
    expect(meta.gitRevision).toBe("deadbeef");
  });

  it("extracts git dirty flag as boolean", () => {
    const yaml = `git:\n  dirty: true`;
    const meta = parseConfigFile(yaml, "config.yaml");
    expect(meta.gitDirty).toBe(true);
  });

  it("extracts git dirty flag from string 'true'", () => {
    const json = JSON.stringify({ git_dirty: "true" });
    const meta = parseConfigFile(json, "config.json");
    expect(meta.gitDirty).toBe(true);
  });

  it("extracts framework", () => {
    const yaml = `framework: pytorch`;
    const meta = parseConfigFile(yaml, "config.yaml");
    expect(meta.framework).toBe("pytorch");
  });

  it("extracts timestamp", () => {
    const yaml = `timestamp: 2024-01-15T10:00:00Z`;
    const meta = parseConfigFile(yaml, "config.yaml");
    expect(meta.timestamp).toBe("2024-01-15T10:00:00Z");
  });

  it("returns empty partial for completely unrecognised keys", () => {
    const yaml = `model_arch: resnet50\nbatch_size: 32`;
    const meta = parseConfigFile(yaml, "config.yaml");
    // No recognised keys → no metadata fields populated.
    expect(meta.randomSeeds ?? {}).toEqual({});
    expect(meta.gitRevision).toBeUndefined();
    expect(meta.datasetIdentifiers ?? []).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// parseGitInfoJson
// ---------------------------------------------------------------------------

describe("parseGitInfoJson", () => {
  it("extracts revision key", () => {
    const json = JSON.stringify({ revision: "abc123" });
    expect(parseGitInfoJson(json)).toMatchObject({ gitRevision: "abc123" });
  });

  it("extracts commit key", () => {
    const json = JSON.stringify({ commit: "deadbeef" });
    expect(parseGitInfoJson(json)).toMatchObject({ gitRevision: "deadbeef" });
  });

  it("extracts sha key", () => {
    const json = JSON.stringify({ sha: "cafebabe" });
    expect(parseGitInfoJson(json)).toMatchObject({ gitRevision: "cafebabe" });
  });

  it("extracts dirty boolean", () => {
    const json = JSON.stringify({ revision: "abc", dirty: true });
    const result = parseGitInfoJson(json);
    expect(result.gitDirty).toBe(true);
  });

  it("extracts is_dirty boolean", () => {
    const json = JSON.stringify({ revision: "abc", is_dirty: false });
    const result = parseGitInfoJson(json);
    expect(result.gitDirty).toBe(false);
  });

  it("extracts dirty from string 'true'", () => {
    const json = JSON.stringify({ revision: "abc", dirty: "true" });
    const result = parseGitInfoJson(json);
    expect(result.gitDirty).toBe(true);
  });

  it("returns empty object for empty string", () => {
    expect(parseGitInfoJson("")).toEqual({});
  });

  it("returns empty object for invalid JSON (non-crash)", () => {
    expect(parseGitInfoJson("{broken")).toEqual({});
  });

  it("returns empty object for JSON null", () => {
    expect(parseGitInfoJson("null")).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// mergeMetadata
// ---------------------------------------------------------------------------

describe("mergeMetadata", () => {
  it("merges git revision from first source that has it", () => {
    const merged = mergeMetadata([
      { gitRevision: "abc" },
      { gitRevision: "def" }, // should be ignored
    ]);
    expect(merged.gitRevision).toBe("abc");
  });

  it("merges seeds from all sources", () => {
    const merged = mergeMetadata([
      { randomSeeds: { global: 42 } },
      { randomSeeds: { numpy: 7 } },
    ]);
    expect(merged.randomSeeds).toEqual({ global: 42, numpy: 7 });
  });

  it("deduplicates dataset identifiers by name", () => {
    const merged = mergeMetadata([
      { datasetIdentifiers: [{ name: "cifar10" }] },
      { datasetIdentifiers: [{ name: "cifar10" }, { name: "mnist" }] },
    ]);
    expect(merged.datasetIdentifiers).toHaveLength(2);
    expect(merged.datasetIdentifiers.map((d) => d.name)).toContain("cifar10");
    expect(merged.datasetIdentifiers.map((d) => d.name)).toContain("mnist");
  });

  it("produces a complete RunMetadata with empty arrays/objects when given no parts", () => {
    const merged = mergeMetadata([]);
    expect(merged.randomSeeds).toEqual({});
    expect(merged.datasetIdentifiers).toEqual([]);
    expect(merged.evalSplits).toEqual([]);
    expect(merged.dependencyVersions).toEqual({});
  });
});
