"use client";

/**
 * app/page.tsx
 *
 * RunTrace application shell — Phase 8.
 *
 * Responsibilities:
 * - Application header with name and tagline.
 * - DropZone for ZIP uploads.
 * - Demo experiment loader (loads sample archives via parseZip).
 * - Per-file upload records managed via useReducer.
 * - Uploaded-experiments section with cards.
 * - Comparison panel fed by successfully parsed runs.
 * - Audit panels per run.
 * - Export buttons (Markdown + JSON) using the currently selected metric/direction.
 *
 * Client-only: all parsing runs in the browser via the parser module.
 * No data leaves the browser.
 */

import React, { useReducer, useCallback, useMemo, useState } from "react";
import { DropZone } from "@/components/upload/DropZone";
import { RunCard } from "@/components/runs/RunCard";
import { ComparisonPanel } from "@/components/comparison/ComparisonPanel";
import { AuditPanel } from "@/components/audit/AuditPanel";
import { ExportButtons } from "@/components/export/ExportButtons";
import { uploadReducer } from "@/lib/uploadReducer";
import { parseZip } from "@/lib/parser";
import type { UploadSuccess } from "@/lib/uploadReducer";
import type { OptimizationDirection } from "@/lib/schema";

// ---------------------------------------------------------------------------
// Stable ID generator (crypto.randomUUID when available, fallback otherwise)
// ---------------------------------------------------------------------------
function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ---------------------------------------------------------------------------
// Sample archive paths (served from /public/samples/)
// ---------------------------------------------------------------------------

const SAMPLE_FILES = [
  { path: "/samples/baseline-experiment.zip", label: "baseline-experiment" },
  { path: "/samples/improved-experiment.zip", label: "improved-experiment" },
  { path: "/samples/reproducibility-warning.zip", label: "reproducibility-warning" },
] as const;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function HomePage() {
  const [uploads, dispatch] = useReducer(uploadReducer, []);

  // Selected metric and direction are managed at page level so ExportButtons
  // can use the same values as ComparisonPanel without prop-drilling through
  // a deeper component tree.
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);
  const [direction, setDirection] = useState<OptimizationDirection>("maximize");

  // Demo loading state
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Handle accepted files from DropZone
  // -------------------------------------------------------------------------
  const handleFiles = useCallback((files: File[]) => {
    files.forEach((file) => {
      const id = newId();
      dispatch({ type: "UPLOAD_START", id, filename: file.name });

      parseZip(file).then((result) => {
        if (result.ok) {
          dispatch({ type: "UPLOAD_SUCCESS", id, run: result.run });
        } else {
          dispatch({ type: "UPLOAD_ERROR", id, message: result.error });
        }
      });
    });
  }, []);

  const handleRemove = useCallback((id: string) => {
    dispatch({ type: "REMOVE", id });
  }, []);

  // -------------------------------------------------------------------------
  // Demo loader — fetch sample ZIPs and parse via the real parser
  // -------------------------------------------------------------------------
  const handleLoadDemo = useCallback(async () => {
    setDemoError(null);

    // Check which sample names are already loaded (by run id or filename).
    const loadedFilenames = new Set(uploads.map((u) => u.filename));
    const toLoad = SAMPLE_FILES.filter(
      (s) => !loadedFilenames.has(s.label + ".zip")
    );

    if (toLoad.length === 0) {
      // All samples already loaded — clear them and reload so repeated clicks
      // are predictable rather than silently doing nothing.
      // For simplicity just inform the user.
      setDemoError("Demo experiments are already loaded. Remove them first to reload.");
      return;
    }

    setDemoLoading(true);
    try {
      for (const sample of toLoad) {
        const id = newId();
        dispatch({ type: "UPLOAD_START", id, filename: sample.label + ".zip" });

        try {
          const response = await fetch(sample.path);
          if (!response.ok) {
            dispatch({
              type: "UPLOAD_ERROR",
              id,
              message: `Could not fetch sample "${sample.label}": HTTP ${response.status}`,
            });
            continue;
          }
          const blob = await response.blob();
          const file = new File([blob], sample.label + ".zip", {
            type: "application/zip",
          });
          const result = await parseZip(file);
          if (result.ok) {
            dispatch({ type: "UPLOAD_SUCCESS", id, run: result.run });
          } else {
            dispatch({ type: "UPLOAD_ERROR", id, message: result.error });
          }
        } catch (err) {
          dispatch({
            type: "UPLOAD_ERROR",
            id,
            message: `Failed to load sample "${sample.label}": ${(err as Error).message}`,
          });
        }
      }
    } finally {
      setDemoLoading(false);
    }
  }, [uploads]);

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------
  const hasUploads = uploads.length > 0;
  const loadingCount = uploads.filter((u) => u.status === "loading").length;

  // Extract ExperimentRun objects from successfully parsed uploads only.
  const successfulRuns = useMemo(
    () =>
      (uploads.filter((u) => u.status === "success") as UploadSuccess[]).map(
        (u) => u.run
      ),
    [uploads]
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="flex min-h-full flex-col bg-zinc-50">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                               */}
      {/* ------------------------------------------------------------------ */}
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
            <h1 className="text-xl font-bold tracking-tight text-zinc-900">
              RunTrace
            </h1>
            <span className="text-sm text-zinc-500">
              Local-first ML experiment comparison &amp; reproducibility auditing
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            All experiment data is processed locally in your browser — nothing is
            sent to any server.
          </p>
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Main content                                                         */}
      {/* ------------------------------------------------------------------ */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">

        {/* Upload section */}
        <section aria-labelledby="upload-heading">
          <h2
            id="upload-heading"
            className="mb-1 text-base font-semibold text-zinc-900"
          >
            Upload experiment artifacts
          </h2>
          <p className="mb-4 text-sm text-zinc-500">
            Drop one or more ZIP files exported from your ML training runs.
            Supported formats include{" "}
            <span className="font-medium text-zinc-700">
              metrics.csv, metrics.json, config.yaml, requirements.txt
            </span>{" "}
            and MLflow artifact directories.
          </p>

          <DropZone
            onFiles={handleFiles}
            disabled={loadingCount > 0}
          />

          {/* Demo loader */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={demoLoading || loadingCount > 0}
              onClick={handleLoadDemo}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {demoLoading ? (
                <>
                  <svg
                    aria-hidden="true"
                    className="h-4 w-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Loading samples…
                </>
              ) : (
                <>
                  <svg
                    aria-hidden="true"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.75}
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                  Load demo experiments
                </>
              )}
            </button>
            <p className="text-xs text-zinc-400">
              Loads three synthetic demonstration archives — not real research data.
            </p>
          </div>

          {demoError && (
            <p role="alert" className="mt-2 text-sm text-amber-700">
              {demoError}
            </p>
          )}
        </section>

        {/* Experiments section */}
        <section aria-labelledby="experiments-heading" className="mt-10">
          <h2
            id="experiments-heading"
            className="mb-4 text-base font-semibold text-zinc-900"
          >
            Uploaded experiments
            {hasUploads && (
              <span className="ml-2 text-sm font-normal text-zinc-400">
                ({uploads.length})
              </span>
            )}
          </h2>

          {!hasUploads ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-200 bg-white px-6 py-14 text-center">
              <svg
                aria-hidden="true"
                className="mb-4 h-10 w-10 text-zinc-300"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                />
              </svg>
              <p className="text-sm font-medium text-zinc-600">
                No experiments uploaded yet
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                Upload ZIP files above or use{" "}
                <span className="font-medium">Load demo experiments</span> to get
                started.
              </p>
            </div>
          ) : (
            <ul
              aria-label="Uploaded experiments"
              className="grid gap-3 sm:grid-cols-1 md:grid-cols-2"
            >
              {uploads.map((record) => (
                <li key={record.id}>
                  <RunCard record={record} onRemove={handleRemove} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Comparison panel */}
        <section aria-labelledby="comparison-heading" className="mt-10">
          <h2
            id="comparison-heading"
            className="mb-4 text-base font-semibold text-zinc-900"
          >
            Metric comparison
          </h2>
          <ComparisonPanel
            runs={successfulRuns}
            selectedMetric={selectedMetric}
            direction={direction}
            onMetricChange={setSelectedMetric}
            onDirectionChange={setDirection}
          />
        </section>

        {/* Audit panels — one per successfully parsed run */}
        {successfulRuns.length > 0 && (
          <section aria-labelledby="audit-heading" className="mt-10">
            <h2
              id="audit-heading"
              className="mb-1 text-base font-semibold text-zinc-900"
            >
              Reproducibility audits
            </h2>
            <p className="mb-4 text-sm text-zinc-500">
              Rule-based summaries of reproducibility evidence for each run.
              Scores are descriptive labels, not statistical guarantees.
              Missing metadata is not proof of failure.
            </p>
            <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2">
              {successfulRuns.map((run) => (
                <AuditPanel key={run.id} run={run} />
              ))}
            </div>
          </section>
        )}

        {/* Export section */}
        <section aria-labelledby="export-heading" className="mt-10">
          <h2
            id="export-heading"
            className="mb-1 text-base font-semibold text-zinc-900"
          >
            Export report
          </h2>
          <p className="mb-4 text-sm text-zinc-500">
            Download the current comparison and audit results. Exports reflect
            the currently selected metric and direction. Reports are generated
            entirely in your browser.
          </p>
          <ExportButtons
            runs={successfulRuns}
            selectedMetric={selectedMetric}
            direction={direction}
          />
        </section>

      </main>

      {/* ------------------------------------------------------------------ */}
      {/* Footer                                                               */}
      {/* ------------------------------------------------------------------ */}
      <footer className="border-t border-zinc-200 bg-white mt-10">
        <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6">
          <p className="text-xs text-zinc-400">
            RunTrace processes all data locally in your browser. No experiment
            data is uploaded to any server or external service.
          </p>
        </div>
      </footer>
    </div>
  );
}
