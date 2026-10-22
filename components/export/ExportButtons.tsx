"use client";

/**
 * components/export/ExportButtons.tsx
 *
 * Markdown and JSON download buttons for RunTrace.
 *
 * Wires:
 *   - toMarkdown() from lib/exporter/markdown.ts
 *   - toJSON()     from lib/exporter/json.ts
 *
 * Both functions are pure (no DOM, no side-effects). The download is
 * performed here using the standard Blob + object-URL + <a download> pattern.
 * Object URLs are revoked after the click to prevent memory leaks.
 *
 * The buttons are disabled when there are no runs to export
 * (no comparison result to build a payload from).
 *
 * Filenames use the date the button is clicked:
 *   runtrace-report-YYYY-MM-DD.md
 *   runtrace-report-YYYY-MM-DD.json
 */

import React, { useCallback } from "react";
import type { ExperimentRun, OptimizationDirection } from "@/lib/schema";
import { compareRuns } from "@/lib/comparator";
import { auditRun } from "@/lib/auditor";
import { toMarkdown } from "@/lib/exporter/markdown";
import { toJSON } from "@/lib/exporter/json";
import type { ExportPayload } from "@/lib/schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExportButtonsProps {
  /** Successfully parsed experiment runs. Exports are disabled when empty. */
  runs: ExperimentRun[];
  /** The currently selected comparison metric. */
  selectedMetric: string | null;
  /** The currently selected optimization direction. */
  direction: OptimizationDirection;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build the ISO date string for the filename (YYYY-MM-DD in local time). */
function todayString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Trigger a browser download for the given text content. */
function triggerDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    // Revoke after a short delay to let the browser start the download.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/** Build the ExportPayload from the current application state. */
function buildPayload(
  runs: ExperimentRun[],
  metric: string,
  direction: OptimizationDirection
): ExportPayload {
  const comparison = compareRuns(runs, metric, direction);
  const audits = runs.map((run) => auditRun(run));
  return { comparison, audits };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ExportButtons({
  runs,
  selectedMetric,
  direction,
}: ExportButtonsProps) {
  const canExport = runs.length > 0 && selectedMetric !== null;

  // -------------------------------------------------------------------------
  // Markdown download
  // -------------------------------------------------------------------------
  const handleMarkdown = useCallback(() => {
    if (!canExport || selectedMetric === null) return;
    try {
      const payload = buildPayload(runs, selectedMetric, direction);
      const content = toMarkdown(payload);
      const filename = `runtrace-report-${todayString()}.md`;
      triggerDownload(content, filename, "text/markdown;charset=utf-8");
    } catch (err) {
      // Log rather than crash — the user is not in a state that should break the app.
      console.error("[RunTrace] Markdown export failed:", err);
    }
  }, [runs, selectedMetric, direction, canExport]);

  // -------------------------------------------------------------------------
  // JSON download
  // -------------------------------------------------------------------------
  const handleJSON = useCallback(() => {
    if (!canExport || selectedMetric === null) return;
    try {
      const payload = buildPayload(runs, selectedMetric, direction);
      const content = toJSON(payload);
      const filename = `runtrace-report-${todayString()}.json`;
      triggerDownload(content, filename, "application/json;charset=utf-8");
    } catch (err) {
      console.error("[RunTrace] JSON export failed:", err);
    }
  }, [runs, selectedMetric, direction, canExport]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={!canExport}
        onClick={handleMarkdown}
        aria-label="Export report as Markdown"
        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 hover:border-zinc-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {/* Markdown icon */}
        <svg
          aria-hidden="true"
          className="h-4 w-4 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
          />
        </svg>
        Export Markdown
      </button>

      <button
        type="button"
        disabled={!canExport}
        onClick={handleJSON}
        aria-label="Export report as JSON"
        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 hover:border-zinc-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {/* JSON / brackets icon */}
        <svg
          aria-hidden="true"
          className="h-4 w-4 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5"
          />
        </svg>
        Export JSON
      </button>

      {!canExport && (
        <p className="text-xs text-zinc-400">
          {runs.length === 0
            ? "Upload at least one experiment to enable exports."
            : "Select a metric to enable exports."}
        </p>
      )}
    </div>
  );
}
