/**
 * __tests__/components/HomePage.test.tsx
 *
 * Integration tests for app/page.tsx (the HomePage component).
 *
 * Covers:
 * - Uploading a successful run adds its audit panel
 * - Removing a run removes its audit panel
 * - Multiple uploads produce independent audit panels
 * - Existing upload and comparison functionality continues to work
 * - Audit panels do not appear when no runs are uploaded
 *
 * parseZip is mocked to return controlled ExperimentRun objects.
 * ResponsiveContainer is mocked to prevent Recharts crash in jsdom.
 * Files are created with ZIP magic bytes so the DropZone accepts them.
 */

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import HomePage from "@/app/page";
import { makeRun, makeDatasetRef, makeEvalSplit } from "@/__tests__/helpers/factories";

// ---------------------------------------------------------------------------
// Mock parseZip
// ---------------------------------------------------------------------------

vi.mock("@/lib/parser", () => ({
  parseZip: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock ResponsiveContainer (Recharts)
// ---------------------------------------------------------------------------

vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 400, height: 220 }}>{children}</div>
    ),
  };
});

// ---------------------------------------------------------------------------
// Import parseZip mock reference
// ---------------------------------------------------------------------------

import { parseZip } from "@/lib/parser";
const mockParseZip = parseZip as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Helpers: create a File with proper ZIP magic bytes so DropZone accepts it
// ---------------------------------------------------------------------------

/** ZIP magic: PK\x03\x04 */
const ZIP_MAGIC = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

function makeZipFile(name: string): File {
  const buf = new ArrayBuffer(8);
  const view = new Uint8Array(buf);
  ZIP_MAGIC.forEach((b, i) => { view[i] = b; });
  return new File([buf], name, { type: "application/zip" });
}

function getFileInput(): HTMLInputElement {
  return document.getElementById("zip-file-input") as HTMLInputElement;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("HomePage — audit panel integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not show audit section before any runs are uploaded", () => {
    render(<HomePage />);
    expect(screen.queryByText(/Reproducibility audits/i)).not.toBeInTheDocument();
  });

  it("shows the audit section after a successful run upload", async () => {
    const run = makeRun("my-experiment", { accuracy: 0.9 });
    mockParseZip.mockResolvedValue({ ok: true, run });

    render(<HomePage />);
    await userEvent.upload(getFileInput(), makeZipFile("my-experiment.zip"));

    await waitFor(() => {
      expect(screen.getByText(/Reproducibility audits/i)).toBeInTheDocument();
    });
  });

  it("adds an audit panel for the uploaded run", async () => {
    const run = makeRun("baseline-v1", { accuracy: 0.9 });
    mockParseZip.mockResolvedValue({ ok: true, run });

    render(<HomePage />);
    await userEvent.upload(getFileInput(), makeZipFile("baseline-v1.zip"));

    await waitFor(() => {
      expect(screen.getByRole("article", { name: /baseline-v1/i })).toBeInTheDocument();
    });
  });

  it("adds independent audit panels for multiple uploaded runs", async () => {
    const runA = makeRun("run-alpha", { accuracy: 0.9 });
    const runB = makeRun("run-beta", { accuracy: 0.8 });
    mockParseZip
      .mockResolvedValueOnce({ ok: true, run: runA })
      .mockResolvedValueOnce({ ok: true, run: runB });

    render(<HomePage />);
    await userEvent.upload(getFileInput(), makeZipFile("run-alpha.zip"));
    await userEvent.upload(getFileInput(), makeZipFile("run-beta.zip"));

    await waitFor(() => {
      expect(screen.getByRole("article", { name: /run-alpha/i })).toBeInTheDocument();
      expect(screen.getByRole("article", { name: /run-beta/i })).toBeInTheDocument();
    });
  });

  it("removes the audit panel when the run is removed", async () => {
    const run = makeRun("removable-run", { accuracy: 0.9 });
    mockParseZip.mockResolvedValue({ ok: true, run });

    render(<HomePage />);
    await userEvent.upload(getFileInput(), makeZipFile("removable-run.zip"));

    await waitFor(() => {
      expect(screen.getByRole("article", { name: /removable-run/i })).toBeInTheDocument();
    });

    // Click the remove button on the run card
    const removeButton = screen.getByRole("button", { name: /Remove removable-run/i });
    await userEvent.click(removeButton);

    await waitFor(() => {
      expect(screen.queryByRole("article", { name: /removable-run/i })).not.toBeInTheDocument();
    });
  });

  it("removes the audit section entirely when the last run is removed", async () => {
    const run = makeRun("only-run", { accuracy: 0.9 });
    mockParseZip.mockResolvedValue({ ok: true, run });

    render(<HomePage />);
    await userEvent.upload(getFileInput(), makeZipFile("only-run.zip"));

    await waitFor(() => {
      expect(screen.getByText(/Reproducibility audits/i)).toBeInTheDocument();
    });

    const removeButton = screen.getByRole("button", { name: /Remove only-run/i });
    await userEvent.click(removeButton);

    await waitFor(() => {
      expect(screen.queryByText(/Reproducibility audits/i)).not.toBeInTheDocument();
    });
  });

  it("does not show an audit panel for a failed upload", async () => {
    mockParseZip.mockResolvedValue({ ok: false, error: "Parse failed" });

    render(<HomePage />);
    await userEvent.upload(getFileInput(), makeZipFile("bad.zip"));

    await waitFor(() => {
      expect(screen.getByText(/Parse failed/i)).toBeInTheDocument();
    });

    expect(screen.queryByText(/Reproducibility audits/i)).not.toBeInTheDocument();
  });

  it("preserves the upload functionality (upload section is always present)", () => {
    render(<HomePage />);
    expect(screen.getByText(/Upload experiment artifacts/i)).toBeInTheDocument();
  });

  it("preserves the comparison panel (metric comparison section is always present)", () => {
    render(<HomePage />);
    expect(screen.getByText(/Metric comparison/i)).toBeInTheDocument();
  });

  it("shows 'poor' audit result for a run with dirty git", async () => {
    const run = makeRun(
      "dirty-run",
      { accuracy: 0.9 },
      {
        gitRevision: "abc123",
        gitDirty: true,
        randomSeeds: { seed: 42 },
        datasetIdentifiers: [makeDatasetRef("cifar10")],
        evalSplits: [makeEvalSplit("test")],
        dependencyVersions: { numpy: "1.24.0" },
      }
    );
    mockParseZip.mockResolvedValue({ ok: true, run });

    render(<HomePage />);
    await userEvent.upload(getFileInput(), makeZipFile("dirty-run.zip"));

    await waitFor(() => {
      expect(screen.getByText("Poor")).toBeInTheDocument();
    });
  });

  it("shows all five dimension labels in the audit panel after upload", async () => {
    const run = makeRun("run-x", { accuracy: 0.9 });
    mockParseZip.mockResolvedValue({ ok: true, run });

    render(<HomePage />);
    await userEvent.upload(getFileInput(), makeZipFile("run-x.zip"));

    await waitFor(() => {
      expect(screen.getByText("Git Revision")).toBeInTheDocument();
      expect(screen.getByText("Random Seeds")).toBeInTheDocument();
      expect(screen.getByText("Dataset Identifiers")).toBeInTheDocument();
      expect(screen.getByText("Evaluation Splits")).toBeInTheDocument();
      expect(screen.getByText("Dependency Versions")).toBeInTheDocument();
    });
  });
});
