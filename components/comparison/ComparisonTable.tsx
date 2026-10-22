"use client";

/**
 * components/comparison/ComparisonTable.tsx
 *
 * Tabular display of a ComparisonResult.
 *
 * - Uses the comparator's ranking directly — no duplicate logic.
 * - Distinguishes missing metric values (null) from zero.
 * - Shows delta with sign; rank-1 delta is explicitly 0.
 * - Renders compatibility warnings for "mismatch" and "unverified" statuses.
 * - Handles empty runs, single runs, and ties.
 * - Accessible: semantic <table>, <th scope>, visible focus rings.
 */

import React from "react";
import type { ComparisonResult, RankedRun, CompatibilityStatus } from "@/lib/schema";

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/** Format a finite number to at most 6 significant figures, no trailing zeros. */
function formatValue(value: number): string {
  // Use toPrecision to limit significant digits, then strip trailing zeros.
  const s = value.toPrecision(6);
  // Convert "1.23400e+2" style back to regular if needed
  const n = Number(s);
  // Display at most 6 significant digits, avoid scientific notation for reasonable ranges
  if (Math.abs(n) >= 1e-4 && Math.abs(n) < 1e7) {
    return parseFloat(n.toPrecision(6)).toString();
  }
  return n.toExponential(3);
}

/** Format delta with an explicit +/- sign. */
function formatDelta(delta: number): string {
  if (delta === 0) return "—";
  const prefix = delta > 0 ? "+" : "";
  return `${prefix}${formatValue(delta)}`;
}

// ---------------------------------------------------------------------------
// Rank badge
// ---------------------------------------------------------------------------

function RankBadge({ rank, tied }: { rank: number; tied: boolean }) {
  const isFirst = rank === 1;
  return (
    <span
      className={[
        "inline-flex items-center justify-center rounded-full text-xs font-bold",
        "h-6 min-w-[1.5rem] px-1.5",
        isFirst
          ? "bg-amber-100 text-amber-800"
          : "bg-zinc-100 text-zinc-600",
      ].join(" ")}
      title={tied ? "Tied rank" : undefined}
    >
      {tied ? `=${rank}` : `#${rank}`}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Compatibility banner
// ---------------------------------------------------------------------------

interface CompatibilityBannerProps {
  status: CompatibilityStatus;
  reason: string;
  datasetNames: string[];
  splitNames: string[];
}

function CompatibilityBanner({
  status,
  reason,
  datasetNames,
  splitNames,
}: CompatibilityBannerProps) {
  if (status === "compatible") return null;

  const isMismatch = status === "mismatch";

  return (
    <div
      role="alert"
      aria-live="polite"
      className={[
        "rounded-lg border px-4 py-3 text-sm",
        isMismatch
          ? "border-amber-300 bg-amber-50 text-amber-900"
          : "border-blue-200 bg-blue-50 text-blue-900",
      ].join(" ")}
    >
      <div className="flex items-start gap-2">
        <svg
          aria-hidden="true"
          className={`mt-0.5 h-4 w-4 shrink-0 ${isMismatch ? "text-amber-600" : "text-blue-500"}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          {isMismatch ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
            />
          )}
        </svg>
        <div className="min-w-0">
          <p className="font-semibold">
            {isMismatch
              ? "Dataset or evaluation split mismatch — metric ranking may not represent a fair scientific comparison."
              : "Dataset / split metadata missing — compatibility cannot be verified."}
          </p>
          <p className="mt-0.5 text-xs opacity-80">{reason}</p>
          {(datasetNames.length > 0 || splitNames.length > 0) && (
            <p className="mt-1 text-xs opacity-70">
              {datasetNames.length > 0 && (
                <span>Datasets: {datasetNames.join(", ")}. </span>
              )}
              {splitNames.length > 0 && (
                <span>Splits: {splitNames.join(", ")}.</span>
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function TableRow({
  rankedRun,
  isTied,
  metricName,
}: {
  rankedRun: RankedRun;
  isTied: boolean;
  metricName: string;
}) {
  const { run, rank, metricValue, delta } = rankedRun;
  const hasMissing = metricValue === null;

  return (
    <tr className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50 transition-colors">
      <td className="py-3 pl-4 pr-3 text-sm">
        <RankBadge rank={rank} tied={isTied} />
      </td>
      <td
        className="py-3 px-3 text-sm font-medium text-zinc-900 max-w-[200px]"
        title={run.name}
      >
        <span className="block truncate">{run.name}</span>
      </td>
      <td className="py-3 px-3 text-sm text-right font-mono">
        {hasMissing ? (
          <span
            className="text-zinc-400 italic"
            title={`No value for "${metricName}" in this run`}
          >
            N/A
          </span>
        ) : (
          <span className="text-zinc-900">{formatValue(metricValue)}</span>
        )}
      </td>
      <td className="py-3 pl-3 pr-4 text-sm text-right font-mono">
        {hasMissing || delta === null ? (
          <span className="text-zinc-300">—</span>
        ) : delta === 0 ? (
          <span className="text-zinc-400" title="Best run (rank 1)">—</span>
        ) : (
          <span className={delta < 0 ? "text-red-600" : "text-emerald-600"}>
            {formatDelta(delta)}
          </span>
        )}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// ComparisonTable
// ---------------------------------------------------------------------------

export interface ComparisonTableProps {
  result: ComparisonResult;
}

export function ComparisonTable({ result }: ComparisonTableProps) {
  const { ranking, metric, direction, compatibility } = result;

  if (ranking.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white px-4 py-8 text-center text-sm text-zinc-400">
        No runs to compare.
      </div>
    );
  }

  // Determine which ranks appear more than once (ties).
  const rankCounts = new Map<number, number>();
  for (const r of ranking) {
    rankCounts.set(r.rank, (rankCounts.get(r.rank) ?? 0) + 1);
  }
  const isTied = (rank: number) => (rankCounts.get(rank) ?? 0) > 1;

  const directionLabel = direction === "maximize" ? "↑ higher is better" : "↓ lower is better";

  return (
    <div className="flex flex-col gap-3">
      {/* Compatibility warning */}
      <CompatibilityBanner
        status={compatibility.status}
        reason={compatibility.reason}
        datasetNames={compatibility.datasetNames}
        splitNames={compatibility.splitNames}
      />

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
        <table className="w-full min-w-[400px] border-collapse text-left">
          <caption className="sr-only">
            Comparison of runs ranked by {metric} ({direction})
          </caption>
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <th scope="col" className="py-3 pl-4 pr-3 w-16">
                Rank
              </th>
              <th scope="col" className="py-3 px-3">
                Run
              </th>
              <th scope="col" className="py-3 px-3 text-right">
                <span title={directionLabel}>{metric}</span>
                <span className="ml-1 text-zinc-400 normal-case font-normal">
                  ({direction === "maximize" ? "↑" : "↓"})
                </span>
              </th>
              <th scope="col" className="py-3 pl-3 pr-4 text-right">
                Δ from best
              </th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((rankedRun) => (
              <TableRow
                key={rankedRun.run.id}
                rankedRun={rankedRun}
                isTied={isTied(rankedRun.rank)}
                metricName={metric}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer note */}
      <p className="text-xs text-zinc-400">
        Ranking order is determined by the selected metric and direction. Ranking first
        does not establish scientific superiority.
      </p>
    </div>
  );
}
