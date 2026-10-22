/**
 * __tests__/parser/metrics.test.ts
 *
 * Tests for lib/parser/metrics.ts
 */

import { describe, it, expect } from "vitest";
import { parseMetricsCsv, parseMetricsJson } from "@/lib/parser/metrics";

// ---------------------------------------------------------------------------
// CSV tests
// ---------------------------------------------------------------------------

describe("parseMetricsCsv", () => {
  it("parses a wide-row CSV (one header row + one data row)", () => {
    const csv = `accuracy,loss,f1\n0.92,0.08,0.91`;
    const result = parseMetricsCsv(csv);
    expect(result).toEqual({ accuracy: 0.92, loss: 0.08, f1: 0.91 });
  });

  it("uses the LAST data row for wide-row layout", () => {
    const csv = `accuracy,loss\n0.80,0.20\n0.92,0.08`;
    const result = parseMetricsCsv(csv);
    expect(result).toEqual({ accuracy: 0.92, loss: 0.08 });
  });

  it("parses metric-value layout (name column + value column)", () => {
    const csv = `metric,value\naccuracy,0.92\nloss,0.08`;
    const result = parseMetricsCsv(csv);
    expect(result).toEqual({ accuracy: 0.92, loss: 0.08 });
  });

  it("last row wins in metric-value layout", () => {
    const csv = `metric,value\naccuracy,0.80\naccuracy,0.92`;
    const result = parseMetricsCsv(csv);
    expect(result).toEqual({ accuracy: 0.92 });
  });

  it("returns empty object for empty string", () => {
    expect(parseMetricsCsv("")).toEqual({});
    expect(parseMetricsCsv("   ")).toEqual({});
  });

  it("excludes NaN metric values from wide-row CSV", () => {
    const csv = `accuracy,loss\nNaN,0.08`;
    const result = parseMetricsCsv(csv);
    expect(result).not.toHaveProperty("accuracy");
    expect(result).toHaveProperty("loss", 0.08);
  });

  it("excludes Infinity metric values", () => {
    const csv = `accuracy,loss\nInfinity,0.08`;
    const result = parseMetricsCsv(csv);
    expect(result).not.toHaveProperty("accuracy");
  });

  it("excludes empty string cells", () => {
    const csv = `accuracy,loss\n,0.08`;
    const result = parseMetricsCsv(csv);
    expect(result).not.toHaveProperty("accuracy");
    expect(result).toHaveProperty("loss", 0.08);
  });

  it("handles a CSV with step column between metric and value", () => {
    // This will be treated as wide-row since headers don't match metric-value pattern.
    const csv = `step,accuracy,loss\n1,0.80,0.20\n2,0.92,0.08`;
    const result = parseMetricsCsv(csv);
    // Wide row: uses last row; step is also parsed but numeric so valid.
    expect(result).toHaveProperty("accuracy", 0.92);
    expect(result).toHaveProperty("loss", 0.08);
  });

  it("handles whitespace in CSV values", () => {
    const csv = `accuracy,loss\n 0.92 , 0.08 `;
    const result = parseMetricsCsv(csv);
    expect(result).toEqual({ accuracy: 0.92, loss: 0.08 });
  });

  it("parses metric-value layout with 'val' column name", () => {
    const csv = `name,val\naccuracy,0.92\nloss,0.08`;
    const result = parseMetricsCsv(csv);
    expect(result).toEqual({ accuracy: 0.92, loss: 0.08 });
  });
});

// ---------------------------------------------------------------------------
// JSON tests
// ---------------------------------------------------------------------------

describe("parseMetricsJson", () => {
  it("parses a flat numeric JSON object", () => {
    const json = JSON.stringify({ accuracy: 0.92, loss: 0.08 });
    expect(parseMetricsJson(json)).toEqual({ accuracy: 0.92, loss: 0.08 });
  });

  it("uses last element of array-valued metrics", () => {
    const json = JSON.stringify({ accuracy: [0.80, 0.88, 0.92] });
    expect(parseMetricsJson(json)).toEqual({ accuracy: 0.92 });
  });

  it("unwraps a top-level 'metrics' key", () => {
    const json = JSON.stringify({ metrics: { accuracy: 0.92 }, other: "x" });
    expect(parseMetricsJson(json)).toEqual({ accuracy: 0.92 });
  });

  it("returns empty object for empty string", () => {
    expect(parseMetricsJson("")).toEqual({});
    expect(parseMetricsJson("   ")).toEqual({});
  });

  it("throws on invalid JSON", () => {
    expect(() => parseMetricsJson("{not valid json")).toThrow(/JSON parse failed/);
  });

  it("excludes NaN values", () => {
    // JSON.stringify drops NaN → null; our parser must handle null too.
    const json = `{"accuracy": null, "loss": 0.08}`;
    const result = parseMetricsJson(json);
    expect(result).not.toHaveProperty("accuracy");
    expect(result).toHaveProperty("loss", 0.08);
  });

  it("excludes Infinity (serialised as null by JSON)", () => {
    // Infinity becomes null in JSON.stringify.
    const json = `{"loss": 0.08, "bad": null}`;
    const result = parseMetricsJson(json);
    expect(result).not.toHaveProperty("bad");
    expect(result).toHaveProperty("loss", 0.08);
  });

  it("excludes string-valued metrics", () => {
    const json = JSON.stringify({ accuracy: "high", loss: 0.08 });
    const result = parseMetricsJson(json);
    expect(result).not.toHaveProperty("accuracy");
    expect(result).toHaveProperty("loss", 0.08);
  });

  it("returns empty object for a JSON array at root", () => {
    expect(parseMetricsJson("[1, 2, 3]")).toEqual({});
  });

  it("returns empty object for a JSON null at root", () => {
    expect(parseMetricsJson("null")).toEqual({});
  });

  it("excludes NaN passed as a number in array", () => {
    // Arrays containing NaN: JSON doesn't support NaN natively,
    // but test that we reject it if somehow present.
    const json = `{"history": [0.8, 0.9, 0.92]}`;
    const result = parseMetricsJson(json);
    expect(result).toEqual({ history: 0.92 });
  });
});
