/**
 * __tests__/components/DemoLoader.test.tsx
 *
 * Tests for the "Load demo experiments" functionality in app/page.tsx.
 *
 * Covers:
 * - Demo button is visible on initial render
 * - Clicking the button fetches sample ZIPs and calls parseZip
 * - Successful parse adds run cards for all three samples
 * - Parse failure shows an error message
 * - Duplicate loading is blocked with an informative message
 * - Normal upload and remove still work alongside the demo loader
 */

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import HomePage from "@/app/page";
import { makeRun } from "@/__tests__/helpers/factories";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/parser", () => ({
  parseZip: vi.fn(),
}));

vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 400, height: 220 }}>{children}</div>
    ),
  };
});

import { parseZip } from "@/lib/parser";
const mockParseZip = parseZip as ReturnType<typeof vi.fn>;

// Mock fetch to return fake ZIP blobs (4-byte ZIP magic).
const ZIP_MAGIC = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

function makeMockFetch(statusOverride?: number) {
  return vi.fn(async (_input: URL | RequestInfo, _init?: RequestInit) => {
    if (statusOverride && statusOverride !== 200) {
      return { ok: false, status: statusOverride } as unknown as Response;
    }
    const blob = new Blob([ZIP_MAGIC], { type: "application/zip" });
    return {
      ok: true,
      status: 200,
      blob: async () => blob,
    } as unknown as Response;
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DemoLoader — button presence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = makeMockFetch();
    mockParseZip.mockResolvedValue({ ok: true, run: makeRun("baseline-experiment", { accuracy: 0.84 }) });
  });

  it("renders the Load demo experiments button", () => {
    render(<HomePage />);
    expect(screen.getByRole("button", { name: /Load demo experiments/i })).toBeInTheDocument();
  });

  it("shows the synthetic data disclaimer text", () => {
    render(<HomePage />);
    expect(screen.getByText(/synthetic demonstration archives/i)).toBeInTheDocument();
  });
});

describe("DemoLoader — successful loading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = makeMockFetch();
  });

  it("calls parseZip for each sample file", async () => {
    mockParseZip
      .mockResolvedValueOnce({ ok: true, run: makeRun("baseline-experiment", { accuracy: 0.84 }) })
      .mockResolvedValueOnce({ ok: true, run: makeRun("improved-experiment", { accuracy: 0.90 }) })
      .mockResolvedValueOnce({ ok: true, run: makeRun("reproducibility-warning", { accuracy: 0.76 }) });

    render(<HomePage />);
    await userEvent.click(screen.getByRole("button", { name: /Load demo experiments/i }));

    await waitFor(() => {
      expect(mockParseZip).toHaveBeenCalledTimes(3);
    });
  });

  it("adds run cards for all three demo samples on success", async () => {
    mockParseZip
      .mockResolvedValueOnce({ ok: true, run: makeRun("baseline-experiment", { accuracy: 0.84 }) })
      .mockResolvedValueOnce({ ok: true, run: makeRun("improved-experiment", { accuracy: 0.90 }) })
      .mockResolvedValueOnce({ ok: true, run: makeRun("reproducibility-warning", { accuracy: 0.76 }) });

    render(<HomePage />);
    await userEvent.click(screen.getByRole("button", { name: /Load demo experiments/i }));

    await waitFor(() => {
      expect(screen.getAllByText("baseline-experiment").length).toBeGreaterThan(0);
      expect(screen.getAllByText("improved-experiment").length).toBeGreaterThan(0);
      expect(screen.getAllByText("reproducibility-warning").length).toBeGreaterThan(0);
    });
  });

  it("passes a File object with the correct name to parseZip", async () => {
    mockParseZip.mockResolvedValue({ ok: true, run: makeRun("baseline-experiment", { accuracy: 0.84 }) });

    render(<HomePage />);
    await userEvent.click(screen.getByRole("button", { name: /Load demo experiments/i }));

    await waitFor(() => {
      expect(mockParseZip).toHaveBeenCalled();
    });

    const firstArg = mockParseZip.mock.calls[0][0] as File;
    expect(firstArg).toBeInstanceOf(File);
    expect(firstArg.name).toMatch(/\.zip$/);
  });
});

describe("DemoLoader — fetch failure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows an error card when sample fetch returns a non-200 status", async () => {
    globalThis.fetch = makeMockFetch(404);
    mockParseZip.mockResolvedValue({ ok: true, run: makeRun("x", {}) });

    render(<HomePage />);
    await userEvent.click(screen.getByRole("button", { name: /Load demo experiments/i }));

    await waitFor(() => {
      // Error messages are rendered as error cards
      expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    });
  });
});

describe("DemoLoader — parse failure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = makeMockFetch();
  });

  it("shows an error card when parseZip returns ok: false", async () => {
    mockParseZip.mockResolvedValue({ ok: false, error: "Not a valid ZIP" });

    render(<HomePage />);
    await userEvent.click(screen.getByRole("button", { name: /Load demo experiments/i }));

    await waitFor(() => {
      expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    });
  });
});

describe("DemoLoader — duplicate loading prevention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = makeMockFetch();
  });

  it("shows an informative message when all samples are already loaded", async () => {
    mockParseZip
      .mockResolvedValueOnce({ ok: true, run: makeRun("baseline-experiment", { accuracy: 0.84 }) })
      .mockResolvedValueOnce({ ok: true, run: makeRun("improved-experiment", { accuracy: 0.90 }) })
      .mockResolvedValueOnce({ ok: true, run: makeRun("reproducibility-warning", { accuracy: 0.76 }) });

    render(<HomePage />);
    // Load once.
    await userEvent.click(screen.getByRole("button", { name: /Load demo experiments/i }));
    await waitFor(() => expect(mockParseZip).toHaveBeenCalledTimes(3));

    // Load again — should show the duplicate message.
    await userEvent.click(screen.getByRole("button", { name: /Load demo experiments/i }));

    await waitFor(() => {
      expect(screen.getByText(/already loaded/i)).toBeInTheDocument();
    });
  });
});

describe("DemoLoader — coexistence with manual upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = makeMockFetch();
  });

  it("manual upload still works after demo loading", async () => {
    mockParseZip
      .mockResolvedValueOnce({ ok: true, run: makeRun("baseline-experiment", { accuracy: 0.84 }) })
      .mockResolvedValueOnce({ ok: true, run: makeRun("improved-experiment", { accuracy: 0.90 }) })
      .mockResolvedValueOnce({ ok: true, run: makeRun("reproducibility-warning", { accuracy: 0.76 }) })
      .mockResolvedValueOnce({ ok: true, run: makeRun("manual-run", { accuracy: 0.99 }) });

    render(<HomePage />);
    await userEvent.click(screen.getByRole("button", { name: /Load demo experiments/i }));
    await waitFor(() => expect(screen.getAllByText("baseline-experiment").length).toBeGreaterThan(0));

    // Upload a manual run.
    const buf = new ArrayBuffer(8);
    const view = new Uint8Array(buf);
    ZIP_MAGIC.forEach((b, i) => { view[i] = b; });
    const file = new File([buf], "manual-run.zip", { type: "application/zip" });

    const input = document.getElementById("zip-file-input") as HTMLInputElement;
    await userEvent.upload(input, file);

    await waitFor(() => {
      expect(screen.getAllByText("manual-run").length).toBeGreaterThan(0);
    });
  });
});
