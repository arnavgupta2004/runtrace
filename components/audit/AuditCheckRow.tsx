"use client";

/**
 * components/audit/AuditCheckRow.tsx
 *
 * Renders a single reproducibility audit check row.
 *
 * Shows:
 * - Dimension label (human-readable)
 * - Status badge (confirmed/missing/problem) with accessible color + text label
 * - Human-readable message from the audit engine
 * - Expandable/collapsible evidence list with actual file names or field paths
 *
 * Evidence semantics:
 * - If the check is "missing" and evidence is empty, explicitly says so.
 * - Evidence strings come directly from the audit engine — none are invented.
 * - The dirty-git warning and unpinned-dep problem are reflected via status.
 */

import React, { useState } from "react";
import type { AuditCheck, AuditDimension } from "@/lib/schema";
import { Badge } from "@/components/ui/Badge";

// ---------------------------------------------------------------------------
// Dimension label map
// ---------------------------------------------------------------------------

const DIMENSION_LABELS: Record<AuditDimension, string> = {
  git_revision: "Git Revision",
  random_seeds: "Random Seeds",
  dataset_identifiers: "Dataset Identifiers",
  eval_splits: "Evaluation Splits",
  dependency_versions: "Dependency Versions",
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AuditCheckRowProps {
  check: AuditCheck;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AuditCheckRow({ check }: AuditCheckRowProps) {
  const [expanded, setExpanded] = useState(false);

  const dimensionLabel = DIMENSION_LABELS[check.dimension];
  const hasEvidence = check.evidence.length > 0;

  return (
    <div className="border-b border-zinc-100 last:border-b-0 py-3">
      {/* ---- Row header ---- */}
      <div className="flex flex-wrap items-start gap-2">
        {/* Dimension label + badge */}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-zinc-800">
            {dimensionLabel}
          </span>
          <Badge variant={check.status} />
        </div>

        {/* Expand/collapse button — only shown when there is evidence */}
        {hasEvidence && (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={`evidence-${check.dimension}`}
            className="shrink-0 rounded p-0.5 text-xs text-zinc-500 underline hover:text-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded
              ? `Hide evidence for ${dimensionLabel}`
              : `Show evidence for ${dimensionLabel}`}
          </button>
        )}
      </div>

      {/* ---- Message ---- */}
      <p className="mt-1 text-sm text-zinc-600 leading-relaxed">
        {check.message}
      </p>

      {/* ---- Evidence ---- */}
      {check.status === "missing" && !hasEvidence && (
        <p className="mt-1 text-xs text-zinc-400 italic">
          No evidence files were found for this dimension.
        </p>
      )}

      {hasEvidence && expanded && (
        <ul
          id={`evidence-${check.dimension}`}
          aria-label={`Evidence files for ${dimensionLabel}`}
          className="mt-2 space-y-1 rounded-md bg-zinc-50 px-3 py-2"
        >
          {check.evidence.map((item, idx) => (
            <li
              key={idx}
              className="font-mono text-xs text-zinc-700 break-all"
            >
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
