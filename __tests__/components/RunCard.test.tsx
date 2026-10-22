/**
 * __tests__/components/RunCard.test.tsx
 *
 * Tests for RunCard — loading, success, and error states.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { RunCard } from "@/components/runs/RunCard";
import type { UploadRecord } from "@/lib/uploadReducer";
import { makeRun, makeMetadata, makeArtifacts } from "@/__tests__/helpers/factories";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadingRecord(overrides?: Partial<{ filename: string }>): UploadRecord {
  return {
    id: "test-id-1",
    filename: overrides?.filename ?? "experiment.zip",
    status: "loading",
  };
}

function errorRecord(overrides?: Partial<{ filename: string; message: string }>): UploadRecord {
  return {
    id: "test-id-2",
    filename: overrides?.filename ?? "experiment.zip",
    status: "error",
    message: overrides?.message ?? "Could not open ZIP archive: bad data",
  };
}

function successRecord(overrides?: Partial<{
  filename: string;
  id: string;
  runName?: string;
  metrics?: Record<string, number>;
  metadataOverrides?: Parameters<typeof makeMetadata>[0];
  artifactOverrides?: Parameters<typeof makeArtifacts>[0];
}>): UploadRecord {
  const id = overrides?.id ?? "test-id-3";
  return {
    id,
    filename: overrides?.filename ?? "experiment.zip",
    status: "success",
    run: makeRun(
      overrides?.runName ?? "my-run",
      overrides?.metrics ?? { accuracy: 0.95, loss: 0.12 },
      overrides?.metadataOverrides ?? {},
      overrides?.artifactOverrides ?? {}
    ),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RunCard", () => {
  let onRemove: ReturnType<typeof vi.fn<(id: string) => void>>;

  beforeEach(() => {
    onRemove = vi.fn<(id: string) => void>();
  });

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  it("shows a loading indicator while parsing", () => {
    render(<RunCard record={loadingRecord()} onRemove={onRemove} />);
    // role=status from the loading card
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText(/Parsing/i)).toBeInTheDocument();
  });

  it("shows the filename while loading", () => {
    render(
      <RunCard record={loadingRecord({ filename: "my-run.zip" })} onRemove={onRemove} />
    );
    expect(screen.getByText("my-run.zip")).toBeInTheDocument();
  });

  it("does not show a remove button while loading", () => {
    render(<RunCard record={loadingRecord()} onRemove={onRemove} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------

  it("shows the filename on an error card", () => {
    render(
      <RunCard record={errorRecord({ filename: "broken.zip" })} onRemove={onRemove} />
    );
    expect(screen.getByText("broken.zip")).toBeInTheDocument();
  });

  it("shows the error message", () => {
    render(
      <RunCard
        record={errorRecord({ message: "File is too large (201.0 MB)." })}
        onRemove={onRemove}
      />
    );
    expect(screen.getByText(/File is too large/i)).toBeInTheDocument();
  });

  it("calls onRemove with the correct id when dismiss is clicked on error card", async () => {
    const record = errorRecord();
    render(<RunCard record={record} onRemove={onRemove} />);
    const dismissBtn = screen.getByRole("button", { name: /Dismiss/i });
    await userEvent.click(dismissBtn);
    expect(onRemove).toHaveBeenCalledWith("test-id-2");
  });

  it("handles a very long error message without overflow (renders without crashing)", () => {
    const longMessage = "E".repeat(500);
    render(
      <RunCard record={errorRecord({ message: longMessage })} onRemove={onRemove} />
    );
    expect(screen.getByText(longMessage)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Success state
  // -------------------------------------------------------------------------

  it("shows the run name on a success card", () => {
    render(<RunCard record={successRecord({ runName: "baseline-v2" })} onRemove={onRemove} />);
    expect(screen.getByText("baseline-v2")).toBeInTheDocument();
  });

  it("shows the correct metric count", () => {
    render(
      <RunCard
        record={successRecord({ metrics: { acc: 0.9, loss: 0.1, f1: 0.85 } })}
        onRemove={onRemove}
      />
    );
    expect(screen.getByText("3 metrics")).toBeInTheDocument();
  });

  it("shows singular metric count when exactly one metric", () => {
    render(
      <RunCard
        record={successRecord({ metrics: { accuracy: 0.9 } })}
        onRemove={onRemove}
      />
    );
    expect(screen.getByText("1 metric")).toBeInTheDocument();
  });

  it("shows 'No metrics found' when run has no metrics", () => {
    render(
      <RunCard
        record={successRecord({ metrics: {} })}
        onRemove={onRemove}
      />
    );
    expect(screen.getByText(/No metrics found/i)).toBeInTheDocument();
  });

  it("shows Git revision badge when git metadata is present", () => {
    render(
      <RunCard
        record={successRecord({
          metadataOverrides: { gitRevision: "abc1234" },
        })}
        onRemove={onRemove}
      />
    );
    expect(screen.getByText("Git revision")).toBeInTheDocument();
  });

  it("does not show Git revision badge when absent", () => {
    render(<RunCard record={successRecord()} onRemove={onRemove} />);
    expect(screen.queryByText("Git revision")).not.toBeInTheDocument();
  });

  it("shows Random seeds badge when seeds are present", () => {
    render(
      <RunCard
        record={successRecord({
          metadataOverrides: { randomSeeds: { global: 42 } },
        })}
        onRemove={onRemove}
      />
    );
    expect(screen.getByText("Random seeds")).toBeInTheDocument();
  });

  it("shows Dataset badge when dataset identifiers are present", () => {
    render(
      <RunCard
        record={successRecord({
          metadataOverrides: {
            datasetIdentifiers: [{ name: "imagenet" }],
          },
        })}
        onRemove={onRemove}
      />
    );
    expect(screen.getByText("Dataset")).toBeInTheDocument();
  });

  it("shows Dependencies badge when dependency versions are present", () => {
    render(
      <RunCard
        record={successRecord({
          metadataOverrides: {
            dependencyVersions: { torch: "2.0.0" },
          },
        })}
        onRemove={onRemove}
      />
    );
    expect(screen.getByText("Dependencies")).toBeInTheDocument();
  });

  it("calls onRemove with the correct id when remove button is clicked", async () => {
    const record = successRecord({ id: "remove-test-id" });
    render(<RunCard record={record} onRemove={onRemove} />);
    const removeBtn = screen.getByRole("button", { name: /Remove/i });
    await userEvent.click(removeBtn);
    expect(onRemove).toHaveBeenCalledWith("remove-test-id");
  });

  it("handles a very long run name without crashing", () => {
    const longName = "a".repeat(200);
    render(
      <RunCard
        record={successRecord({ runName: longName })}
        onRemove={onRemove}
      />
    );
    expect(screen.getByText(longName)).toBeInTheDocument();
  });

  it("handles run names with special characters", () => {
    const specialName = "run/v2 <test> & 'check'";
    render(
      <RunCard
        record={successRecord({ runName: specialName })}
        onRemove={onRemove}
      />
    );
    expect(screen.getByText(specialName)).toBeInTheDocument();
  });
});
