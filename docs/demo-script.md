# RunTrace — Demo Video Script

**Target duration:** 2 minutes  
**Format:** Screen recording with narration and optional captions  
**Status:** Script only — video not yet recorded

---

## Shot-by-Shot Script

---

### Shot 1 — The Problem (0:00–0:18)

**On screen:** Blank desktop or terminal showing multiple experiment folders/ZIPs.  
**Caption:** *"ML experiments are hard to compare when results are scattered across files."*

**Narration:**
> "When you run multiple machine learning experiments, the results end up scattered — metrics in CSV files, configs in YAML, dependencies in requirements.txt, git commits in notes. Comparing runs means opening files manually and hoping you haven't mixed up seeds or datasets. RunTrace solves this."

---

### Shot 2 — Open the App (0:18–0:25)

**On screen:** Browser opens to the RunTrace home page. Show the header, the upload zone, and the "Load demo experiments" button clearly.  
**Caption:** *"RunTrace — local-first ML experiment comparison"*

**Narration:**
> "This is RunTrace. All processing happens in your browser — no data is sent anywhere."

---

### Shot 3 — Load Demo Experiments (0:25–0:42)

**On screen:** Click the blue **Load demo experiments** button. Show the loading spinners briefly, then the three run cards appearing.  
**Caption:** *"Loading three synthetic demo archives — not real research data"*

**Narration:**
> "I'll click 'Load demo experiments' to load three synthetic example runs. These are clearly labelled demonstration fixtures, not real research data. You can see the three run cards appear: a baseline experiment, an improved experiment, and a reproducibility warning run."

Point out:
- Baseline and improved each show "3 metrics" and metadata badges.
- The warning run shows "Git revision" and other metadata badges too.

---

### Shot 4 — Metric Comparison (0:42–1:02)

**On screen:** Scroll down to the Metric comparison section. Show the dropdown selecting `accuracy`. Show the bar chart and the ranking table.  
**Caption:** *"Compare runs by the metric you choose"*

**Narration:**
> "The metric comparison panel shows all runs ranked by accuracy. I can see the improved experiment ranks first — it has higher accuracy and a lower loss. The ranking table shows the delta from the best run. I can switch to 'loss' or change the direction to 'minimize' if I wanted the lowest loss to win."

Briefly switch metric to `loss`, then back to `accuracy`.

---

### Shot 5 — Compatibility Warning (1:02–1:18)

**On screen:** Highlight the amber compatibility warning banner that appears in the ranking table.  
**Caption:** *"Dataset mismatch detected — comparison may not be meaningful"*

**Narration:**
> "RunTrace detects that the reproducibility-warning run used a different dataset and evaluation split. That amber banner tells you the metric comparison across these runs may not be scientifically valid. I can remove that run to clear the warning — watch."

Click the ✕ button on the reproducibility-warning card. Show the warning banner disappear and the status change to "Compatible".

---

### Shot 6 — Reproducibility Audit (1:18–1:40)

**On screen:** Re-load the warning run (or use the audit panel that's still visible for the other runs). Scroll to the Reproducibility audits section.  
**Caption:** *"Evidence-backed reproducibility audit for each run"*

**Narration:**
> "Each run gets a reproducibility audit across five dimensions: git revision, random seeds, dataset identifiers, evaluation splits, and dependency versions. The baseline and improved runs show a 'Good' score — all five dimensions are confirmed. The warning run shows 'Poor' because the git working tree was dirty at the time of the run, meaning the commit hash alone doesn't fully describe the code state."

Click "Show evidence" for the git revision check of the warning run to show the evidence file path.

---

### Shot 7 — Export Report (1:40–1:55)

**On screen:** Scroll to the Export report section. Click **Export Markdown**. Show the file appearing in the browser's download bar.  
**Caption:** *"Export Markdown or JSON — generated entirely in your browser"*

**Narration:**
> "Finally, I can export the current comparison and audit as a Markdown or JSON report. The file is generated entirely in the browser — nothing is uploaded anywhere. The filename includes today's date."

Optionally open the downloaded `.md` file briefly.

---

### Shot 8 — Closing (1:55–2:00)

**On screen:** Return to the RunTrace home page.  
**Caption:** *"RunTrace — evidence-backed experiment comparison, locally."*

**Narration:**
> "RunTrace: evidence-backed ML experiment comparison and reproducibility auditing, without sending your experiment data anywhere."

---

## Caption Suggestions

| Time | Caption |
|---|---|
| 0:00 | *"ML experiments are hard to compare when results are scattered"* |
| 0:18 | *"RunTrace — all processing in your browser"* |
| 0:25 | *"Three synthetic demo archives — not real research data"* |
| 0:42 | *"Ranking by accuracy — improved experiment ranks first"* |
| 1:02 | *"⚠️ Dataset mismatch detected — comparison may not be valid"* |
| 1:18 | *"Five reproducibility dimensions — evidence, not guesswork"* |
| 1:40 | *"Export to Markdown or JSON — locally, no upload"* |
| 1:55 | *"RunTrace — evidence-backed experiment comparison"* |

---

## Notes for Recording

- Use a clean browser profile with no extensions visible.
- Set browser zoom to 100%.
- Use a 1920×1080 or 1280×800 window for readability.
- The demo experiments load from `public/samples/` — they must be served from a local dev server (`npm run dev`) or the deployed URL.
- Do not claim the video has been recorded or uploaded until it has been.
- Replace `[LIVE URL]` in the submission description with the actual deployment URL before publishing.
