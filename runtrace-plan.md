# Runtrace — MVP Implementation Plan

## Top-Level Overview

**Goal:** Build a polished, local-first web application for ML experiment comparison and reproducibility auditing, deployable as a static site with zero server-side requirements.

**Scope:**
- Browser-only ZIP parsing of ML experiment artifact bundles
- Side-by-side metric comparison across runs
- Reproducibility audit engine with evidence grading
- Markdown and JSON export
- Full automated test coverage (Vitest + React Testing Library, written alongside each module)

**Approach:** Next.js App Router (`output: "export"` static site), TypeScript strict mode, Tailwind CSS, Recharts, JSZip, PapaParse, js-yaml. All computation runs client-side; no data ever leaves the browser. Deploy to Vercel (primary) or any static CDN (alternative).

**Deadline:** October 30, 2026

**Non-Goals:**
- Server-side storage, API routes, authentication, or user accounts
- Weights & Biases API integration (not in MVP)
- Real-time collaboration
- Training orchestration
- Scatter plots or parallel-coordinates visualizations (deferred post-MVP)
- Mobile-specific layouts
- Telemetry, cloud storage, or any external data processing service

---

## Architecture

### Data Flow

```
User drops ZIP files
  → JSZip unpacks in browser
  → Artifact parsers extract structured ExperimentRun objects
  → Comparison engine ranks runs by user-selected metric
  → Audit engine scores each run on reproducibility dimensions
  → UI renders comparison table + audit panels
  → Export serializes to Markdown / JSON
```

### Module Boundaries

| Module | Responsibility |
|--------|---------------|
| `lib/parser/` | ZIP ingestion, file type dispatch, ExperimentRun construction |
| `lib/comparator/` | Metric extraction, ranking, diff computation |
| `lib/auditor/` | Reproducibility rule checks, evidence grading |
| `lib/exporter/` | Markdown and JSON serialization |
| `lib/schema.ts` | Canonical TypeScript types shared across all modules |
| `components/` | React UI components (upload, comparison table, audit panel, export) |
| `app/` | Next.js App Router pages and layout |
| `__tests__/` | Unit and integration tests (Vitest) |

---

## Data Schema (`lib/schema.ts`)

```ts
// Core artifact types
ExperimentRun {
  id: string                    // derived from ZIP filename
  name: string
  metadata: RunMetadata
  metrics: Record<string, number>
  artifacts: ArtifactIndex
}

RunMetadata {
  gitRevision?: string
  gitDirty?: boolean
  randomSeeds: Record<string, number>   // key = library/component name
  datasetIdentifiers: DatasetRef[]
  evalSplits: EvalSplit[]
  dependencyVersions: Record<string, string>
  framework?: string
  timestamp?: string
}

DatasetRef { name: string; version?: string; hash?: string }
EvalSplit  { name: string; size?: number; hash?: string }

ArtifactIndex {
  metricsFile?: ParsedMetrics
  configFiles: ParsedConfig[]
  requirementsFile?: Record<string, string>
  rawFiles: string[]            // filenames only, for audit evidence
}

// Comparison types
ComparisonResult {
  runs: ExperimentRun[]
  metric: string
  direction: "maximize" | "minimize"
  ranking: RankedRun[]
}

RankedRun {
  run: ExperimentRun
  rank: number
  metricValue: number | null
  delta: number | null          // diff from rank-1
}

// Audit types
AuditReport {
  runId: string
  checks: AuditCheck[]
  overallScore: AuditScore      // "good" | "partial" | "poor"
}

AuditCheck {
  dimension: AuditDimension
  status: "confirmed" | "missing" | "problem"
  evidence: string[]            // filenames / field paths that back the finding
  message: string
}

AuditDimension =
  | "git_revision"
  | "random_seeds"
  | "dataset_identifiers"
  | "eval_splits"
  | "dependency_versions"

// Export types
ExportPayload { comparison: ComparisonResult; audits: AuditReport[] }
```

---

## File Structure

```
runtrace/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                  # single-page app shell
│   └── globals.css
├── components/
│   ├── upload/
│   │   └── DropZone.tsx
│   ├── comparison/
│   │   ├── MetricSelector.tsx
│   │   ├── ComparisonTable.tsx
│   │   └── MetricChart.tsx
│   ├── audit/
│   │   ├── AuditPanel.tsx
│   │   └── AuditCheckRow.tsx
│   ├── export/
│   │   └── ExportButtons.tsx
│   └── ui/
│       └── Badge.tsx             # status badge (confirmed/missing/problem)
├── lib/
│   ├── schema.ts
│   ├── parser/
│   │   ├── index.ts              # entry: parseZip(file) => ExperimentRun
│   │   ├── metrics.ts            # CSV/JSON metric file parsing
│   │   ├── config.ts             # YAML/JSON config parsing
│   │   └── requirements.ts       # pip requirements / conda env parsing
│   ├── comparator/
│   │   └── index.ts              # compareRuns(...) => ComparisonResult
│   ├── auditor/
│   │   ├── index.ts              # auditRun(run) => AuditReport
│   │   └── checks/
│   │       ├── gitRevision.ts
│   │       ├── randomSeeds.ts
│   │       ├── datasetIdentifiers.ts
│   │       ├── evalSplits.ts
│   │       └── dependencyVersions.ts
│   └── exporter/
│       ├── markdown.ts
│       └── json.ts
├── __tests__/
│   ├── parser/
│   ├── comparator/
│   ├── auditor/
│   └── exporter/
├── public/
│   └── sample-experiment.zip     # fixture for manual testing
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── vitest.config.ts
└── package.json
```

---

## Supported Artifact Formats

Runtrace parses the following file types inside a ZIP. Only these formats are actively tested; anything else is recorded in `rawFiles` for evidence purposes only.

### Metrics files (populate `metrics` map)

| File pattern | Format | Parser |
|---|---|---|
| `metrics.csv` | CSV with header row; last column is metric name, last row is final value | PapaParse |
| `metrics.json` | Flat JSON object `{ "metric": value }` or `{ "metric": [values] }` (last value used) | JSON.parse |
| `results.json`, `results_*.json` | Same flat-object format as `metrics.json` | JSON.parse |

Non-finite metric values (`NaN`, `Infinity`, `-Infinity`) are treated as invalid and excluded from the metrics map. Runs with no valid value for the selected metric are ranked last and shown with a clear "N/A" label.

### Configuration files (populate `metadata` fields)

| File pattern | Format | Parser |
|---|---|---|
| `config.yaml`, `config.yml` | YAML key-value | js-yaml |
| `params.yaml`, `params.yml` | YAML key-value | js-yaml |
| `config.json` | JSON object | JSON.parse |

### Dependency files (populate `dependencyVersions`)

| File pattern | Format | Notes |
|---|---|---|
| `requirements.txt` | pip format: `name==version` lines; extras and VCS URLs recorded but version left blank | — |
| `environment.yml`, `environment.yaml` | conda format: `dependencies:` list | js-yaml |

### Git metadata (populate `gitRevision`, `gitDirty`)

| File pattern | Keys parsed |
|---|---|
| `git_info.json` | `revision`, `commit`, `sha`, `dirty`, `is_dirty` |
| Any config file | `git_revision`, `commit`, `git.revision`, `git.commit` |

### MLflow local file store (best-effort)

Runtrace attempts to parse the MLflow local artifact directory layout when a ZIP contains it:

| Path pattern | What it populates |
|---|---|
| `mlruns/<exp_id>/<run_id>/metrics/<name>` | `metrics` map (last line of each file) |
| `mlruns/<exp_id>/<run_id>/params/<name>` | config key-value pairs |
| `mlruns/<exp_id>/<run_id>/tags/mlflow.source.git.commit` | `gitRevision` |
| `mlruns/<exp_id>/<run_id>/tags/mlflow.source.git.repoURL` | recorded in evidence |

This is best-effort: if the layout is not recognized, the parser falls back to the flat-file convention above. Multiple runs inside one MLflow ZIP are each surfaced as a separate `ExperimentRun`.

### Config key mapping (case-insensitive, best-effort)

| Config key(s) | Maps to |
|---|---|
| `seed`, `random_seed`, `data_seed`, `numpy_seed`, `torch_seed` | `randomSeeds` |
| `dataset`, `dataset_name`, `data_path`, `data_dir`, `dataset_version`, `dataset_id` | `datasetIdentifiers` |
| `eval_split`, `test_split`, `val_split`, `evaluation_split` | `evalSplits` |
| `git_revision`, `commit`, `git.commit`, `git.revision` | `gitRevision` |

### Comparison limitations displayed in the UI

When runs being compared have differing dataset identifiers or evaluation splits, the comparison panel displays a visible warning: "These runs use different datasets or evaluation splits. Metric comparisons may not be meaningful." This is shown as a non-blocking callout, not an error.

---

## Implementation Phases

### Phase 1 — Project Scaffold
**Status:** `[x] done`

**Intent:** Establish a buildable, testable baseline so every subsequent phase has working infrastructure.

**Expected Outcomes:**
- `npm run dev` starts a dev server with a placeholder page
- `npm test` runs Vitest and passes (0 tests, no errors)
- `npm run build` produces a static export with no errors
- TypeScript strict mode enabled and passing
- Tailwind CSS rendering in the browser

**Todo:**
1. Run `npx create-next-app@latest` inside the repo; choose TypeScript, Tailwind CSS, App Router, no src dir, import alias `@/*`. Do not pin a specific Next.js version.
2. Inspect `package.json` to verify actual installed versions of Next.js, React, and TypeScript before proceeding.
3. Add runtime dependencies: `jszip`, `papaparse`, `js-yaml`, `recharts`
4. Add dev dependencies: `vitest`, `@vitejs/plugin-react`, `@vitest/ui`, `@testing-library/react`, `@testing-library/user-event`, `jsdom`, `@types/papaparse`, `@types/js-yaml`
5. Configure `vitest.config.ts` with jsdom environment and path aliases matching tsconfig
6. Add `test` script to `package.json`: `"test": "vitest run"` and `"test:watch": "vitest"`
7. Set `output: "export"` in `next.config.ts` (or whatever config file `create-next-app` generated); do not overwrite the file if it already has useful configuration — merge the change
8. Create `lib/schema.ts` with all canonical types (no logic)
9. Run `npm run build` — fix any failures before proceeding
10. Run `npm test` — confirm test runner works (0 tests, no errors)
11. Run `npx tsc --noEmit` — confirm zero type errors

**Relevant Context:** Clean repo, only README.md and .git present. Use `create-next-app@latest`; inspect generated files before editing. Do not assume Next.js 14.

---

### Phase 2 — Parser Module
**Status:** `[x] done`

**Intent:** Implement and test the ZIP ingestion pipeline that converts raw browser `File` objects into typed `ExperimentRun` objects. This is the foundational data layer — every other feature depends on it.

**Expected Outcomes:**
- `parseZip(file: File): Promise<ExperimentRun>` works end-to-end
- Handles missing files gracefully (partial data, no crash)
- Unit tests cover: CSV metrics, JSON metrics, YAML config, requirements.txt, conda env.yml, git_info.json
- Test fixtures are small in-memory ZIPs constructed with JSZip (no external file I/O)

**Todo:**
1. Implement `lib/parser/metrics.ts` — parse CSV (PapaParse) and JSON metric files; return `Record<string, number>`
2. Implement `lib/parser/config.ts` — parse YAML (js-yaml) and JSON configs; map known keys to `RunMetadata` fields
3. Implement `lib/parser/requirements.ts` — parse `requirements.txt` (name==version lines) and `environment.yml` (conda); return `Record<string, string>`
4. Implement `lib/parser/index.ts` — use JSZip to enumerate ZIP contents, dispatch to correct sub-parser by filename, assemble `ExperimentRun`
5. Write unit tests in `__tests__/parser/` for each sub-parser and the top-level `parseZip`
6. Verify all tests pass

**Relevant Context:** See `lib/schema.ts` for `ExperimentRun`, `RunMetadata`, `ArtifactIndex`. See ZIP convention table above.

---

### Phase 3 — Comparator + Auditor Modules
**Status:** `[x] done`

**Intent:** Implement business logic for metric comparison and reproducibility auditing. These two modules are the analytical core of Runtrace.

**Expected Outcomes:**
- `compareRuns(runs, metric, direction): ComparisonResult` correctly ranks runs and computes deltas
- `auditRun(run): AuditReport` produces one `AuditCheck` per dimension with correct status and evidence
- Evidence strings reference actual file names or field paths found during parsing; evidence is never fabricated
- Status semantics:
  - `"confirmed"` — field is present and its value is clean and interpretable
  - `"missing"` — field is absent; no evidence found; no inference is made
  - `"problem"` — field is present but indicates a known reproducibility risk (e.g. `gitDirty: true` means uncommitted modifications exist that may not be captured by the commit hash — reproduction risk is elevated but not certain)
  - A dirty Git working tree (`gitDirty: true`) is graded `"problem"` with the message: "Uncommitted modifications detected. The commit hash alone may not fully describe the code state at the time of this run." It is kept distinct from the `"missing"` case where no Git metadata is present at all.
- Full unit test coverage with edge cases (missing metric, tied values, non-finite metrics, partially populated metadata, dirty git)

**Todo:**
1. Implement `lib/comparator/index.ts` — sort by selected metric, handle null metric values (rank last), compute deltas from rank-1
2. Implement individual audit check files under `lib/auditor/checks/` — one file per `AuditDimension`
3. Implement `lib/auditor/index.ts` — run all checks, aggregate `overallScore`
4. Write unit tests for comparator and all auditor checks
5. Verify all tests pass

**Relevant Context:** See `lib/schema.ts` for `ComparisonResult`, `AuditReport`, `AuditCheck`, `AuditScore`, `AuditDimension`.

---

### Phase 4 — Exporter Module
**Status:** `[x] done`

**Intent:** Implement Markdown and JSON export so users can share and archive results outside the app.

**Expected Outcomes:**
- `toMarkdown(payload: ExportPayload): string` produces a readable report with comparison table and per-run audit sections
- `toJSON(payload: ExportPayload): string` serializes the full payload to pretty-printed JSON
- Both functions are pure (no DOM, no side effects)
- Unit tests cover formatting edge cases (missing metrics, all-missing audit)

**Todo:**
1. Implement `lib/exporter/markdown.ts`
2. Implement `lib/exporter/json.ts`
3. Write unit tests in `__tests__/exporter/`
4. Verify all tests pass

**Relevant Context:** Markdown report structure: title, date, comparison table (runs as columns, metrics as rows), then per-run audit section with check rows showing status badge text and evidence filenames.

---

### Phase 5 — UI: Upload + State Management
**Status:** `[ ] pending`

**Intent:** Build the file upload experience and the client-side state that drives the whole application. This phase connects the parser to the UI.

**Expected Outcomes:**
- Drag-and-drop and click-to-browse ZIP upload works in Chrome, Firefox, Safari
- Multiple ZIPs can be uploaded in one operation
- Parsed `ExperimentRun` objects are held in React state accessible to all panels
- Loading and error states are displayed per-file
- Uploaded runs can be individually removed

**Todo:**
1. Implement `components/upload/DropZone.tsx` with drag-and-drop (`onDrop`), file input fallback, multi-file support
2. Add app-level state in `app/page.tsx` using `useState` / `useReducer`: `runs`, `loading`, `errors`
3. Wire `DropZone` → `parseZip` → state update
4. Show per-file loading spinner and error message
5. Add "remove run" button per uploaded run chip
6. Verify behavior manually in dev server

**Relevant Context:** `lib/parser/index.ts` `parseZip`. Keep state in `app/page.tsx` and pass down — no external state library needed at MVP scale.

---

### Phase 6 — UI: Comparison Panel
**Status:** `[ ] pending`

**Intent:** Surface the metric comparison view: metric selector, ranked table, and chart.

**Expected Outcomes:**
- `MetricSelector` shows all metrics found across all loaded runs in a dropdown
- `ComparisonTable` shows runs ranked by selected metric, with delta column
- `MetricChart` renders a bar chart (Recharts) of the selected metric per run
- Optimization direction (maximize/minimize) toggle works
- Handles runs with missing values for the selected metric gracefully

**Todo:**
1. Implement `components/comparison/MetricSelector.tsx` — derive unique metric keys from all runs, render `<select>`
2. Implement `components/comparison/ComparisonTable.tsx` — call `compareRuns`, render ranked table with rank badges
3. Implement `components/comparison/MetricChart.tsx` — Recharts `BarChart` with run names on X-axis
4. Compose in `app/page.tsx` below the upload zone, conditional on `runs.length >= 1`
5. Add "maximize / minimize" radio toggle wired to `direction` state

**Relevant Context:** `lib/comparator/index.ts`, `lib/schema.ts` `ComparisonResult`, `RankedRun`.

---

### Phase 7 — UI: Audit Panel
**Status:** `[ ] pending`

**Intent:** Display reproducibility audit results per run in a scannable, evidence-backed format that clearly distinguishes confirmed, missing, and problematic findings.

**Expected Outcomes:**
- Per-run `AuditPanel` shows all 5 dimension checks
- Each row has a colored `Badge` (green/yellow/red), the message, and collapsible evidence list
- Overall score badge is shown in the panel header
- UI distinguishes "missing evidence" (yellow) from "confirmed problem" (red) visually
- Panel appears for each uploaded run

**Todo:**
1. Implement `components/ui/Badge.tsx` — status → color mapping (confirmed=green, missing=amber, problem=red)
2. Implement `components/audit/AuditCheckRow.tsx` — dimension label, badge, message, evidence file list
3. Implement `components/audit/AuditPanel.tsx` — overall score in header, map checks to `AuditCheckRow`
4. Wire `auditRun` calls into `app/page.tsx` (computed from `runs` state)
5. Render one `AuditPanel` per run in a responsive grid

**Relevant Context:** `lib/auditor/index.ts`, `lib/schema.ts` `AuditReport`, `AuditCheck`.

---

### Phase 8 — UI: Export + Final Polish
**Status:** `[ ] pending`

**Intent:** Add export capability and apply final UI polish to produce a presentation-quality MVP.

**Expected Outcomes:**
- "Export Markdown" button triggers browser download of `.md` file
- "Export JSON" button triggers browser download of `.json` file
- App layout is polished: consistent spacing, typography, empty/loading states
- README is updated with usage instructions and artifact bundle format documentation
- `public/sample-experiment.zip` fixture is created for first-time users

**Todo:**
1. Implement `components/export/ExportButtons.tsx` using `URL.createObjectURL` + `<a download>` pattern
2. Wire export buttons to `lib/exporter/` with full `ExportPayload`
3. Polish page layout: add header with app name/tagline, section headings, empty state prompts
4. Create `public/sample-experiment.zip` with two sample runs (different seeds, one missing git revision)
5. Update `README.md` with setup instructions, artifact format spec, and screenshot placeholder
6. Final pass: run `npm run build` static export clean, `npm test` all green

**Relevant Context:** Browser download pattern: create `Blob`, call `URL.createObjectURL`, programmatically click an anchor with `download` attribute. No server needed.

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| ZIP artifact format varies wildly across ML frameworks | High | High | Design parser as best-effort; document exactly which formats are tested; degrade gracefully to "missing" |
| Recharts SSR incompatibility with Next.js static export | Medium | Low | Use `dynamic(() => import(...), { ssr: false })` for chart components |
| Large ZIP files blocking the main thread | Medium | Medium | JSZip's async API is non-blocking but does NOT use a web worker; add a per-file size cap (e.g. 200 MB) with a clear user-facing error before parsing begins |
| js-yaml parsing YAML with unexpected tags | Low | Low | Wrap js-yaml `load` in try/catch; treat parse failure as empty config, never as a crash |
| Non-finite metric values causing silent ranking errors | Medium | High | Validate every parsed metric value with `Number.isFinite`; exclude invalid values and surface a warning |
| Misleading metric comparisons across different datasets | Medium | High | Detect mismatched `datasetIdentifiers` / `evalSplits` and display a visible callout in the comparison panel |
| Deadline pressure leading to skipped tests | High | Medium | Write tests alongside logic in Phases 2–4; never defer testing to a later phase |
| create-next-app version drift | Low | Medium | Use `create-next-app@latest`; inspect actual installed versions before configuring; do not assume Next.js 14 |

## Unnecessary Complexity — Explicitly Avoided

- **No backend / API routes** — all parsing and analysis is client-side; no data leaves the browser
- **No telemetry or analytics** — no external services receive any uploaded experiment data
- **No Redux / Zustand** — `useState` + `useReducer` in `app/page.tsx` is sufficient
- **No database** — state lives only in the browser session
- **No authentication** — local-first, no accounts
- **No web workers for ZIP parsing** — JSZip's async API is sufficient; web workers add complexity without proportional gain at MVP scale
- **No W&B API integration** — out of scope for MVP; document format expectations instead
- **No streaming ZIP parsing** — JSZip `loadAsync` handles the whole file
- **No scatter plots / parallel coordinates** — single-metric bar chart covers MVP comparison needs
- **No i18n** — English only
- **No dark mode** — can be added post-MVP with Tailwind `dark:` trivially
