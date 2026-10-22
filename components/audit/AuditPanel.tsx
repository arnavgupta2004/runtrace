"use client";

/**
 * components/audit/AuditPanel.tsx
 *
 * Reproducibility audit panel for a single experiment run.
 *
 * Shows:
 * - Run name and overall score badge in the header
 * - Explanation of the score semantics (rule-based summary, not a probability)
 * - All five audit dimension checks via AuditCheckRow
 *
 * The panel calls auditRun() directly from the audit engine — no hardcoded
 * results, no duplicated rules, no fabricated evidence.
 *
 * Score semantics (from lib/auditor/index.ts):
 *   good    — all five checks are confirmed
 *   partial — no problems found, but at least one check is missing evidence
 *   poor    — at least one check reports a known problem
 *
 * These are rule-based descriptive labels, not statistical confidence scores
 * or guarantees of reproducibility.
 */

import React from "react";
import type { ExperimentRun } from "@/lib/schema";
import { auditRun } from "@/lib/auditor";
import { Badge } from "@/components/ui/Badge";
import { AuditCheckRow } from "./AuditCheckRow";

// ---------------------------------------------------------------------------
// Score explanation strings
// ---------------------------------------------------------------------------

const SCORE_DESCRIPTION: Record<string, string> = {
  good:
    "All five reproducibility dimensions have recorded metadata. " +
    "This is a rule-based summary, not a guarantee of reproducibility.",
  partial:
    "No known problems were found, but at least one dimension is missing evidence. " +
    "This is a rule-based summary, not a statistical confidence estimate.",
  poor:
    "At least one dimension reports a known reproducibility risk. " +
    "This is a rule-based summary, not a confirmation that reproduction will fail.",
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AuditPanelProps {
  run: ExperimentRun;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AuditPanel({ run }: AuditPanelProps) {
  const report = auditRun(run);
  const scoreDescription = SCORE_DESCRIPTION[report.overallScore] ?? "";

  return (
    <article
      aria-label={`Reproducibility audit for ${run.name}`}
      className="rounded-xl border border-zinc-200 bg-white shadow-sm"
    >
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                               */}
      {/* ------------------------------------------------------------------ */}
      <header className="flex flex-wrap items-start gap-3 border-b border-zinc-100 px-4 py-3">
        <div className="min-w-0 flex-1">
          <h3
            className="truncate text-sm font-semibold text-zinc-900"
            title={run.name}
          >
            {run.name}
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500">Reproducibility audit</p>
        </div>

        {/* Overall score badge */}
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <Badge
            variant={report.overallScore}
            aria-label={`Overall score: ${report.overallScore}`}
          />
          <span className="text-xs text-zinc-400 capitalize">
            {report.overallScore}
          </span>
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Score explanation                                                    */}
      {/* ------------------------------------------------------------------ */}
      <div className="px-4 py-2 text-xs text-zinc-500 bg-zinc-50 border-b border-zinc-100">
        {scoreDescription}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Audit checks                                                         */}
      {/* ------------------------------------------------------------------ */}
      <div className="px-4">
        {report.checks.map((check) => (
          <AuditCheckRow key={check.dimension} check={check} />
        ))}
      </div>
    </article>
  );
}
