/**
 * __tests__/components/DropZone.test.tsx
 *
 * Tests for the DropZone upload component.
 *
 * The magic-byte check reads 4 bytes from each File; we control the result
 * by providing File stubs whose .slice() returns the correct bytes.
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DropZone } from "@/components/upload/DropZone";

// ---------------------------------------------------------------------------
// Helper: build a File stub whose first 4 bytes match (or don't) ZIP magic.
// ---------------------------------------------------------------------------

/** ZIP magic: PK\x03\x04 */
const ZIP_MAGIC = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
/** Not-zip magic */
const NOT_MAGIC = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG header

function makeZipFile(name = "run.zip"): File {
  // Real File with zip magic bytes so hasZipMagic passes
  const buf = new ArrayBuffer(8);
  const view = new Uint8Array(buf);
  ZIP_MAGIC.forEach((b, i) => { view[i] = b; });
  return new File([buf], name, { type: "application/zip" });
}

function makeNotZipFile(name = "image.png"): File {
  const buf = new ArrayBuffer(8);
  const view = new Uint8Array(buf);
  NOT_MAGIC.forEach((b, i) => { view[i] = b; });
  return new File([buf], name, { type: "image/png" });
}

function makeEmptyFile(name = "empty.zip"): File {
  return new File([], name, { type: "application/zip" });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DropZone", () => {
  let onFiles: ReturnType<typeof vi.fn<(files: File[]) => void>>;

  beforeEach(() => {
    onFiles = vi.fn<(files: File[]) => void>();
  });

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  it("renders the drop target with instructional text", () => {
    render(<DropZone onFiles={onFiles} />);
    expect(
      screen.getByText(/Drop experiment ZIPs here/i)
    ).toBeInTheDocument();
  });

  it("renders a browse files label linked to the file input", () => {
    render(<DropZone onFiles={onFiles} />);
    const label = screen.getByText(/browse files/i);
    expect(label).toBeInTheDocument();
  });

  it("displays the privacy notice", () => {
    render(<DropZone onFiles={onFiles} />);
    expect(screen.getByText(/processed locally in your browser/i)).toBeInTheDocument();
  });

  it("renders the file input with correct attributes", () => {
    render(<DropZone onFiles={onFiles} />);
    const input = document.getElementById("zip-file-input") as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.type).toBe("file");
    expect(input.multiple).toBe(true);
    expect(input.accept).toContain(".zip");
  });

  // -------------------------------------------------------------------------
  // Accessibility
  // -------------------------------------------------------------------------

  it("has an accessible role=button on the drop target", () => {
    render(<DropZone onFiles={onFiles} />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("drop target is keyboard-focusable when not disabled", () => {
    render(<DropZone onFiles={onFiles} />);
    const btn = screen.getByRole("button");
    expect(btn).not.toHaveAttribute("tabindex", "-1");
  });

  it("drop target is not focusable when disabled", () => {
    render(<DropZone onFiles={onFiles} disabled />);
    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("tabindex", "-1");
  });

  it("has an accessible aria-label on the drop target", () => {
    render(<DropZone onFiles={onFiles} />);
    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("aria-label");
  });

  it("has an aria-live status region", () => {
    render(<DropZone onFiles={onFiles} />);
    const status = screen.getByRole("status");
    expect(status).toBeInTheDocument();
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  // -------------------------------------------------------------------------
  // File selection — single ZIP
  // -------------------------------------------------------------------------

  it("calls onFiles with accepted ZIP when selected via file input", async () => {
    render(<DropZone onFiles={onFiles} />);
    const input = document.getElementById("zip-file-input") as HTMLInputElement;
    const file = makeZipFile("experiment.zip");

    await userEvent.upload(input, file);

    await waitFor(() => {
      expect(onFiles).toHaveBeenCalledOnce();
      const [files] = onFiles.mock.calls[0] as [File[]];
      expect(files).toHaveLength(1);
      expect(files[0].name).toBe("experiment.zip");
    });
  });

  // -------------------------------------------------------------------------
  // Multiple files
  // -------------------------------------------------------------------------

  it("calls onFiles with multiple accepted ZIPs", async () => {
    render(<DropZone onFiles={onFiles} />);
    const input = document.getElementById("zip-file-input") as HTMLInputElement;
    const files = [makeZipFile("run1.zip"), makeZipFile("run2.zip")];

    await userEvent.upload(input, files);

    await waitFor(() => {
      expect(onFiles).toHaveBeenCalledOnce();
      const [accepted] = onFiles.mock.calls[0] as [File[]];
      expect(accepted).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // Type rejection
  // -------------------------------------------------------------------------

  it("rejects a non-ZIP file and shows an error message", async () => {
    render(<DropZone onFiles={onFiles} />);
    const input = document.getElementById("zip-file-input") as HTMLInputElement;

    // Override accept to allow the test file through the browser filter
    input.removeAttribute("accept");
    const file = makeNotZipFile("photo.png");

    await userEvent.upload(input, file);

    await waitFor(() => {
      expect(onFiles).not.toHaveBeenCalled();
      expect(screen.getByRole("status")).toHaveTextContent(/Rejected/i);
    });
  });

  it("shows rejection message when file has .zip extension but wrong magic bytes", async () => {
    render(<DropZone onFiles={onFiles} />);
    const input = document.getElementById("zip-file-input") as HTMLInputElement;
    // Empty file has no magic bytes
    const file = makeEmptyFile("corrupt.zip");

    await userEvent.upload(input, file);

    await waitFor(() => {
      expect(onFiles).not.toHaveBeenCalled();
      expect(screen.getByRole("status")).toHaveTextContent(/Rejected/i);
    });
  });

  it("accepts valid ZIPs and rejects invalid files in a mixed batch", async () => {
    render(<DropZone onFiles={onFiles} />);
    const input = document.getElementById("zip-file-input") as HTMLInputElement;
    input.removeAttribute("accept");

    const files = [makeZipFile("good.zip"), makeNotZipFile("bad.png")];
    await userEvent.upload(input, files);

    await waitFor(() => {
      // Only the good file was passed to onFiles
      expect(onFiles).toHaveBeenCalledOnce();
      const [accepted] = onFiles.mock.calls[0] as [File[]];
      expect(accepted).toHaveLength(1);
      expect(accepted[0].name).toBe("good.zip");
      // Rejection message is shown
      expect(screen.getByRole("status")).toHaveTextContent(/Rejected/i);
    });
  });

  // -------------------------------------------------------------------------
  // Drag-and-drop
  // -------------------------------------------------------------------------

  it("accepts a dragged-and-dropped ZIP file", async () => {
    render(<DropZone onFiles={onFiles} />);
    const dropTarget = screen.getByRole("button");
    const file = makeZipFile("dropped.zip");

    fireEvent.dragOver(dropTarget, {
      dataTransfer: { files: [file] },
    });
    fireEvent.drop(dropTarget, {
      dataTransfer: { files: [file] },
    });

    await waitFor(() => {
      expect(onFiles).toHaveBeenCalledOnce();
    });
  });

  it("ignores drag-and-drop when disabled", async () => {
    render(<DropZone onFiles={onFiles} disabled />);
    const dropTarget = screen.getByRole("button");
    const file = makeZipFile("dropped.zip");

    fireEvent.drop(dropTarget, {
      dataTransfer: { files: [file] },
    });

    await waitFor(() => {
      expect(onFiles).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Keyboard activation
  // -------------------------------------------------------------------------

  it("opens file picker on Enter key press", () => {
    render(<DropZone onFiles={onFiles} />);
    const input = document.getElementById("zip-file-input") as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click");
    const dropTarget = screen.getByRole("button");

    fireEvent.keyDown(dropTarget, { key: "Enter" });

    expect(clickSpy).toHaveBeenCalled();
  });

  it("opens file picker on Space key press", () => {
    render(<DropZone onFiles={onFiles} />);
    const input = document.getElementById("zip-file-input") as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click");
    const dropTarget = screen.getByRole("button");

    fireEvent.keyDown(dropTarget, { key: " " });

    expect(clickSpy).toHaveBeenCalled();
  });

  it("does not open file picker on Enter when disabled", () => {
    render(<DropZone onFiles={onFiles} disabled />);
    const input = document.getElementById("zip-file-input") as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click");
    const dropTarget = screen.getByRole("button");

    fireEvent.keyDown(dropTarget, { key: "Enter" });

    expect(clickSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Upload after previous rejection (input value reset)
  // -------------------------------------------------------------------------

  it("allows re-uploading the same file after rejection", async () => {
    render(<DropZone onFiles={onFiles} />);
    const input = document.getElementById("zip-file-input") as HTMLInputElement;
    const file = makeZipFile("retry.zip");

    // First upload
    await userEvent.upload(input, file);
    await waitFor(() => expect(onFiles).toHaveBeenCalledTimes(1));

    // Second upload of same file — input was reset so it fires again
    await userEvent.upload(input, file);
    await waitFor(() => expect(onFiles).toHaveBeenCalledTimes(2));
  });
});
