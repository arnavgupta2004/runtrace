/**
 * __tests__/components/AuditCheckRow.test.tsx
 *
 * Tests for components/audit/AuditCheckRow.tsx
 *
 * Covers:
 * - All five dimension labels
 * - confirmed / missing / problem status rendering with badge and label text
 * - Dirty-git warning in the message
 * - Seed value of 0 shown correctly
 * - Unpinned dependency described as problem (not absence)
 * - Missing dataset and eval splits
 * - Evidence expand/collapse
 * - Actual evidence paths shown (no fabricated filenames)
 * - Empty evidence with explicit message for missing status
 * - Long evidence strings
 * - Accessible button controls
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { AuditCheckRow } from "@/components/audit/AuditCheckRow";
import type { AuditCheck } from "@/lib/schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCheck(overrides: Partial<AuditCheck> & Pick<AuditCheck, "dimension" | "status">): AuditCheck {
  return {
    evidence: [],
    message: "Test message.",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Dimension label rendering
// ---------------------------------------------------------------------------

describe("AuditCheckRow — dimension labels", () => {
  it("shows 'Git Revision' for git_revision dimension", () => {
    render(<AuditCheckRow check={makeCheck({ dimension: "git_revision", status: "confirmed" })} />);
    expect(screen.getByText("Git Revision")).toBeInTheDocument();
  });

  it("shows 'Random Seeds' for random_seeds dimension", () => {
    render(<AuditCheckRow check={makeCheck({ dimension: "random_seeds", status: "confirmed" })} />);
    expect(screen.getByText("Random Seeds")).toBeInTheDocument();
  });

  it("shows 'Dataset Identifiers' for dataset_identifiers dimension", () => {
    render(<AuditCheckRow check={makeCheck({ dimension: "dataset_identifiers", status: "confirmed" })} />);
    expect(screen.getByText("Dataset Identifiers")).toBeInTheDocument();
  });

  it("shows 'Evaluation Splits' for eval_splits dimension", () => {
    render(<AuditCheckRow check={makeCheck({ dimension: "eval_splits", status: "confirmed" })} />);
    expect(screen.getByText("Evaluation Splits")).toBeInTheDocument();
  });

  it("shows 'Dependency Versions' for dependency_versions dimension", () => {
    render(<AuditCheckRow check={makeCheck({ dimension: "dependency_versions", status: "confirmed" })} />);
    expect(screen.getByText("Dependency Versions")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Status badge and labels
// ---------------------------------------------------------------------------

describe("AuditCheckRow — status labels", () => {
  it("shows 'Confirmed' badge text for confirmed status", () => {
    render(<AuditCheckRow check={makeCheck({ dimension: "git_revision", status: "confirmed" })} />);
    expect(screen.getByText("Confirmed")).toBeInTheDocument();
  });

  it("shows 'Missing' badge text for missing status", () => {
    render(<AuditCheckRow check={makeCheck({ dimension: "git_revision", status: "missing" })} />);
    expect(screen.getByText("Missing")).toBeInTheDocument();
  });

  it("shows 'Problem' badge text for problem status", () => {
    render(<AuditCheckRow check={makeCheck({ dimension: "git_revision", status: "problem" })} />);
    expect(screen.getByText("Problem")).toBeInTheDocument();
  });

  it("renders the human-readable message", () => {
    const msg = "Git revision abc123 recorded.";
    render(
      <AuditCheckRow
        check={makeCheck({ dimension: "git_revision", status: "confirmed", message: msg })}
      />
    );
    expect(screen.getByText(msg)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Dirty git warning
// ---------------------------------------------------------------------------

describe("AuditCheckRow — dirty git tree", () => {
  it("shows the dirty-git problem message", () => {
    render(
      <AuditCheckRow
        check={{
          dimension: "git_revision",
          status: "problem",
          evidence: ["git_info.json"],
          message:
            "Git revision recorded (abc123), but the working tree had uncommitted modifications. " +
            "The commit hash alone may not fully describe the code state at the time of this run. " +
            "This is an elevated reproducibility risk, not a confirmed reproduction failure.",
        }}
      />
    );
    expect(screen.getByText(/uncommitted modifications/i)).toBeInTheDocument();
    expect(screen.getByText(/may not fully describe/i)).toBeInTheDocument();
    expect(screen.getByText("Problem")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Random seed of 0
// ---------------------------------------------------------------------------

describe("AuditCheckRow — seed value of 0", () => {
  it("shows confirmed status and seed=0 in message", () => {
    render(
      <AuditCheckRow
        check={{
          dimension: "random_seeds",
          status: "confirmed",
          evidence: ["params.yaml"],
          message: "Random seed(s) recorded: seed=0. Note: this confirms seed values were captured.",
        }}
      />
    );
    expect(screen.getByText("Confirmed")).toBeInTheDocument();
    expect(screen.getByText(/seed=0/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Unpinned dependencies
// ---------------------------------------------------------------------------

describe("AuditCheckRow — unpinned dependencies", () => {
  it("shows problem status for unpinned dependency, not absence", () => {
    render(
      <AuditCheckRow
        check={{
          dimension: "dependency_versions",
          status: "problem",
          evidence: ["requirements.txt"],
          message:
            "1 dependency/ies recorded without an exact version pin: torch. " +
            "(1 package(s) pinned.) Unpinned or range-constrained dependencies may resolve " +
            "to different versions on reinstallation. " +
            "The exact version used during this run is unknown for these packages — no version has been fabricated.",
        }}
      />
    );
    expect(screen.getByText("Problem")).toBeInTheDocument();
    // Should mention the package name
    expect(screen.getByText(/torch/)).toBeInTheDocument();
    // Should not say "no dependency information was found" (that's the missing case)
    expect(screen.queryByText(/no dependency information was found/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Missing datasets and evaluation splits
// ---------------------------------------------------------------------------

describe("AuditCheckRow — missing datasets and splits", () => {
  it("shows missing status for absent dataset identifiers", () => {
    render(
      <AuditCheckRow
        check={{
          dimension: "dataset_identifiers",
          status: "missing",
          evidence: [],
          message: "No dataset identifiers were found in this archive.",
        }}
      />
    );
    expect(screen.getByText("Missing")).toBeInTheDocument();
    expect(screen.getByText(/No dataset identifiers were found/i)).toBeInTheDocument();
  });

  it("shows missing status for absent eval splits", () => {
    render(
      <AuditCheckRow
        check={{
          dimension: "eval_splits",
          status: "missing",
          evidence: [],
          message: "No evaluation split information was found in this archive.",
        }}
      />
    );
    expect(screen.getByText("Missing")).toBeInTheDocument();
    expect(screen.getByText(/No evaluation split information was found/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Missing git revision (distinct from dirty tree)
// ---------------------------------------------------------------------------

describe("AuditCheckRow — missing git revision", () => {
  it("shows missing status (not problem) for absent git revision", () => {
    render(
      <AuditCheckRow
        check={{
          dimension: "git_revision",
          status: "missing",
          evidence: [],
          message: "No Git revision was found in this archive.",
        }}
      />
    );
    expect(screen.getByText("Missing")).toBeInTheDocument();
    expect(screen.queryByText("Problem")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Evidence expand/collapse
// ---------------------------------------------------------------------------

describe("AuditCheckRow — evidence expand/collapse", () => {
  it("does not show evidence when collapsed initially", () => {
    render(
      <AuditCheckRow
        check={makeCheck({
          dimension: "git_revision",
          status: "confirmed",
          evidence: ["git_info.json"],
          message: "OK",
        })}
      />
    );
    expect(screen.queryByText("git_info.json")).not.toBeInTheDocument();
  });

  it("shows 'Show evidence' button when there is evidence", () => {
    render(
      <AuditCheckRow
        check={makeCheck({
          dimension: "git_revision",
          status: "confirmed",
          evidence: ["git_info.json"],
          message: "OK",
        })}
      />
    );
    expect(screen.getByRole("button", { name: /Show evidence for Git Revision/i })).toBeInTheDocument();
  });

  it("expands to show evidence files when button is clicked", async () => {
    render(
      <AuditCheckRow
        check={makeCheck({
          dimension: "git_revision",
          status: "confirmed",
          evidence: ["git_info.json", "config.yaml"],
          message: "OK",
        })}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /Show evidence for Git Revision/i }));
    expect(screen.getByText("git_info.json")).toBeInTheDocument();
    expect(screen.getByText("config.yaml")).toBeInTheDocument();
  });

  it("collapses evidence when button is clicked again", async () => {
    render(
      <AuditCheckRow
        check={makeCheck({
          dimension: "git_revision",
          status: "confirmed",
          evidence: ["git_info.json"],
          message: "OK",
        })}
      />
    );
    const btn = screen.getByRole("button", { name: /Show evidence for Git Revision/i });
    await userEvent.click(btn);
    expect(screen.getByText("git_info.json")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Hide evidence for Git Revision/i }));
    expect(screen.queryByText("git_info.json")).not.toBeInTheDocument();
  });

  it("aria-expanded is false when collapsed", () => {
    render(
      <AuditCheckRow
        check={makeCheck({
          dimension: "git_revision",
          status: "confirmed",
          evidence: ["git_info.json"],
          message: "OK",
        })}
      />
    );
    const btn = screen.getByRole("button", { name: /Show evidence for Git Revision/i });
    expect(btn).toHaveAttribute("aria-expanded", "false");
  });

  it("aria-expanded is true when expanded", async () => {
    render(
      <AuditCheckRow
        check={makeCheck({
          dimension: "git_revision",
          status: "confirmed",
          evidence: ["git_info.json"],
          message: "OK",
        })}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /Show evidence for Git Revision/i }));
    expect(screen.getByRole("button", { name: /Hide evidence for Git Revision/i })).toHaveAttribute("aria-expanded", "true");
  });

  it("does not show evidence button when evidence is empty", () => {
    render(
      <AuditCheckRow
        check={makeCheck({ dimension: "random_seeds", status: "missing" })}
      />
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows explicit 'no evidence files' message for missing status with empty evidence", () => {
    render(
      <AuditCheckRow
        check={makeCheck({ dimension: "random_seeds", status: "missing", message: "No seeds found." })}
      />
    );
    expect(screen.getByText(/No evidence files were found for this dimension/i)).toBeInTheDocument();
  });

  it("does not show no-evidence message for confirmed status with empty evidence", () => {
    // Unusual but defensively correct
    render(
      <AuditCheckRow
        check={makeCheck({ dimension: "random_seeds", status: "confirmed", evidence: [], message: "Seeds ok." })}
      />
    );
    expect(screen.queryByText(/No evidence files were found/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Actual evidence paths — not fabricated
// ---------------------------------------------------------------------------

describe("AuditCheckRow — actual evidence paths", () => {
  it("shows the exact evidence filenames returned by the audit engine", async () => {
    render(
      <AuditCheckRow
        check={{
          dimension: "dependency_versions",
          status: "confirmed",
          evidence: ["requirements.txt"],
          message: "2 dependency/ies recorded with exact version pins.",
        }}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /Show evidence for Dependency Versions/i }));
    expect(screen.getByText("requirements.txt")).toBeInTheDocument();
  });

  it("shows multiple evidence paths", async () => {
    render(
      <AuditCheckRow
        check={{
          dimension: "git_revision",
          status: "confirmed",
          evidence: ["git_info.json", "config.yaml", "params.yaml"],
          message: "Git revision abc123 recorded.",
        }}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /Show evidence for Git Revision/i }));
    expect(screen.getByText("git_info.json")).toBeInTheDocument();
    expect(screen.getByText("config.yaml")).toBeInTheDocument();
    expect(screen.getByText("params.yaml")).toBeInTheDocument();
  });

  it("handles long evidence strings without crashing", async () => {
    const longPath = "mlruns/0/" + "a".repeat(200) + "/tags/mlflow.source.git.commit";
    render(
      <AuditCheckRow
        check={{
          dimension: "git_revision",
          status: "confirmed",
          evidence: [longPath],
          message: "Git revision recorded.",
        }}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /Show evidence for Git Revision/i }));
    expect(screen.getByText(longPath)).toBeInTheDocument();
  });
});
