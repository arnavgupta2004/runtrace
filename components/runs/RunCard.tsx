"use client";

/**
 * components/runs/RunCard.tsx
 *
 * Displays a single upload record (loading / success / error state).
 *
 * Success cards derive all displayed information directly from the parsed
 * ExperimentRun — no invented or redundant state.
 *
 * Long filenames and long error messages are truncated with title tooltips
 * to prevent layout breakage.
 */

import React from "react";
import type { UploadRecord } from "@/lib/uploadReducer";
import type { ExperimentRun } from "@/lib/schema";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MetadataBadge({
  label,
  present,
}: {
  label: string;
  present: boolean;
}) {
  if (!present) return null;
  return (
    <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 border border-blue-100">
      {label}
    </span>
  );
}

function SuccessContent({ run }: { run: ExperimentRun }) {
  const metricCount = Object.keys(run.metrics).length;
  const hasGit =
    run.metadata.gitRevision != null || run.metadata.gitDirty != null;
  const hasSeeds = Object.keys(run.metadata.randomSeeds).length > 0;
  const hasDataset = run.metadata.datasetIdentifiers.length > 0;
  const hasDeps = Object.keys(run.metadata.dependencyVersions).length > 0;

  return (
    <div className="min-w-0 flex-1">
      {/* Run name */}
      <p
        className="truncate text-sm font-semibold text-zinc-900"
        title={run.name}
      >
        {run.name}
      </p>

      {/* Metric count */}
      <p className="mt-0.5 text-xs text-zinc-500">
        {metricCount === 0
          ? "No metrics found"
          : metricCount === 1
          ? "1 metric"
          : `${metricCount} metrics`}
      </p>

      {/* Metadata badges */}
      {(hasGit || hasSeeds || hasDataset || hasDeps) && (
        <div className="mt-2 flex flex-wrap gap-1" aria-label="Available metadata">
          <MetadataBadge label="Git revision" present={hasGit} />
          <MetadataBadge label="Random seeds" present={hasSeeds} />
          <MetadataBadge label="Dataset" present={hasDataset} />
          <MetadataBadge label="Dependencies" present={hasDeps} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main RunCard
// ---------------------------------------------------------------------------

export interface RunCardProps {
  record: UploadRecord;
  onRemove: (id: string) => void;
}

export function RunCard({ record, onRemove }: RunCardProps) {
  const handleRemove = () => onRemove(record.id);

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------
  if (record.status === "loading") {
    return (
      <div
        role="status"
        aria-label={`Parsing ${record.filename}`}
        className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
      >
        {/* Spinner */}
        <svg
          aria-hidden="true"
          className="h-5 w-5 animate-spin text-blue-500 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-sm font-medium text-zinc-700"
            title={record.filename}
          >
            {record.filename}
          </p>
          <p className="text-xs text-zinc-400">Parsing…</p>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------
  if (record.status === "error") {
    return (
      <div
        role="alert"
        className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
      >
        {/* Error icon */}
        <svg
          aria-hidden="true"
          className="mt-0.5 h-5 w-5 shrink-0 text-red-500"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
          />
        </svg>
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-sm font-semibold text-red-800"
            title={record.filename}
          >
            {record.filename}
          </p>
          <p
            className="mt-0.5 text-xs text-red-700 line-clamp-3"
            title={record.message}
          >
            {record.message}
          </p>
        </div>
        <button
          type="button"
          aria-label={`Dismiss error for ${record.filename}`}
          className="shrink-0 rounded p-0.5 text-red-400 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          onClick={handleRemove}
        >
          <svg
            aria-hidden="true"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Success state
  // -------------------------------------------------------------------------
  return (
    <div className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      {/* Success icon */}
      <svg
        aria-hidden="true"
        className="mt-0.5 h-5 w-5 shrink-0 text-green-500"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <SuccessContent run={record.run} />
      <button
        type="button"
        aria-label={`Remove ${record.run.name}`}
        className="shrink-0 rounded p-0.5 text-zinc-400 hover:text-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
        onClick={handleRemove}
      >
        <svg
          aria-hidden="true"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  );
}
