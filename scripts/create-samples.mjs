#!/usr/bin/env node
/**
 * scripts/create-samples.mjs
 *
 * Generates three synthetic demonstration ZIP archives in public/samples/.
 * These fixtures are NOT real research data — they are synthetic examples
 * designed to exercise the RunTrace parser, comparator, auditor, and exporters.
 *
 * Run with:  node scripts/create-samples.mjs
 *
 * Requires: jszip (already a project dependency)
 */

import JSZip from "jszip";
import { writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const samplesDir = resolve(__dirname, "../public/samples");
mkdirSync(samplesDir, { recursive: true });

// ---------------------------------------------------------------------------
// Helper: write a ZIP to disk
// ---------------------------------------------------------------------------
async function writeZip(zip, filename) {
  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const dest = resolve(samplesDir, filename);
  writeFileSync(dest, buf);
  console.log(`Created: ${dest} (${(buf.length / 1024).toFixed(1)} KB)`);
}

// ---------------------------------------------------------------------------
// Sample A — Baseline experiment
//
// A well-documented baseline run.  All five reproducibility dimensions have
// evidence.  Two metrics (accuracy, loss) and one eval split.
// ---------------------------------------------------------------------------
async function createBaseline() {
  const zip = new JSZip();

  // metrics.json — flat object with final metric values
  zip.file("metrics.json", JSON.stringify({
    accuracy: 0.8412,
    loss: 0.4831,
    val_accuracy: 0.8218,
    val_loss: 0.5104
  }, null, 2));

  // config.yaml — experiment parameters including dataset and seed
  zip.file("config.yaml", [
    "# Synthetic demonstration fixture — NOT real research data",
    "seed: 42",
    "dataset: synthetic-imagenet-subset",
    "dataset_version: v1.0",
    "eval_split: test",
    "learning_rate: 0.001",
    "batch_size: 32",
    "epochs: 10",
    "model: resnet18",
    "framework: pytorch",
  ].join("\n"));

  // requirements.txt — pinned dependencies
  zip.file("requirements.txt", [
    "torch==2.1.0",
    "torchvision==0.16.0",
    "numpy==1.24.3",
    "scikit-learn==1.3.0",
    "pandas==2.0.3",
  ].join("\n"));

  // git_info.json — clean git revision
  zip.file("git_info.json", JSON.stringify({
    revision: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
    dirty: false
  }, null, 2));

  await writeZip(zip, "baseline-experiment.zip");
}

// ---------------------------------------------------------------------------
// Sample B — Improved experiment
//
// A follow-up run with the same dataset and eval split but different seed
// and improved metric values.  Compatible with the baseline for comparison.
// ---------------------------------------------------------------------------
async function createImproved() {
  const zip = new JSZip();

  zip.file("metrics.json", JSON.stringify({
    accuracy: 0.9037,
    loss: 0.3102,
    val_accuracy: 0.8891,
    val_loss: 0.3845
  }, null, 2));

  zip.file("config.yaml", [
    "# Synthetic demonstration fixture — NOT real research data",
    "seed: 99",
    "dataset: synthetic-imagenet-subset",
    "dataset_version: v1.0",
    "eval_split: test",
    "learning_rate: 0.0005",
    "batch_size: 64",
    "epochs: 20",
    "model: resnet34",
    "framework: pytorch",
  ].join("\n"));

  zip.file("requirements.txt", [
    "torch==2.1.0",
    "torchvision==0.16.0",
    "numpy==1.24.3",
    "scikit-learn==1.3.0",
    "pandas==2.0.3",
  ].join("\n"));

  zip.file("git_info.json", JSON.stringify({
    revision: "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3",
    dirty: false
  }, null, 2));

  await writeZip(zip, "improved-experiment.zip");
}

// ---------------------------------------------------------------------------
// Sample C — Reproducibility warning
//
// A run that uses a DIFFERENT dataset and evaluation split, plus a dirty git
// working tree.  This will trigger:
//   - A "mismatch" compatibility warning in the comparator
//   - A "poor" audit score (dirty git)
//
// Clearly labelled as a synthetic fixture.
// ---------------------------------------------------------------------------
async function createWarning() {
  const zip = new JSZip();

  zip.file("metrics.json", JSON.stringify({
    accuracy: 0.7654,
    loss: 0.6201,
    val_accuracy: 0.7512,
    val_loss: 0.6589
  }, null, 2));

  // Different dataset + different eval split → triggers mismatch
  zip.file("config.yaml", [
    "# Synthetic demonstration fixture — NOT real research data",
    "# This run uses a different dataset/split to demonstrate the compatibility warning.",
    "seed: 7",
    "dataset: cifar10-demo",
    "dataset_version: v2.0",
    "eval_split: validation",
    "learning_rate: 0.01",
    "batch_size: 128",
    "epochs: 5",
    "model: mobilenetv2",
    "framework: pytorch",
  ].join("\n"));

  zip.file("requirements.txt", [
    "torch==2.0.1",
    "torchvision==0.15.2",
    "numpy==1.23.5",
    "scikit-learn==1.2.2",
  ].join("\n"));

  // dirty: true → triggers "problem" in git_revision audit check
  zip.file("git_info.json", JSON.stringify({
    revision: "c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
    dirty: true
  }, null, 2));

  await writeZip(zip, "reproducibility-warning.zip");
}

// ---------------------------------------------------------------------------
// Run all
// ---------------------------------------------------------------------------
(async () => {
  console.log("Creating synthetic demonstration sample archives…");
  console.log("NOTE: These are NOT real research data.\n");
  await createBaseline();
  await createImproved();
  await createWarning();
  console.log("\nDone. Sample archives written to public/samples/");
  console.log("Expected behaviour when loaded in RunTrace:");
  console.log("  - baseline-experiment + improved-experiment → compatible, improved has higher accuracy");
  console.log("  - reproducibility-warning → mismatch warning (different dataset/split) + poor audit score (dirty git)");
})();
