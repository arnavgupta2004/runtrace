/**
 * __tests__/auditor/index.test.ts
 *
 * Tests for lib/auditor/index.ts and all five check modules.
 */

import { describe, it, expect } from "vitest";
import { auditRun, aggregateScore } from "@/lib/auditor/index";
import { checkGitRevision } from "@/lib/auditor/checks/gitRevision";
import { checkRandomSeeds } from "@/lib/auditor/checks/randomSeeds";
import { checkDatasetIdentifiers } from "@/lib/auditor/checks/datasetIdentifiers";
import { checkEvalSplits } from "@/lib/auditor/checks/evalSplits";
import { checkDependencyVersions } from "@/lib/auditor/checks/dependencyVersions";
import { makeRun, makeMetadata, makeArtifacts, makeDatasetRef, makeEvalSplit } from "../helpers/factories";

// ---------------------------------------------------------------------------
// Git revision checks
// ---------------------------------------------------------------------------

describe("checkGitRevision", () => {
  it("confirmed when revision present and not dirty", () => {
    const run = makeRun("a", {}, { gitRevision: "abc123", gitDirty: false }, { gitSourceFiles: ["git_info.json"] });
    const check = checkGitRevision(run);
    expect(check.status).toBe("confirmed");
    expect(check.dimension).toBe("git_revision");
    expect(check.evidence).toContain("git_info.json");
    expect(check.message).toMatch(/abc123/);
  });

  it("confirmed when revision present and gitDirty is absent (not contradicted)", () => {
    const run = makeRun("a", {}, { gitRevision: "deadbeef" }, { gitSourceFiles: ["git_info.json"] });
    const check = checkGitRevision(run);
    expect(check.status).toBe("confirmed");
  });

  it("problem when revision present but gitDirty is true", () => {
    const run = makeRun(
      "a",
      {},
      { gitRevision: "abc123", gitDirty: true },
      { gitSourceFiles: ["git_info.json"] }
    );
    const check = checkGitRevision(run);
    expect(check.status).toBe("problem");
    expect(check.message).toMatch(/uncommitted/i);
    expect(check.message).toMatch(/may not fully describe/i);
    // Message must NOT claim reproduction is impossible.
    expect(check.message).not.toMatch(/impossible/i);
  });

  it("problem message includes the revision hash", () => {
    const run = makeRun("a", {}, { gitRevision: "cafebabe", gitDirty: true });
    const check = checkGitRevision(run);
    expect(check.message).toMatch(/cafebabe/);
  });

  it("missing when no gitRevision", () => {
    const run = makeRun("a", {});
    const check = checkGitRevision(run);
    expect(check.status).toBe("missing");
    expect(check.evidence).toHaveLength(0);
  });

  it("missing when gitRevision absent even if gitDirty is true", () => {
    // gitDirty without a revision is irrelevant — still missing.
    const run = makeRun("a", {}, { gitDirty: true });
    const check = checkGitRevision(run);
    expect(check.status).toBe("missing");
  });

  it("evidence is drawn from gitSourceFiles and configSourceFiles", () => {
    const run = makeRun(
      "a",
      {},
      { gitRevision: "abc" },
      { gitSourceFiles: ["git_info.json"], configSourceFiles: ["config.yaml"] }
    );
    const check = checkGitRevision(run);
    expect(check.evidence).toContain("git_info.json");
    expect(check.evidence).toContain("config.yaml");
  });
});

// ---------------------------------------------------------------------------
// Random seed checks
// ---------------------------------------------------------------------------

describe("checkRandomSeeds", () => {
  it("confirmed when seeds are present", () => {
    const run = makeRun(
      "a",
      {},
      { randomSeeds: { global: 42 } },
      { configSourceFiles: ["config.yaml"] }
    );
    const check = checkRandomSeeds(run);
    expect(check.status).toBe("confirmed");
    expect(check.message).toMatch(/global=42/);
    expect(check.evidence).toContain("config.yaml");
  });

  it("seed value of 0 is treated as confirmed, not missing", () => {
    const run = makeRun(
      "a",
      {},
      { randomSeeds: { seed: 0 } },
      { configSourceFiles: ["params.yaml"] }
    );
    const check = checkRandomSeeds(run);
    expect(check.status).toBe("confirmed");
    expect(check.message).toMatch(/seed=0/);
  });

  it("missing when randomSeeds is empty", () => {
    const run = makeRun("a", {}, { randomSeeds: {} });
    const check = checkRandomSeeds(run);
    expect(check.status).toBe("missing");
    expect(check.evidence).toHaveLength(0);
  });

  it("multiple seeds are all listed in the message", () => {
    const run = makeRun("a", {}, { randomSeeds: { numpy: 1, torch: 2 } });
    const check = checkRandomSeeds(run);
    expect(check.message).toMatch(/numpy=1/);
    expect(check.message).toMatch(/torch=2/);
  });

  it("confirmed message includes caveat about stochastic control", () => {
    const run = makeRun("a", {}, { randomSeeds: { seed: 7 } });
    const check = checkRandomSeeds(run);
    expect(check.message).toMatch(/does not guarantee/i);
  });
});

// ---------------------------------------------------------------------------
// Dataset identifier checks
// ---------------------------------------------------------------------------

describe("checkDatasetIdentifiers", () => {
  it("confirmed when at least one dataset is recorded", () => {
    const run = makeRun(
      "a",
      {},
      { datasetIdentifiers: [makeDatasetRef("cifar10")] },
      { configSourceFiles: ["config.yaml"] }
    );
    const check = checkDatasetIdentifiers(run);
    expect(check.status).toBe("confirmed");
    expect(check.message).toMatch(/cifar10/);
    expect(check.evidence).toContain("config.yaml");
  });

  it("includes version in message when present", () => {
    const run = makeRun("a", {}, { datasetIdentifiers: [makeDatasetRef("cifar10", "1.0")] });
    const check = checkDatasetIdentifiers(run);
    expect(check.message).toMatch(/cifar10@1\.0/);
  });

  it("missing when no datasets recorded", () => {
    const run = makeRun("a", {});
    const check = checkDatasetIdentifiers(run);
    expect(check.status).toBe("missing");
    expect(check.evidence).toHaveLength(0);
  });

  it("confirmed message includes integrity caveat", () => {
    const run = makeRun("a", {}, { datasetIdentifiers: [makeDatasetRef("mnist")] });
    const check = checkDatasetIdentifiers(run);
    expect(check.message).toMatch(/does not verify/i);
  });
});

// ---------------------------------------------------------------------------
// Eval split checks
// ---------------------------------------------------------------------------

describe("checkEvalSplits", () => {
  it("confirmed when splits are recorded", () => {
    const run = makeRun(
      "a",
      {},
      { evalSplits: [makeEvalSplit("test", 10000)] },
      { configSourceFiles: ["params.yaml"] }
    );
    const check = checkEvalSplits(run);
    expect(check.status).toBe("confirmed");
    expect(check.message).toMatch(/test\(n=10000\)/);
    expect(check.evidence).toContain("params.yaml");
  });

  it("includes split name without size when size absent", () => {
    const run = makeRun("a", {}, { evalSplits: [makeEvalSplit("val")] });
    const check = checkEvalSplits(run);
    expect(check.message).toMatch(/val/);
    expect(check.message).not.toMatch(/n=/);
  });

  it("missing when no eval splits recorded", () => {
    const run = makeRun("a", {});
    const check = checkEvalSplits(run);
    expect(check.status).toBe("missing");
    expect(check.evidence).toHaveLength(0);
  });

  it("confirmed message includes cross-run caveat", () => {
    const run = makeRun("a", {}, { evalSplits: [makeEvalSplit("test")] });
    const check = checkEvalSplits(run);
    expect(check.message).toMatch(/does not verify/i);
  });
});

// ---------------------------------------------------------------------------
// Dependency version checks
// ---------------------------------------------------------------------------

describe("checkDependencyVersions", () => {
  it("confirmed when all deps are pinned", () => {
    const run = makeRun(
      "a",
      {},
      { dependencyVersions: { numpy: "1.24.0", torch: "2.0.1" } },
      { dependencySourceFiles: ["requirements.txt"] }
    );
    const check = checkDependencyVersions(run);
    expect(check.status).toBe("confirmed");
    expect(check.evidence).toContain("requirements.txt");
    expect(check.message).toMatch(/2 dependency/i);
  });

  it("problem when at least one dep is unpinned (empty version)", () => {
    const run = makeRun(
      "a",
      {},
      { dependencyVersions: { numpy: "1.24.0", torch: "" } },
      { dependencySourceFiles: ["requirements.txt"] }
    );
    const check = checkDependencyVersions(run);
    expect(check.status).toBe("problem");
    expect(check.message).toMatch(/torch/);
    expect(check.message).toMatch(/without an exact version pin/i);
  });

  it("problem message never fabricates a version", () => {
    const run = makeRun("a", {}, { dependencyVersions: { numpy: "" } });
    const check = checkDependencyVersions(run);
    expect(check.status).toBe("problem");
    // No version should appear after "numpy" in the message.
    expect(check.message).not.toMatch(/numpy==/);
    expect(check.message).not.toMatch(/numpy@/);
    expect(check.message).toMatch(/no version has been fabricated/i);
  });

  it("missing when no deps recorded", () => {
    const run = makeRun("a", {}, { dependencyVersions: {} });
    const check = checkDependencyVersions(run);
    expect(check.status).toBe("missing");
    expect(check.evidence).toHaveLength(0);
  });

  it("all-unpinned deps yields problem", () => {
    const run = makeRun("a", {}, { dependencyVersions: { numpy: "", scipy: "" } });
    const check = checkDependencyVersions(run);
    expect(check.status).toBe("problem");
    expect(check.message).toMatch(/no packages pinned/i);
  });

  it("problem message distinguishes pinned count from unpinned count", () => {
    const run = makeRun(
      "a",
      {},
      { dependencyVersions: { numpy: "1.24.0", torch: "2.0.1", scipy: "" } }
    );
    const check = checkDependencyVersions(run);
    expect(check.message).toMatch(/2 package\(s\) pinned/i);
  });
});

// ---------------------------------------------------------------------------
// Score aggregation
// ---------------------------------------------------------------------------

describe("aggregateScore", () => {
  it("good when all checks confirmed", () => {
    const checks = [
      { dimension: "git_revision" as const, status: "confirmed" as const, evidence: [], message: "" },
      { dimension: "random_seeds" as const, status: "confirmed" as const, evidence: [], message: "" },
      { dimension: "dataset_identifiers" as const, status: "confirmed" as const, evidence: [], message: "" },
      { dimension: "eval_splits" as const, status: "confirmed" as const, evidence: [], message: "" },
      { dimension: "dependency_versions" as const, status: "confirmed" as const, evidence: [], message: "" },
    ];
    expect(aggregateScore(checks)).toBe("good");
  });

  it("partial when some checks missing, none problem", () => {
    const checks = [
      { dimension: "git_revision" as const, status: "confirmed" as const, evidence: [], message: "" },
      { dimension: "random_seeds" as const, status: "missing" as const, evidence: [], message: "" },
      { dimension: "dataset_identifiers" as const, status: "missing" as const, evidence: [], message: "" },
      { dimension: "eval_splits" as const, status: "confirmed" as const, evidence: [], message: "" },
      { dimension: "dependency_versions" as const, status: "confirmed" as const, evidence: [], message: "" },
    ];
    expect(aggregateScore(checks)).toBe("partial");
  });

  it("poor when any check is problem", () => {
    const checks = [
      { dimension: "git_revision" as const, status: "problem" as const, evidence: [], message: "" },
      { dimension: "random_seeds" as const, status: "confirmed" as const, evidence: [], message: "" },
      { dimension: "dataset_identifiers" as const, status: "confirmed" as const, evidence: [], message: "" },
      { dimension: "eval_splits" as const, status: "confirmed" as const, evidence: [], message: "" },
      { dimension: "dependency_versions" as const, status: "confirmed" as const, evidence: [], message: "" },
    ];
    expect(aggregateScore(checks)).toBe("poor");
  });

  it("poor takes priority over missing", () => {
    const checks = [
      { dimension: "git_revision" as const, status: "problem" as const, evidence: [], message: "" },
      { dimension: "random_seeds" as const, status: "missing" as const, evidence: [], message: "" },
      { dimension: "dataset_identifiers" as const, status: "missing" as const, evidence: [], message: "" },
      { dimension: "eval_splits" as const, status: "missing" as const, evidence: [], message: "" },
      { dimension: "dependency_versions" as const, status: "missing" as const, evidence: [], message: "" },
    ];
    expect(aggregateScore(checks)).toBe("poor");
  });
});

// ---------------------------------------------------------------------------
// Full auditRun integration
// ---------------------------------------------------------------------------

describe("auditRun", () => {
  it("returns one check per dimension", () => {
    const run = makeRun("a");
    const report = auditRun(run);
    const dimensions = report.checks.map((c) => c.dimension);
    expect(dimensions).toContain("git_revision");
    expect(dimensions).toContain("random_seeds");
    expect(dimensions).toContain("dataset_identifiers");
    expect(dimensions).toContain("eval_splits");
    expect(dimensions).toContain("dependency_versions");
    expect(report.checks).toHaveLength(5);
  });

  it("runId matches the run's id", () => {
    const run = makeRun("experiment-42");
    const report = auditRun(run);
    expect(report.runId).toBe("experiment-42");
  });

  it("all-empty metadata yields partial (all missing, no problem)", () => {
    const run = makeRun("a");
    const report = auditRun(run);
    expect(report.overallScore).toBe("partial");
  });

  it("dirty git yields poor overall score", () => {
    const run = makeRun("a", {}, {
      gitRevision: "abc",
      gitDirty: true,
      randomSeeds: { seed: 42 },
      datasetIdentifiers: [makeDatasetRef("cifar10")],
      evalSplits: [makeEvalSplit("test")],
      dependencyVersions: { numpy: "1.24.0" },
    });
    const report = auditRun(run);
    expect(report.overallScore).toBe("poor");
  });

  it("full evidence yields good overall score", () => {
    const run = makeRun(
      "a",
      {},
      {
        gitRevision: "abc123",
        gitDirty: false,
        randomSeeds: { seed: 42 },
        datasetIdentifiers: [makeDatasetRef("cifar10")],
        evalSplits: [makeEvalSplit("test")],
        dependencyVersions: { numpy: "1.24.0", torch: "2.0.1" },
      },
      {
        gitSourceFiles: ["git_info.json"],
        configSourceFiles: ["config.yaml"],
        dependencySourceFiles: ["requirements.txt"],
      }
    );
    const report = auditRun(run);
    expect(report.overallScore).toBe("good");
  });

  it("unpinned dependency yields poor overall score", () => {
    const run = makeRun("a", {}, {
      gitRevision: "abc",
      gitDirty: false,
      randomSeeds: { seed: 1 },
      datasetIdentifiers: [makeDatasetRef("mnist")],
      evalSplits: [makeEvalSplit("test")],
      dependencyVersions: { numpy: "" }, // unpinned
    });
    const report = auditRun(run);
    expect(report.overallScore).toBe("poor");
  });

  it("evidence paths in checks come from artifacts, not fabricated", () => {
    const run = makeRun(
      "a",
      {},
      { gitRevision: "abc", randomSeeds: { seed: 42 } },
      {
        gitSourceFiles: ["git_info.json"],
        configSourceFiles: ["config.yaml"],
      }
    );
    const report = auditRun(run);
    const gitCheck = report.checks.find((c) => c.dimension === "git_revision")!;
    expect(gitCheck.evidence).toContain("git_info.json");
    // Evidence must not include invented filenames.
    expect(gitCheck.evidence).not.toContain("nonexistent.json");
  });

  it("a configuration file existing does not auto-confirm all dimensions", () => {
    // Config file present in artifacts but no metadata extracted from it.
    const run = makeRun("a", {}, {}, { configSourceFiles: ["config.yaml"] });
    const report = auditRun(run);
    // Git revision is still missing despite configSourceFiles being populated.
    const gitCheck = report.checks.find((c) => c.dimension === "git_revision")!;
    expect(gitCheck.status).toBe("missing");
    // Seeds are still missing.
    const seedCheck = report.checks.find((c) => c.dimension === "random_seeds")!;
    expect(seedCheck.status).toBe("missing");
  });
});
