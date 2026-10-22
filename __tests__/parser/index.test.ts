/**
 * __tests__/parser/index.test.ts
 *
 * Integration tests for lib/parser/index.ts (parseZip).
 *
 * All ZIP fixtures are constructed in-memory using JSZip — no file I/O.
 * Each test builds a ZIP, converts it to a browser-compatible File object,
 * then calls parseZip.
 */

import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { parseZip, DEFAULT_LIMITS, type ParseLimits } from "@/lib/parser/index";

// ---------------------------------------------------------------------------
// Helper: build a File from a JSZip instance
// ---------------------------------------------------------------------------
async function buildZipFile(
  zip: JSZip,
  filename = "test-run.zip"
): Promise<File> {
  const blob = await zip.generateAsync({ type: "blob" });
  return new File([blob], filename, { type: "application/zip" });
}

// ---------------------------------------------------------------------------
// Happy-path: metrics
// ---------------------------------------------------------------------------

describe("parseZip — metrics", () => {
  it("parses metrics.csv (wide-row layout)", async () => {
    const zip = new JSZip();
    zip.file("metrics.csv", "accuracy,loss\n0.92,0.08");
    const file = await buildZipFile(zip);
    const result = await parseZip(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.run.metrics).toEqual({ accuracy: 0.92, loss: 0.08 });
    expect(result.run.artifacts.metricsSourceFiles).toContain("metrics.csv");
  });

  it("parses metrics.json (flat object)", async () => {
    const zip = new JSZip();
    zip.file("metrics.json", JSON.stringify({ accuracy: 0.92, f1: 0.90 }));
    const file = await buildZipFile(zip);
    const result = await parseZip(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.run.metrics).toEqual({ accuracy: 0.92, f1: 0.90 });
  });

  it("parses metrics.json with nested metrics key", async () => {
    const zip = new JSZip();
    zip.file("metrics.json", JSON.stringify({ metrics: { accuracy: 0.88 }, epoch: 10 }));
    const file = await buildZipFile(zip);
    const result = await parseZip(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.run.metrics).toEqual({ accuracy: 0.88 });
  });

  it("parses results.json", async () => {
    const zip = new JSZip();
    zip.file("results.json", JSON.stringify({ accuracy: 0.91 }));
    const file = await buildZipFile(zip);
    const result = await parseZip(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.run.metrics).toEqual({ accuracy: 0.91 });
  });

  it("prefers metrics.csv over metrics.json when both present", async () => {
    const zip = new JSZip();
    zip.file("metrics.csv", "accuracy\n0.95");
    zip.file("metrics.json", JSON.stringify({ accuracy: 0.80 }));
    const file = await buildZipFile(zip);
    const result = await parseZip(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.run.metrics["accuracy"]).toBe(0.95);
    expect(result.warnings.some((w) => w.includes("metrics.json"))).toBe(false);
  });

  it("excludes non-finite metric values (NaN becomes null in JSON)", async () => {
    const zip = new JSZip();
    // JSON.stringify(NaN) → "null"
    zip.file("metrics.json", `{"accuracy": null, "loss": 0.08}`);
    const file = await buildZipFile(zip);
    const result = await parseZip(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.run.metrics).not.toHaveProperty("accuracy");
    expect(result.run.metrics).toHaveProperty("loss", 0.08);
  });

  it("warns when no metrics file is found", async () => {
    const zip = new JSZip();
    zip.file("model.pt", "binary");
    const file = await buildZipFile(zip);
    const result = await parseZip(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.run.metrics).toEqual({});
    expect(result.warnings.some((w) => /no metrics/i.test(w))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Happy-path: config / metadata
// ---------------------------------------------------------------------------

describe("parseZip — config and metadata", () => {
  it("extracts seed from config.yaml", async () => {
    const zip = new JSZip();
    zip.file("metrics.csv", "accuracy\n0.9");
    zip.file("config.yaml", "seed: 42\ndataset: cifar10");
    const file = await buildZipFile(zip);
    const result = await parseZip(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.run.metadata.randomSeeds).toMatchObject({ seed: 42 });
    expect(result.run.artifacts.configSourceFiles.length).toBeGreaterThan(0);
  });

  it("extracts git revision from git_info.json", async () => {
    const zip = new JSZip();
    zip.file("metrics.json", JSON.stringify({ accuracy: 0.9 }));
    zip.file("git_info.json", JSON.stringify({ revision: "abc123", dirty: false }));
    const file = await buildZipFile(zip);
    const result = await parseZip(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.run.metadata.gitRevision).toBe("abc123");
    expect(result.run.metadata.gitDirty).toBe(false);
    expect(result.run.artifacts.gitSourceFiles).toContain("git_info.json");
  });

  it("sets gitDirty=true when dirty flag is set in git_info.json", async () => {
    const zip = new JSZip();
    zip.file("metrics.json", JSON.stringify({ loss: 0.1 }));
    zip.file("git_info.json", JSON.stringify({ revision: "deadbeef", dirty: true }));
    const file = await buildZipFile(zip);
    const result = await parseZip(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.run.metadata.gitDirty).toBe(true);
  });

  it("extracts git revision from nested config key git.revision", async () => {
    const zip = new JSZip();
    zip.file("metrics.json", JSON.stringify({ accuracy: 0.9 }));
    zip.file("config.yaml", "git:\n  revision: cafebabe\n  dirty: false");
    const file = await buildZipFile(zip);
    const result = await parseZip(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.run.metadata.gitRevision).toBe("cafebabe");
  });

  it("extracts dataset identifiers and eval splits from params.yaml", async () => {
    const zip = new JSZip();
    zip.file("metrics.json", JSON.stringify({ accuracy: 0.9 }));
    zip.file("params.yaml", "dataset: imagenet\neval_split: val");
    const file = await buildZipFile(zip);
    const result = await parseZip(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.run.metadata.datasetIdentifiers).toContainEqual({ name: "imagenet" });
    expect(result.run.metadata.evalSplits).toContainEqual({ name: "val" });
  });
});

// ---------------------------------------------------------------------------
// Happy-path: dependencies
// ---------------------------------------------------------------------------

describe("parseZip — dependencies", () => {
  it("extracts pinned versions from requirements.txt", async () => {
    const zip = new JSZip();
    zip.file("metrics.json", JSON.stringify({ accuracy: 0.9 }));
    zip.file("requirements.txt", "numpy==1.24.0\ntorch==2.0.1");
    const file = await buildZipFile(zip);
    const result = await parseZip(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.run.metadata.dependencyVersions).toMatchObject({
      numpy: "1.24.0",
      torch: "2.0.1",
    });
    expect(result.run.artifacts.dependencySourceFiles).toContain("requirements.txt");
  });

  it("extracts dependencies from environment.yml", async () => {
    const yml = [
      "name: myenv",
      "dependencies:",
      "  - numpy=1.24.0",
      "  - pip:",
      "    - torch==2.0.1",
    ].join("\n");
    const zip = new JSZip();
    zip.file("metrics.json", JSON.stringify({ accuracy: 0.9 }));
    zip.file("environment.yml", yml);
    const file = await buildZipFile(zip);
    const result = await parseZip(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.run.metadata.dependencyVersions).toMatchObject({
      numpy: "1.24.0",
      torch: "2.0.1",
    });
  });

  it("prefers requirements.txt over environment.yml when both present", async () => {
    const zip = new JSZip();
    zip.file("metrics.json", JSON.stringify({ accuracy: 0.9 }));
    zip.file("requirements.txt", "numpy==1.24.0");
    zip.file("environment.yml", "name: myenv\ndependencies:\n  - numpy=9.99.0");
    const file = await buildZipFile(zip);
    const result = await parseZip(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.run.metadata.dependencyVersions["numpy"]).toBe("1.24.0");
  });
});

// ---------------------------------------------------------------------------
// Common enclosing directory stripping
// ---------------------------------------------------------------------------

describe("parseZip — common directory prefix", () => {
  it("strips a common top-level directory prefix", async () => {
    const zip = new JSZip();
    zip.file("my-experiment/metrics.csv", "accuracy\n0.92");
    zip.file("my-experiment/config.yaml", "seed: 7");
    zip.file("my-experiment/requirements.txt", "numpy==1.24.0");
    const file = await buildZipFile(zip);
    const result = await parseZip(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.run.metrics).toEqual({ accuracy: 0.92 });
    expect(result.run.metadata.randomSeeds).toMatchObject({ seed: 7 });
    expect(result.run.metadata.dependencyVersions["numpy"]).toBe("1.24.0");
  });
});

// ---------------------------------------------------------------------------
// Artifact index
// ---------------------------------------------------------------------------

describe("parseZip — artifact index", () => {
  it("records all files in rawFiles", async () => {
    const zip = new JSZip();
    zip.file("metrics.json", JSON.stringify({ accuracy: 0.9 }));
    zip.file("config.yaml", "seed: 42");
    zip.file("model.pt", "binary");
    const file = await buildZipFile(zip);
    const result = await parseZip(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.run.artifacts.rawFiles).toContain("metrics.json");
    expect(result.run.artifacts.rawFiles).toContain("config.yaml");
    expect(result.run.artifacts.rawFiles).toContain("model.pt");
  });
});

// ---------------------------------------------------------------------------
// MLflow single-run layout
// ---------------------------------------------------------------------------

describe("parseZip — MLflow single-run layout", () => {
  it("parses a single MLflow run", async () => {
    const zip = new JSZip();
    const runPath = "mlruns/1/abc123run";
    zip.file(`${runPath}/metrics/accuracy`, "1000000000 0.92 0\n1000000001 0.94 1");
    zip.file(`${runPath}/metrics/loss`, "1000000000 0.20 0\n1000000001 0.08 1");
    zip.file(`${runPath}/params/seed`, "42");
    zip.file(`${runPath}/params/dataset`, "imagenet");
    zip.file(`${runPath}/tags/mlflow.source.git.commit`, "abc123def456");
    zip.file(`${runPath}/meta.yaml`, "run_id: abc123run\nstatus: FINISHED");
    const file = await buildZipFile(zip);
    const result = await parseZip(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Last line of metric file should be used.
    expect(result.run.metrics["accuracy"]).toBe(0.94);
    expect(result.run.metrics["loss"]).toBe(0.08);
    expect(result.run.metadata.gitRevision).toBe("abc123def456");
  });

  it("uses the last valid measurement in an MLflow metric file", async () => {
    const zip = new JSZip();
    const runPath = "mlruns/0/run1";
    // Last line has the highest step.
    zip.file(`${runPath}/metrics/val_acc`, "100 0.80 0\n200 0.90 1\n300 0.95 2");
    zip.file(`${runPath}/meta.yaml`, "run_id: run1");
    const file = await buildZipFile(zip);
    const result = await parseZip(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.run.metrics["val_acc"]).toBe(0.95);
  });

  it("returns an error for ZIPs with multiple MLflow run IDs", async () => {
    const zip = new JSZip();
    zip.file("mlruns/0/run1/meta.yaml", "run_id: run1");
    zip.file("mlruns/0/run1/metrics/acc", "100 0.9 0");
    zip.file("mlruns/0/run2/meta.yaml", "run_id: run2");
    zip.file("mlruns/0/run2/metrics/acc", "100 0.8 0");
    const file = await buildZipFile(zip);
    const result = await parseZip(file);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/MLflow run ID/i);
  });
});

// ---------------------------------------------------------------------------
// Error handling and robustness
// ---------------------------------------------------------------------------

describe("parseZip — error handling", () => {
  it("returns an error for a non-ZIP file", async () => {
    const file = new File(["this is not a zip"], "notzip.zip", { type: "application/zip" });
    const result = await parseZip(file);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Could not open ZIP/i);
  });

  it("handles an empty archive (no files) without crashing", async () => {
    const zip = new JSZip();
    const file = await buildZipFile(zip);
    const result = await parseZip(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.run.metrics).toEqual({});
  });

  it("handles a ZIP with only unrecognised files", async () => {
    const zip = new JSZip();
    zip.file("model.bin", "binary data");
    zip.file("checkpoint.pth", "more binary");
    const file = await buildZipFile(zip);
    const result = await parseZip(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.run.metrics).toEqual({});
    expect(result.run.artifacts.rawFiles).toHaveLength(2);
  });

  it("handles a malformed metrics.json with a warning (falls through)", async () => {
    const zip = new JSZip();
    zip.file("metrics.json", "{not valid json");
    const file = await buildZipFile(zip);
    const result = await parseZip(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.run.metrics).toEqual({});
    expect(result.warnings.some((w) => /parse/i.test(w))).toBe(true);
  });

  it("handles a malformed config.yaml gracefully (no crash)", async () => {
    const zip = new JSZip();
    zip.file("metrics.json", JSON.stringify({ accuracy: 0.9 }));
    zip.file("config.yaml", "key: [unclosed");
    const file = await buildZipFile(zip);
    const result = await parseZip(file);
    // Parser should not crash; metadata will just be empty.
    expect(result.ok).toBe(true);
  });

  it("handles an empty metrics.json gracefully", async () => {
    const zip = new JSZip();
    zip.file("metrics.json", "");
    const file = await buildZipFile(zip);
    const result = await parseZip(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.run.metrics).toEqual({});
  });

  it("enforces maxEntries limit", async () => {
    const zip = new JSZip();
    for (let i = 0; i < 10; i++) {
      zip.file(`file${i}.txt`, "x");
    }
    const file = await buildZipFile(zip);
    const limits: ParseLimits = { ...DEFAULT_LIMITS, maxEntries: 5 };
    const result = await parseZip(file, undefined, limits);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/limit/i);
  });

  it("enforces maxCompressedBytes limit", async () => {
    const zip = new JSZip();
    zip.file("metrics.json", JSON.stringify({ accuracy: 0.9 }));
    const file = await buildZipFile(zip);
    const limits: ParseLimits = { ...DEFAULT_LIMITS, maxCompressedBytes: 1 };
    const result = await parseZip(file, undefined, limits);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/too large/i);
  });

  it("derives run ID from ZIP filename", async () => {
    const zip = new JSZip();
    zip.file("metrics.json", JSON.stringify({ accuracy: 0.9 }));
    const file = await buildZipFile(zip, "my-experiment-run.zip");
    const result = await parseZip(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.run.id).toBe("my-experiment-run");
    expect(result.run.name).toBe("my-experiment-run");
  });

  it("accepts a custom name override", async () => {
    const zip = new JSZip();
    zip.file("metrics.json", JSON.stringify({ accuracy: 0.9 }));
    const file = await buildZipFile(zip, "run.zip");
    const result = await parseZip(file, "Experiment Alpha");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.run.name).toBe("Experiment Alpha");
  });
});
