"use client";

/**
 * components/comparison/MetricChart.tsx
 *
 * Bar chart of the selected metric across runs, powered by Recharts.
 *
 * - Uses ComparisonResult directly — no data fabrication.
 * - Omits bars for runs with null metricValue (missing metric).
 * - Handles single run, all-missing, negative values, and ties.
 * - Provides a visible accessible text summary so the chart is never the
 *   only way to inspect results.
 * - Wrapped in a ResponsiveContainer for responsive layout.
 * - No animations — keeps the chart simple and fast.
 */

import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  CartesianGrid,
} from "recharts";
import type { ComparisonResult, RankedRun } from "@/lib/schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChartEntry {
  name: string;
  value: number;
  rank: number;
  isFirst: boolean;
}

// ---------------------------------------------------------------------------
// Custom tooltip
// ---------------------------------------------------------------------------

interface TooltipPayloadItem {
  payload: ChartEntry;
  value: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  metric: string;
}

function CustomTooltip({ active, payload, metric }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const entry = payload[0].payload;
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 shadow-md text-sm">
      <p className="font-semibold text-zinc-900 truncate max-w-[200px]" title={entry.name}>
        {entry.name}
      </p>
      <p className="text-zinc-600">
        <span className="font-mono">{entry.value}</span>
        <span className="ml-1 text-zinc-400">({metric})</span>
      </p>
      <p className="text-zinc-400 text-xs">Rank #{entry.rank}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Accessible text summary (screen-reader and no-chart fallback)
// ---------------------------------------------------------------------------

function AccessibleSummary({
  plotted,
  omitted,
  metric,
}: {
  plotted: RankedRun[];
  omitted: RankedRun[];
  metric: string;
}) {
  return (
    <table className="sr-only" aria-label={`${metric} values by run`}>
      <thead>
        <tr>
          <th scope="col">Rank</th>
          <th scope="col">Run</th>
          <th scope="col">{metric}</th>
        </tr>
      </thead>
      <tbody>
        {plotted.map((r) => (
          <tr key={r.run.id}>
            <td>#{r.rank}</td>
            <td>{r.run.name}</td>
            <td>{r.metricValue}</td>
          </tr>
        ))}
        {omitted.map((r) => (
          <tr key={r.run.id}>
            <td>—</td>
            <td>{r.run.name}</td>
            <td>N/A</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// MetricChart
// ---------------------------------------------------------------------------

export interface MetricChartProps {
  result: ComparisonResult;
}

export function MetricChart({ result }: MetricChartProps) {
  const { ranking, metric, direction } = result;

  // Split into plotted (has value) and omitted (null).
  const plotted = ranking.filter((r): r is RankedRun & { metricValue: number } =>
    r.metricValue !== null
  );
  const omitted = ranking.filter((r) => r.metricValue === null);

  // Build chart data from ranked order (already sorted by comparator).
  const data: ChartEntry[] = plotted.map((r) => ({
    name: r.run.name,
    value: r.metricValue,
    rank: r.rank,
    isFirst: r.rank === 1,
  }));

  const directionLabel = direction === "maximize" ? "↑ higher is better" : "↓ lower is better";

  // Compute a Y-axis domain that includes zero for context,
  // unless all values are far from zero (e.g. all negative, or all > 10).
  function computeDomain(values: number[]): [number | "auto", number | "auto"] {
    if (values.length === 0) return ["auto", "auto"];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const padding = range * 0.1;
    const domainMin = min >= 0 ? 0 : min - padding;
    const domainMax = max + padding;
    return [domainMin, domainMax];
  }

  const domain = computeDomain(data.map((d) => d.value));

  // Empty state
  if (data.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <AccessibleSummary plotted={[]} omitted={omitted} metric={metric} />
        <div className="flex items-center justify-center rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-10 text-sm text-zinc-400">
          No runs have a value for <span className="mx-1 font-mono font-medium text-zinc-600">{metric}</span> — nothing to plot.
        </div>
        {omitted.length > 0 && (
          <p className="text-xs text-zinc-400">
            {omitted.length} run{omitted.length !== 1 ? "s" : ""} omitted (no value for this metric).
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Accessible hidden summary */}
      <AccessibleSummary plotted={plotted} omitted={omitted} metric={metric} />

      {/* Direction label */}
      <p className="text-xs text-zinc-500" aria-label={`Optimization direction: ${directionLabel}`}>
        <span className="font-medium">{metric}</span>
        <span className="ml-2 text-zinc-400">{directionLabel}</span>
      </p>

      {/* Chart */}
      <div style={{ width: "100%", height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
            barCategoryGap="30%"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: "#71717a" }}
              tickLine={false}
              axisLine={false}
              interval={0}
              // Truncate long names
              tickFormatter={(v: string) => v.length > 14 ? v.slice(0, 13) + "…" : v}
            />
            <YAxis
              domain={domain}
              tick={{ fontSize: 11, fill: "#71717a" }}
              tickLine={false}
              axisLine={false}
              width={50}
            />
            <Tooltip
              content={<CustomTooltip metric={metric} />}
              cursor={{ fill: "#f4f4f5" }}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {data.map((entry) => (
                <Cell
                  key={entry.name}
                  fill={entry.isFirst ? "#3b82f6" : "#93c5fd"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Omitted runs notice */}
      {omitted.length > 0 && (
        <p className="text-xs text-zinc-400">
          {omitted.length} run{omitted.length !== 1 ? "s" : ""} omitted from chart (no value for{" "}
          <span className="font-mono">{metric}</span>
          ). They appear in the table above as N/A.
        </p>
      )}
    </div>
  );
}
