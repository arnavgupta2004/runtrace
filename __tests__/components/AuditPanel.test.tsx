/**
 * __tests__/components/AuditPanel.test.tsx
 *
 * Tests for components/audit/AuditPanel.tsx
 *
 * Covers:
 * - All five dimension labels are displayed
 * - Good / partial / poor overall score presentation
 * - Score semantics explanation text (rule-based, not guarantee)
 * - Confirmed / missing / problem status labels for each check
 * - Dirty git working tree warning (problem, not missing)
 * - Missing git revision (missing, not problem)
 * - Random seed of 0 shown as confirmed
 * - Unpinned dependency shown as problem
 * - Missing dataset and eval split identifiers
 * - Actual evidence paths from the audit engine
 * - Empty evidence with explicit message
 * - Multiple runs with independent audit results
 * - Run name displayed in panel header
 * - The auditor is NOT mocked — real auditRun is used
 */

import React, { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { AuditPanel } from "@/components/audit/AuditPanel";
import {
  makeRun,
  makeDatasetRef,
  makeEvalSplit,
} from "@/__tests__/helpers/factories";

// ---------------------------------------------------------------------------
// Run name in header
// ---------------------------------------------------------------------------

describe("AuditPanel — header", () => {
  it("shows the run name in the panel header", () => {
    const run = makeRun("my-experiment");
    render(<AuditPanel run={run} />);
    expect(screen.getByText("my-experiment")).toBeInTheDocument();
  });

  it("shows 'Reproducibility audit' label in the header", () => {
    const run = makeRun("run-1");
    render(<AuditPanel run={run} />);
    expect(screen.getByText(/Reproducibility audit/i)).toBeInTheDocument();
  });

  it("has accessible article landmark with run name", () => {
    const run = makeRun("baseline");
    render(<AuditPanel run={run} />);
    expect(
      screen.getByRole("article", { name: /baseline/i })
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// All five dimensions are present
// ---------------------------------------------------------------------------

describe("AuditPanel — all five dimensions", () => {
  it("displays all five dimension labels", () => {
    const run = makeRun("run-a");
    render(<AuditPanel run={run} />);
    expect(screen.getByText("Git Revision")).toBeInTheDocument();
    expect(screen.getByText("Random Seeds")).toBeInTheDocument();
    expect(screen.getByText("Dataset Identifiers")).toBeInTheDocument();
    expect(screen.getByText("Evaluation Splits")).toBeInTheDocument();
    expect(screen.getByText("Dependency Versions")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Overall score presentation
// ---------------------------------------------------------------------------

describe("AuditPanel — overall score — good", () => {
  it("shows 'Good' score for a fully-confirmed run", () => {
    const run = makeRun(
      "full-run",
      {},
      {
        gitRevision: "abc123",
        gitDirty: false,
        randomSeeds: { seed: 42 },
        datasetIdentifiers: [makeDatasetRef("cifar10")],
        evalSplits: [makeEvalSplit("test")],
        dependencyVersions: { numpy: "1.24.0" },
      },
      {
        gitSourceFiles: ["git_info.json"],
        configSourceFiles: ["config.yaml"],
        dependencySourceFiles: ["requirements.txt"],
      }
    );
    render(<AuditPanel run={run} />);
    expect(screen.getByText("Good")).toBeInTheDocument();
  });

  it("shows the 'good' score explanation that it is a rule-based summary", () => {
    const run = makeRun(
      "full-run",
      {},
      {
        gitRevision: "abc123",
        gitDirty: false,
        randomSeeds: { seed: 42 },
        datasetIdentifiers: [makeDatasetRef("cifar10")],
        evalSplits: [makeEvalSplit("test")],
        dependencyVersions: { numpy: "1.24.0" },
      }
    );
    render(<AuditPanel run={run} />);
    expect(screen.getByText(/rule-based summary/i)).toBeInTheDocument();
    expect(screen.queryByText(/probability/i)).not.toBeInTheDocument();
    // The explanation may include "not a guarantee" — we check it doesn't claim to be a guarantee
    expect(screen.queryByText(/^guarantee of reproducibility$/i)).not.toBeInTheDocument();
  });
});

describe("AuditPanel — overall score — partial", () => {
  it("shows 'Partial' score when some dimensions are missing", () => {
    // All-empty metadata → all missing → partial
    const run = makeRun("empty-run");
    render(<AuditPanel run={run} />);
    expect(screen.getByText("Partial")).toBeInTheDocument();
  });

  it("shows the 'partial' score explanation", () => {
    const run = makeRun("empty-run");
    render(<AuditPanel run={run} />);
    expect(screen.getByText(/missing evidence/i)).toBeInTheDocument();
  });
});

describe("AuditPanel — overall score — poor", () => {
  it("shows 'Poor' score when git tree is dirty", () => {
    const run = makeRun(
      "dirty-run",
      {},
      {
        gitRevision: "abc123",
        gitDirty: true,
        randomSeeds: { seed: 42 },
        datasetIdentifiers: [makeDatasetRef("cifar10")],
        evalSplits: [makeEvalSplit("test")],
        dependencyVersions: { numpy: "1.24.0" },
      }
    );
    render(<AuditPanel run={run} />);
    expect(screen.getByText("Poor")).toBeInTheDocument();
  });

  it("shows 'Poor' score when dependency is unpinned", () => {
    const run = makeRun(
      "unpinned-run",
      {},
      {
        gitRevision: "abc123",
        gitDirty: false,
        randomSeeds: { seed: 42 },
        datasetIdentifiers: [makeDatasetRef("mnist")],
        evalSplits: [makeEvalSplit("test")],
        dependencyVersions: { torch: "" }, // unpinned
      }
    );
    render(<AuditPanel run={run} />);
    expect(screen.getByText("Poor")).toBeInTheDocument();
  });

  it("shows the 'poor' score explanation about reproducibility risk", () => {
    const run = makeRun("dirty-run", {}, { gitRevision: "abc", gitDirty: true });
    render(<AuditPanel run={run} />);
    // Multiple elements may match (panel description + check message); check at least one exists
    const matches = screen.getAllByText(/reproducibility risk/i);
    expect(matches.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Status labels for individual checks
// ---------------------------------------------------------------------------

describe("AuditPanel — individual check statuses", () => {
  it("shows 'Confirmed' badge for a confirmed git revision", () => {
    const run = makeRun(
      "run",
      {},
      { gitRevision: "abc123", gitDirty: false },
      { gitSourceFiles: ["git_info.json"] }
    );
    render(<AuditPanel run={run} />);
    // Multiple "Confirmed" badges may appear for multiple confirmed checks
    const badges = screen.getAllByText("Confirmed");
    expect(badges.length).toBeGreaterThan(0);
  });

  it("shows 'Missing' badge for empty metadata", () => {
    const run = makeRun("run");
    render(<AuditPanel run={run} />);
    const badges = screen.getAllByText("Missing");
    // All 5 dimensions should be missing
    expect(badges.length).toBe(5);
  });

  it("shows 'Problem' badge for dirty git tree", () => {
    const run = makeRun("run", {}, { gitRevision: "abc", gitDirty: true });
    render(<AuditPanel run={run} />);
    expect(screen.getByText("Problem")).toBeInTheDocument();
  });

  it("shows 'Problem' badge for unpinned dependency", () => {
    const run = makeRun("run", {}, { dependencyVersions: { torch: "" } });
    render(<AuditPanel run={run} />);
    expect(screen.getByText("Problem")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Dirty git tree warning semantics
// ---------------------------------------------------------------------------

describe("AuditPanel — dirty git tree distinction", () => {
  it("shows Problem (not Missing) for dirty git", () => {
    const run = makeRun("run", {}, { gitRevision: "abc", gitDirty: true });
    render(<AuditPanel run={run} />);
    expect(screen.getByText("Problem")).toBeInTheDocument();
    // Git Revision check should be Problem, not Missing
    const gitSection = screen.getByText("Git Revision").closest("div");
    expect(gitSection).toBeDefined();
    expect(within(gitSection!).getByText("Problem")).toBeInTheDocument();
    expect(within(gitSection!).queryByText("Missing")).not.toBeInTheDocument();
  });

  it("shows Missing (not Problem) for absent git revision", () => {
    const run = makeRun("run");
    render(<AuditPanel run={run} />);
    const gitSection = screen.getByText("Git Revision").closest("div");
    expect(gitSection).toBeDefined();
    expect(within(gitSection!).getByText("Missing")).toBeInTheDocument();
    expect(within(gitSection!).queryByText("Problem")).not.toBeInTheDocument();
  });

  it("shows the uncommitted modifications message for dirty git", () => {
    const run = makeRun("run", {}, { gitRevision: "abc123", gitDirty: true });
    render(<AuditPanel run={run} />);
    expect(screen.getByText(/uncommitted modifications/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Random seed of 0 — confirmed, not missing
// ---------------------------------------------------------------------------

describe("AuditPanel — random seed of 0", () => {
  it("shows confirmed status when seed is 0", () => {
    const run = makeRun("run", {}, { randomSeeds: { seed: 0 } });
    render(<AuditPanel run={run} />);
    // Random Seeds row should show Confirmed
    const seedSection = screen.getByText("Random Seeds").closest("div");
    expect(seedSection).toBeDefined();
    expect(within(seedSection!).getByText("Confirmed")).toBeInTheDocument();
  });

  it("shows seed=0 in the message", () => {
    const run = makeRun("run", {}, { randomSeeds: { seed: 0 } });
    render(<AuditPanel run={run} />);
    expect(screen.getByText(/seed=0/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Unpinned dependency — problem, not missing-deps
// ---------------------------------------------------------------------------

describe("AuditPanel — unpinned dependency", () => {
  it("shows Problem status for unpinned dep, not Missing", () => {
    const run = makeRun(
      "run",
      {},
      { dependencyVersions: { numpy: "1.24.0", torch: "" } },
      { dependencySourceFiles: ["requirements.txt"] }
    );
    render(<AuditPanel run={run} />);
    const depSection = screen.getByText("Dependency Versions").closest("div");
    expect(depSection).toBeDefined();
    expect(within(depSection!).getByText("Problem")).toBeInTheDocument();
    expect(within(depSection!).queryByText("Missing")).not.toBeInTheDocument();
  });

  it("message identifies the unpinned package name", () => {
    const run = makeRun("run", {}, { dependencyVersions: { torch: "" } });
    render(<AuditPanel run={run} />);
    expect(screen.getByText(/torch/)).toBeInTheDocument();
  });

  it("message says no version has been fabricated", () => {
    const run = makeRun("run", {}, { dependencyVersions: { torch: "" } });
    render(<AuditPanel run={run} />);
    expect(screen.getByText(/no version has been fabricated/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Missing dataset and eval split identifiers
// ---------------------------------------------------------------------------

describe("AuditPanel — missing dataset identifiers and eval splits", () => {
  it("shows Missing for absent dataset identifiers", () => {
    const run = makeRun("run");
    render(<AuditPanel run={run} />);
    const datasetSection = screen.getByText("Dataset Identifiers").closest("div");
    expect(datasetSection).toBeDefined();
    expect(within(datasetSection!).getByText("Missing")).toBeInTheDocument();
  });

  it("shows Missing for absent eval splits", () => {
    const run = makeRun("run");
    render(<AuditPanel run={run} />);
    const splitSection = screen.getByText("Evaluation Splits").closest("div");
    expect(splitSection).toBeDefined();
    expect(within(splitSection!).getByText("Missing")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Evidence paths
// ---------------------------------------------------------------------------

describe("AuditPanel — evidence paths", () => {
  it("shows actual evidence filenames after expanding", async () => {
    const run = makeRun(
      "run",
      {},
      { gitRevision: "abc123", gitDirty: false },
      {
        gitSourceFiles: ["git_info.json"],
        configSourceFiles: ["config.yaml"],
      }
    );
    render(<AuditPanel run={run} />);

    // Expand the git revision evidence
    await userEvent.click(
      screen.getByRole("button", { name: /Show evidence for Git Revision/i })
    );

    // The actual filenames should be visible
    expect(screen.getByText("git_info.json")).toBeInTheDocument();
  });

  it("shows empty evidence message for missing status", () => {
    const run = makeRun("run");
    render(<AuditPanel run={run} />);
    // All dimensions are missing with empty evidence
    const noEvidenceMessages = screen.getAllByText(/No evidence files were found for this dimension/i);
    expect(noEvidenceMessages.length).toBe(5);
  });

  it("dependency source file appears in evidence after expand", async () => {
    const run = makeRun(
      "run",
      {},
      { dependencyVersions: { numpy: "1.24.0" } },
      { dependencySourceFiles: ["requirements.txt"] }
    );
    render(<AuditPanel run={run} />);

    await userEvent.click(
      screen.getByRole("button", { name: /Show evidence for Dependency Versions/i })
    );
    expect(screen.getByText("requirements.txt")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Multiple runs with independent audit results
// ---------------------------------------------------------------------------

describe("AuditPanel — multiple runs independence", () => {
  it("two panels show independent audit results", () => {
    const runA = makeRun("run-A", {}, { gitRevision: "abc", gitDirty: false });
    const runB = makeRun("run-B"); // all missing

    const { container } = render(
      <>
        <AuditPanel run={runA} />
        <AuditPanel run={runB} />
      </>
    );

    // run-A should have at least one Confirmed badge (git revision)
    const panels = container.querySelectorAll("article");
    expect(panels).toHaveLength(2);

    const panelA = panels[0];
    const panelB = panels[1];

    // Panel A has a confirmed git check
    expect(within(panelA as HTMLElement).getByText("run-A")).toBeInTheDocument();
    expect(within(panelB as HTMLElement).getByText("run-B")).toBeInTheDocument();

    // Panel A has at least one Confirmed badge
    const confirmedInA = within(panelA as HTMLElement).getAllByText("Confirmed");
    expect(confirmedInA.length).toBeGreaterThan(0);

    // Panel B has all Missing (5 missing)
    const missingInB = within(panelB as HTMLElement).getAllByText("Missing");
    expect(missingInB.length).toBe(5);
  });

  it("each run's evidence is shown in its own panel", async () => {
    const runA = makeRun(
      "run-A",
      {},
      { dependencyVersions: { numpy: "1.24.0" } },
      { dependencySourceFiles: ["requirements-A.txt"] }
    );
    const runB = makeRun(
      "run-B",
      {},
      { dependencyVersions: { torch: "2.0.0" } },
      { dependencySourceFiles: ["environment-B.yml"] }
    );

    render(
      <>
        <AuditPanel run={runA} />
        <AuditPanel run={runB} />
      </>
    );

    // Expand evidence in both panels
    const showButtons = screen.getAllByRole("button", { name: /Show evidence for Dependency Versions/i });
    expect(showButtons).toHaveLength(2);

    await userEvent.click(showButtons[0]);
    await userEvent.click(showButtons[1]);

    expect(screen.getByText("requirements-A.txt")).toBeInTheDocument();
    expect(screen.getByText("environment-B.yml")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Score description is a rule-based label, not a probability
// ---------------------------------------------------------------------------

describe("AuditPanel — score description semantics", () => {
  it("does not use 'probability' language for good score", () => {
    const run = makeRun(
      "run",
      {},
      {
        gitRevision: "abc",
        gitDirty: false,
        randomSeeds: { seed: 42 },
        datasetIdentifiers: [makeDatasetRef("d")],
        evalSplits: [makeEvalSplit("test")],
        dependencyVersions: { numpy: "1.0.0" },
      }
    );
    render(<AuditPanel run={run} />);
    expect(screen.queryByText(/probability/i)).not.toBeInTheDocument();
  });

  it("does not use 'confidence score' language for partial score", () => {
    const run = makeRun("run");
    render(<AuditPanel run={run} />);
    expect(screen.queryByText(/confidence score/i)).not.toBeInTheDocument();
  });

  it("explains poor score as a risk, not a certainty of failure", () => {
    const run = makeRun("run", {}, { gitRevision: "abc", gitDirty: true });
    render(<AuditPanel run={run} />);
    // Multiple elements may match — panel description and/or check message
    const matches = screen.getAllByText(/reproducibility risk/i);
    expect(matches.length).toBeGreaterThan(0);
  });
});
