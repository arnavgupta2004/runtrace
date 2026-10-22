# RunTrace — Challenge Submission Description

> **Note:** This is a template. Replace all `[PLACEHOLDER]` markers with actual values
> before submitting. Do not fabricate a live URL or video URL.

---

## Project Name

**RunTrace**

## Tagline

Evidence-backed ML experiment comparison and reproducibility auditing — entirely in your browser.

---

## The Problem

Machine learning practitioners run many experiments. When a run finishes, its artifacts — metrics, configs, seeds, dependency versions, and git state — are scattered across files. Comparing two runs later means manually opening those files and trusting that you remembered which run used which dataset. There is no easy way to check whether a comparison is even valid (same dataset? same evaluation split?) or whether a run would be reproducible if you needed to repeat it.

Existing tools either require a dedicated tracking server (MLflow, W&B) or do not surface reproducibility evidence at all.

---

## The Solution

RunTrace is a local-first web application that:

1. **Parses experiment artifact ZIPs entirely in the browser** using JSZip, PapaParse, and js-yaml. No data is uploaded anywhere.
2. **Ranks runs by the metric you choose** (maximize or minimize), with explicit deltas from the best run.
3. **Detects dataset and evaluation split mismatches** — flags comparisons where the runs may not be on equal footing.
4. **Audits five reproducibility dimensions** per run: git revision (including dirty state), random seeds, dataset identifiers, evaluation splits, and dependency versions. Each audit check links back to the actual file or field that provided the evidence.
5. **Exports Markdown and JSON reports** generated entirely in the browser, suitable for documentation or sharing.

### Differentiating features

- **Fully local:** Zero backend, zero accounts, zero telemetry. Your experiment data never leaves your browser.
- **Evidence-grounded:** Audit findings reference actual file paths and field keys, not fabricated summaries.
- **Honest about uncertainty:** The compatibility checker distinguishes "confirmed compatible", "mismatch detected", and "unverified" (missing metadata). Audit scores are labelled as descriptive, not as statistical guarantees.
- **Three demo experiments included:** A synthetic baseline, a compatible improved run, and a run designed to trigger both a mismatch warning and a "poor" audit score, so reviewers can see all states immediately.

---

## Intended Users

- ML practitioners and researchers who run multiple experiments and need to compare results.
- Research teams who need to document reproducibility evidence for publications or audits.
- Anyone who wants a privacy-preserving alternative to cloud-hosted experiment trackers for sensitive experiment data.

---

## How Wispr Flow Was Used

<!-- 
  TEMPLATE — Fill in your actual usage before submitting.
  
  Describe honestly how you used Wispr Flow during development.
  Examples of what you might include:
  - Which parts of the code you dictated using Wispr Flow.
  - Whether you used it for documentation, comments, or README writing.
  - Approximate volume of code or text produced with Wispr Flow assistance.
  - Any workflows (e.g. voice-to-code for boilerplate, narrating test cases) that you found particularly useful.
  
  Do not invent usage figures or claim a usage card exists if you do not have one.
-->

[DESCRIBE YOUR ACTUAL WISPR FLOW USAGE HERE]

---

## Live Project URL

> **⚠️ Replace this with the actual verified deployment URL before submitting.**

`[LIVE URL — NOT YET DEPLOYED]`

---

## Demo Video URL

> **⚠️ Replace this with the actual video URL after recording and uploading.**

`[VIDEO URL — NOT YET RECORDED]`

---

## Repository

> **⚠️ Replace with the actual public repository URL if applicable.**

`[REPOSITORY URL]`

---

## Technical Stack

- **Next.js 16** (App Router, `output: "export"` static site)
- **React 19**, TypeScript 5 (strict mode)
- **Tailwind CSS 4**, Recharts 3
- **JSZip 3**, PapaParse 5, js-yaml 5
- **Vitest 5** + Testing Library (509 tests, 0 TypeScript errors)

---

## Submission Checklist

- [ ] Replaced `[LIVE URL]` with verified deployment URL
- [ ] Replaced `[VIDEO URL]` with actual recorded and uploaded video URL
- [ ] Replaced `[REPOSITORY URL]` with correct public repository URL
- [ ] Described actual Wispr Flow usage (replaced template section)
- [ ] Verified that the live URL loads and the demo experiments work
- [ ] Deadline: October 30, 2026, 11:59 p.m. IST
