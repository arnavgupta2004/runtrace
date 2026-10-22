/**
 * lib/parser/metrics.ts
 *
 * Parses metric values out of supported file formats.
 *
 * Supported formats
 * -----------------
 * CSV  (metrics.csv)
 *   Layout A — "wide row": one header row of metric names, one data row of values.
 *     accuracy,loss,f1
 *     0.92,0.08,0.91
 *
 *   Layout B — "metric-value columns": two-column CSV where first column is the
 *     metric name and the second is the value (optionally with a step/epoch
 *     column in between).  The LAST row wins for each metric name.
 *     metric,value
 *     accuracy,0.92
 *     loss,0.08
 *
 * JSON  (metrics.json, results.json, results_*.json)
 *   Flat object:           { "accuracy": 0.92, "loss": 0.08 }
 *   Array-valued object:   { "accuracy": [0.88, 0.90, 0.92] }   → last element
 *   Nested "metrics" key:  { "metrics": { "accuracy": 0.92 } }
 *
 * All non-numeric, null, NaN, and non-finite values are excluded.
 * The caller receives only finite, real numbers.
 */

import Papa from "papaparse";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns v if it is a finite number, otherwise undefined.
 * Rejects NaN, Infinity, -Infinity, null, strings, objects, etc.
 */
function finiteOrUndefined(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return undefined;
}

/**
 * Coerce a raw cell value (string or number) to a finite number.
 * Returns undefined if coercion fails or the result is non-finite.
 */
function coerceToFinite(v: unknown): number | undefined {
  if (typeof v === "number") return finiteOrUndefined(v);
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (trimmed === "") return undefined;
    const n = Number(trimmed);
    return finiteOrUndefined(n);
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// CSV parser
// ---------------------------------------------------------------------------

/**
 * Parse a CSV string and return a map of metric name → finite number.
 * Handles both "wide" (one header + one data row) and "metric-value"
 * (two-column name/value) layouts.
 *
 * @throws {Error} if the CSV is completely unparseable.
 */
export function parseMetricsCsv(content: string): Record<string, number> {
  if (content.trim() === "") return {};

  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false, // we do our own coercion with finite checks
  });

  if (result.errors.length > 0 && result.data.length === 0) {
    throw new Error(
      `CSV parse failed: ${result.errors[0].message}`
    );
  }

  const rows = result.data;
  if (rows.length === 0) return {};

  const headers = Object.keys(rows[0]);

  // -------------------------------------------------------------------------
  // Detect layout
  // -------------------------------------------------------------------------

  // Layout B detection: first column is a metric name column, second column
  // is "value" (case-insensitive), or there are exactly two columns where
  // the first column values look like strings (metric names) and the second
  // like numbers.
  const isMetricValueLayout =
    headers.length >= 2 &&
    (headers[1].toLowerCase() === "value" ||
      headers[1].toLowerCase() === "val" ||
      // heuristic: first header contains "name" or "metric"
      /name|metric/i.test(headers[0]));

  const metrics: Record<string, number> = {};

  if (isMetricValueLayout) {
    // Layout B — metric-value rows; last row for each metric name wins.
    const nameCol = headers[0];
    const valueCol = headers[1];
    for (const row of rows) {
      const metricName = String(row[nameCol] ?? "").trim();
      if (!metricName) continue;
      const val = coerceToFinite(row[valueCol]);
      if (val !== undefined) {
        metrics[metricName] = val;
      }
    }
  } else {
    // Layout A — wide row(s); use the LAST data row.
    const lastRow = rows[rows.length - 1];
    for (const col of headers) {
      const val = coerceToFinite(lastRow[col]);
      if (val !== undefined) {
        metrics[col] = val;
      }
    }
  }

  return metrics;
}

// ---------------------------------------------------------------------------
// JSON parser
// ---------------------------------------------------------------------------

/**
 * Parse a JSON string and return a map of metric name → finite number.
 * Handles flat objects, array-valued objects (last element used),
 * and objects with a top-level "metrics" key.
 *
 * @throws {Error} if the JSON is syntactically invalid.
 */
export function parseMetricsJson(content: string): Record<string, number> {
  if (content.trim() === "") return {};

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch (e) {
    throw new Error(`JSON parse failed: ${(e as Error).message}`);
  }

  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  // Unwrap a top-level "metrics" key if present and object-shaped.
  const obj = raw as Record<string, unknown>;
  const source: Record<string, unknown> =
    obj["metrics"] !== null &&
    typeof obj["metrics"] === "object" &&
    !Array.isArray(obj["metrics"])
      ? (obj["metrics"] as Record<string, unknown>)
      : obj;

  const metrics: Record<string, number> = {};
  for (const [key, value] of Object.entries(source)) {
    if (Array.isArray(value)) {
      // Array-valued: use the last element.
      const last = value[value.length - 1];
      const v = finiteOrUndefined(last);
      if (v !== undefined) metrics[key] = v;
    } else {
      const v = finiteOrUndefined(value);
      if (v !== undefined) metrics[key] = v;
    }
  }

  return metrics;
}
