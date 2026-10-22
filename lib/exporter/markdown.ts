/**
 * lib/exporter/markdown.ts
 *
 * Pure Markdown report generator for Runtrace.
 *
 * Public API
 * ----------
 *   toMarkdown(payload: ExportPayload, options?: MarkdownOptions): string
 *
 * The function is pure: no DOM access, no side effects, no external calls.
 * Identical inputs always produce identical output.
 *
 * Date injection
 * --------------
 * The report date is passed in via options.generatedAt (ISO string) or
 * defaults to new Date().toISOString() at call time.  Tests should pass a
 * fixed date string to get deterministic output.
 *
 * Markdown table safety
 * ---------------------
 * All user-supplied strings (run names, file paths, messages) are passed
 * through escapeMdCell() before being placed inside table cells.  This
 * replaces pipe characters (|) and strips literal newlines, which would
 * break the table structure.  Inline code spans are used for file paths.
 *
 * Non-finite metric values
 * ------------------------
 * The schema guarantees run.metrics contains only finite values; the
 * exporter relies on that contract.  RankedRun.metricValue is number | null;
 * null is rendered as "—" (not as "0" or "NaN").  If a non-finite number
 * somehow reaches the exporter it is rendered as "invalid" with a note.
 *
 * Scientific claims
 * -----------------
 * The exporter never states that one run is "better", "superior", or
 * "more reproducible" than another.  Compatibility warnings and audit
 * messages are reproduced verbatim from the structured data.
 */

import type {
  ExportPayload,
  RankedRun,
  AuditReport,
  AuditCheck,
  AuditDimension,
  CompatibilityStatus,
} from "@/lib/schema";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface MarkdownOptions {
  /**
   * ISO 8601 string used as the report generation date.
   * Defaults to new Date().toISOString() if not provided.
   * Pass a fixed value in tests for deterministic output.
   */
  generatedAt?: string;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Serialise an ExportPayload to a Markdown string.
 * The payload is not mutated.
 */
export function toMarkdown(
  payload: ExportPayload,
  options: MarkdownOptions = {}
): string {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const { comparison, audits } = payload;

  const sections: string[] = [];

  // Title
  sections.push(`# Runtrace Report`);
  sections.push(`\n_Generated: ${generatedAt}_\n`);

  // Comparison overview
  sections.push(`## Comparison Overview`);
  sections.push(
    `- **Metric:** \`${escapeMdInline(comparison.metric)}\`\n` +
    `- **Direction:** ${comparison.direction}\n` +
    `- **Runs compared:** ${comparison.runs.length}`
  );

  // Compatibility notice
  sections.push(renderCompatibility(comparison.compatibility.status, comparison.compatibility.reason));

  // Ranking table
  sections.push(`## Metric Rankings`);
  sections.push(renderRankingTable(comparison.ranking, comparison.metric));

  // Per-run audit sections
  if (audits.length > 0) {
    sections.push(`## Reproducibility Audits`);
    for (const audit of audits) {
      // Find the matching run name
      const run = comparison.runs.find((r) => r.id === audit.runId);
      const displayName = run ? run.name : audit.runId;
      sections.push(renderAuditSection(audit, displayName));
    }
  }

  // Limitations
  sections.push(renderLimitations());

  return sections.join("\n\n");
}

// ---------------------------------------------------------------------------
// Compatibility section
// ---------------------------------------------------------------------------

const COMPATIBILITY_LABELS: Record<CompatibilityStatus, string> = {
  compatible: "✅ Compatible",
  mismatch: "⚠️ Mismatch Detected",
  unverified: "❓ Unverified",
};

function renderCompatibility(status: CompatibilityStatus, reason: string): string {
  const label = COMPATIBILITY_LABELS[status];
  const lines: string[] = [`### Dataset / Split Compatibility: ${label}`];

  if (status === "mismatch") {
    lines.push(
      `> ⚠️ **Warning:** ${escapeMdBlockquote(reason)}`
    );
  } else if (status === "unverified") {
    lines.push(
      `> ℹ️ **Note:** ${escapeMdBlockquote(reason)}`
    );
  } else {
    lines.push(reason);
  }

  return lines.join("\n\n");
}

// ---------------------------------------------------------------------------
// Ranking table
// ---------------------------------------------------------------------------

function renderRankingTable(ranking: RankedRun[], metric: string): string {
  if (ranking.length === 0) {
    return "_No runs to display._";
  }

  const header = `| Rank | Run | \`${escapeMdCell(metric)}\` | Delta |`;
  const divider = `|------|-----|-------|-------|`;

  const rows = ranking.map((r) => {
    const rank = String(r.rank);
    const name = escapeMdCell(r.run.name);
    const value = formatMetricValue(r.metricValue);
    const delta = formatDelta(r.delta);
    return `| ${rank} | ${name} | ${value} | ${delta} |`;
  });

  return [header, divider, ...rows].join("\n");
}

// ---------------------------------------------------------------------------
// Audit section
// ---------------------------------------------------------------------------

const AUDIT_SCORE_LABELS: Record<string, string> = {
  good: "✅ Good",
  partial: "⚠️ Partial",
  poor: "❌ Poor",
};

const DIMENSION_LABELS: Record<AuditDimension, string> = {
  git_revision: "Git Revision",
  random_seeds: "Random Seeds",
  dataset_identifiers: "Dataset Identifiers",
  eval_splits: "Evaluation Splits",
  dependency_versions: "Dependency Versions",
};

const STATUS_LABELS: Record<string, string> = {
  confirmed: "✅ Confirmed",
  missing: "❓ Missing",
  problem: "⚠️ Problem",
};

function renderAuditSection(audit: AuditReport, displayName: string): string {
  const scoreLabel = AUDIT_SCORE_LABELS[audit.overallScore] ?? audit.overallScore;
  const lines: string[] = [
    `### Run: ${escapeMdHeading(displayName)}`,
    `**Overall reproducibility score:** ${scoreLabel}`,
    "",
    "| Dimension | Status | Summary |",
    "|-----------|--------|---------|",
  ];

  for (const check of audit.checks) {
    lines.push(renderAuditCheckRow(check));
  }

  // Evidence detail block (below the table)
  const checksWithEvidence = audit.checks.filter((c) => c.evidence.length > 0);
  if (checksWithEvidence.length > 0) {
    lines.push("");
    lines.push("**Evidence sources:**");
    for (const check of checksWithEvidence) {
      const dimLabel = DIMENSION_LABELS[check.dimension] ?? check.dimension;
      const paths = check.evidence
        .map((e) => `\`${escapeMdInline(e)}\``)
        .join(", ");
      lines.push(`- **${dimLabel}:** ${paths}`);
    }
  }

  return lines.join("\n");
}

function renderAuditCheckRow(check: AuditCheck): string {
  const dim = escapeMdCell(DIMENSION_LABELS[check.dimension] ?? check.dimension);
  const status = STATUS_LABELS[check.status] ?? check.status;
  const message = escapeMdCell(check.message);
  return `| ${dim} | ${status} | ${message} |`;
}

// ---------------------------------------------------------------------------
// Limitations section
// ---------------------------------------------------------------------------

function renderLimitations(): string {
  return [
    `## Limitations`,
    ``,
    `- A **good** audit score means all five metadata dimensions were recorded.`,
    `  It does not prove that an experiment is perfectly reproducible or that`,
    `  results are directly comparable across runs.`,
    `- Recorded metadata (git revisions, seeds, dataset names) confirms that`,
    `  information was captured — it does not verify dataset integrity,`,
    `  package authenticity, or hardware equivalence.`,
    `- A **compatible** comparison status means the same dataset identifiers`,
    `  and evaluation splits were reported. It does not guarantee identical`,
    `  data preprocessing, splits, or evaluation protocols.`,
    `- Missing metadata is reported as absent. No values are inferred or`,
    `  fabricated.`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/**
 * Format a metric value for display in a Markdown table cell.
 * null → "—" (em dash, clearly absent).
 * Non-finite numbers (should not appear per schema) → "invalid".
 * Finite numbers → up to 6 significant figures.
 */
function formatMetricValue(value: number | null): string {
  if (value === null) return "—";
  if (!Number.isFinite(value)) return "_invalid_";
  // Use toPrecision(6) and strip trailing zeros for readability.
  return stripTrailingZeros(value.toPrecision(6));
}

/**
 * Format a delta value.
 * null → "—".
 * 0 → "0" (explicitly, for rank-1 run).
 * Positive → "+X.XXXXXX".
 * Negative → "−X.XXXXXX" (using proper minus sign for readability).
 */
function formatDelta(delta: number | null): string {
  if (delta === null) return "—";
  if (!Number.isFinite(delta)) return "_invalid_";
  if (delta === 0) return "0";
  const abs = stripTrailingZeros(Math.abs(delta).toPrecision(6));
  return delta > 0 ? `+${abs}` : `−${abs}`;
}

function stripTrailingZeros(s: string): string {
  // If the string contains a decimal point, strip trailing zeros after it.
  if (!s.includes(".")) return s;
  return s.replace(/\.?0+$/, "");
}

/**
 * Escape a string for use inside a Markdown table cell.
 * Replaces pipe characters with a safe visual equivalent and strips
 * literal newlines (which would break the table row).
 */
export function escapeMdCell(s: string): string {
  return s
    .replace(/\r?\n|\r/g, " ")   // collapse newlines to space
    .replace(/\|/g, "&#124;");   // escape pipes
}

/**
 * Escape a string for use inside a Markdown inline code span (backtick).
 * Backticks inside the value break the code span; replace them with a
 * typographic equivalent.  Pipe characters are also escaped because evidence
 * paths are rendered in list items adjacent to tables and some renderers
 * treat unescaped | inside list items specially.
 */
export function escapeMdInline(s: string): string {
  return s
    .replace(/\r?\n|\r/g, " ")
    .replace(/`/g, "ʼ")          // replace backtick with modifier letter apostrophe
    .replace(/\|/g, "&#124;");   // escape pipes
}

/**
 * Escape a string for use in a Markdown heading.
 * ATX headings (## …) break if the text contains a newline; strip them.
 */
export function escapeMdHeading(s: string): string {
  return s.replace(/\r?\n|\r/g, " ");
}

/**
 * Escape a string for use inside a Markdown blockquote continuation.
 * Bare newlines inside a blockquote line produce unexpected paragraph breaks.
 */
export function escapeMdBlockquote(s: string): string {
  // Replace newlines with a space — the blockquote is a single-line annotation.
  return s.replace(/\r?\n|\r/g, " ");
}
