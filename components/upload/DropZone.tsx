"use client";

/**
 * components/upload/DropZone.tsx
 *
 * Drag-and-drop + click-to-browse ZIP upload control.
 *
 * - Accepts .zip files (MIME type check + magic-byte validation).
 * - Allows multiple files in a single operation.
 * - Rejects unsupported types with a clear message.
 * - Calls onFiles(files) for each accepted set — caller is responsible
 *   for invoking the parser.
 * - Fully keyboard-operable; meets WCAG 2.1 AA focus / label / role
 *   requirements.
 * - Announces status changes to screen readers via aria-live.
 */

import React, {
  useRef,
  useState,
  useCallback,
  type DragEvent,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DropZoneProps {
  /** Called with the accepted File objects. */
  onFiles: (files: File[]) => void;
  /** When true, the drop zone accepts no input (e.g. during a parse cycle). */
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ZIP_MIME_TYPES = new Set([
  "application/zip",
  "application/x-zip",
  "application/x-zip-compressed",
  "application/octet-stream", // browsers sometimes use this for .zip
]);

// ZIP magic bytes: PK\x03\x04
const ZIP_MAGIC = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

/**
 * Check the first four bytes of a file against the ZIP magic number.
 * Returns true when the file looks like a valid ZIP.
 */
async function hasZipMagic(file: File): Promise<boolean> {
  try {
    const slice = file.slice(0, 4);
    const buf = await slice.arrayBuffer();
    const bytes = new Uint8Array(buf);
    return (
      bytes.length >= 4 &&
      bytes[0] === ZIP_MAGIC[0] &&
      bytes[1] === ZIP_MAGIC[1] &&
      bytes[2] === ZIP_MAGIC[2] &&
      bytes[3] === ZIP_MAGIC[3]
    );
  } catch {
    return false;
  }
}

/**
 * Return true when the file should be accepted as a ZIP candidate.
 * Accepts .zip extension OR a ZIP-compatible MIME type.
 */
function isZipCandidate(file: File): boolean {
  const hasExt = file.name.toLowerCase().endsWith(".zip");
  const hasMime = ZIP_MIME_TYPES.has(file.type.toLowerCase());
  return hasExt || hasMime;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DropZone({ onFiles, disabled = false }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>("");

  // -------------------------------------------------------------------------
  // File validation and dispatch
  // -------------------------------------------------------------------------

  const processFiles = useCallback(
    async (rawFiles: FileList | File[]) => {
      const files = Array.from(rawFiles);
      if (files.length === 0) return;

      const accepted: File[] = [];
      const rejected: string[] = [];

      for (const file of files) {
        if (!isZipCandidate(file)) {
          rejected.push(`"${file.name}" is not a ZIP file`);
          continue;
        }
        const valid = await hasZipMagic(file);
        if (!valid) {
          rejected.push(`"${file.name}" does not appear to be a valid ZIP archive`);
          continue;
        }
        accepted.push(file);
      }

      if (rejected.length > 0) {
        setStatusMessage(`Rejected: ${rejected.join("; ")}.`);
      } else if (accepted.length > 0) {
        setStatusMessage(
          accepted.length === 1
            ? `Processing "${accepted[0].name}"…`
            : `Processing ${accepted.length} files…`
        );
      }

      if (accepted.length > 0) {
        onFiles(accepted);
      }
    },
    [onFiles]
  );

  // -------------------------------------------------------------------------
  // Drag handlers
  // -------------------------------------------------------------------------

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragOver(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      if (disabled) return;
      if (e.dataTransfer.files.length > 0) {
        processFiles(e.dataTransfer.files);
      }
    },
    [disabled, processFiles]
  );

  // -------------------------------------------------------------------------
  // Click / keyboard handlers
  // -------------------------------------------------------------------------

  const handleClick = useCallback(() => {
    if (!disabled) inputRef.current?.click();
  }, [disabled]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (!disabled && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        inputRef.current?.click();
      }
    },
    [disabled]
  );

  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        processFiles(e.target.files);
        // Reset so the same file can be re-uploaded after an error.
        e.target.value = "";
      }
    },
    [processFiles]
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const dropZoneClasses = [
    "relative flex flex-col items-center justify-center",
    "w-full min-h-[200px] px-6 py-10 rounded-xl border-2 border-dashed",
    "transition-colors duration-150 cursor-pointer select-none",
    disabled
      ? "border-zinc-200 bg-zinc-50 text-zinc-400 cursor-not-allowed"
      : isDragOver
      ? "border-blue-500 bg-blue-50 text-blue-700"
      : "border-zinc-300 bg-white text-zinc-600 hover:border-blue-400 hover:bg-zinc-50",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="w-full">
      {/* Hidden native file input */}
      <input
        ref={inputRef}
        id="zip-file-input"
        type="file"
        accept=".zip,application/zip,application/x-zip-compressed"
        multiple
        className="sr-only"
        aria-label="Select ZIP files"
        disabled={disabled}
        onChange={handleInputChange}
      />

      {/* Drag-and-drop target */}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Drop ZIP files here or press Enter to browse"
        aria-disabled={disabled}
        className={dropZoneClasses}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      >
        {/* Upload icon */}
        <svg
          aria-hidden="true"
          className={`mb-4 h-10 w-10 ${
            isDragOver ? "text-blue-500" : "text-zinc-400"
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
          />
        </svg>

        <p className="text-base font-medium">
          {isDragOver ? "Release to upload" : "Drop experiment ZIPs here"}
        </p>
        <p className="mt-1 text-sm">
          or{" "}
          <label
            htmlFor="zip-file-input"
            className={`font-medium underline underline-offset-2 ${
              disabled ? "pointer-events-none" : "cursor-pointer text-blue-600 hover:text-blue-700"
            }`}
          >
            browse files
          </label>
        </p>
        <p className="mt-3 text-xs text-zinc-400">
          ZIP files only · processed locally in your browser · no data is uploaded
        </p>
      </div>

      {/* Accessible live status region */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={`mt-2 text-sm ${
          statusMessage.startsWith("Rejected")
            ? "text-red-600"
            : "text-zinc-500"
        }`}
      >
        {statusMessage}
      </div>
    </div>
  );
}
