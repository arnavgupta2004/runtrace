/**
 * lib/parser/requirements.ts
 *
 * Extracts pinned dependency versions from:
 *   - requirements.txt  (pip format)
 *   - environment.yml / environment.yaml  (conda format)
 *
 * Rules
 * -----
 * - Only exact-version pins are recorded (e.g. numpy==1.24.0 → "1.24.0").
 * - Compatible-release pins (~=) are recorded as-is.
 * - Unpinned dependencies are recorded with an empty string version.
 * - VCS / URL dependencies are recorded with an empty string version.
 * - Comments and blank lines are skipped.
 * - Extras are stripped from the package name (numpy[array]==1.24 → "numpy").
 * - Version specifiers with multiple clauses (numpy>=1.0,<2.0) are recorded
 *   with an empty string version — the version cannot be determined without
 *   resolving the environment.
 * - We never invent or fabricate version strings.
 *
 * conda dependencies
 * ------------------
 * The `dependencies:` list may contain:
 *   - plain strings: "numpy=1.24.0"  (conda uses single =)
 *   - pip sub-section: { pip: ["numpy==1.24.0"] }
 * Both are handled.
 */

import { load as yamlLoad } from "js-yaml";

// ---------------------------------------------------------------------------
// pip requirements.txt
// ---------------------------------------------------------------------------

/**
 * Parse a pip requirements.txt string.
 * Returns a map of package-name (lowercase, no extras) → version string.
 * Version is an empty string when the version cannot be determined.
 */
export function parseRequirementsTxt(content: string): Record<string, string> {
  const deps: Record<string, string> = {};

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    // Skip options like -r, -c, --index-url, etc.
    if (line.startsWith("-")) continue;
    // VCS / URL installs: git+, http://, https://, file://
    if (/^(git\+|https?:\/\/|file:\/\/)/.test(line)) {
      // Best-effort: extract egg name if present.
      const eggMatch = line.match(/#egg=([A-Za-z0-9_\-\.]+)/);
      if (eggMatch) {
        deps[normalizePackageName(eggMatch[1])] = "";
      }
      continue;
    }

    // Strip inline comments.
    const withoutComment = line.split("#")[0].trim();
    if (!withoutComment) continue;

    // Strip environment markers  (e.g. numpy>=1.0; python_version >= "3.8")
    const withoutMarker = withoutComment.split(";")[0].trim();

    // Match: name[extras]<specifier>
    // Specifier examples: ==1.2.3, >=1.0, ~=1.2, >=1.0,<2.0
    const match = withoutMarker.match(
      /^([A-Za-z0-9_\-\.]+)(\[.*?\])?(.*)?$/
    );
    if (!match) continue;

    const rawName = match[1];
    const specifier = (match[3] ?? "").trim();
    const name = normalizePackageName(rawName);

    if (!specifier) {
      deps[name] = "";
      continue;
    }

    // Multiple specifier clauses → cannot determine exact version.
    if (specifier.includes(",")) {
      deps[name] = "";
      continue;
    }

    // Exact pin: ==version
    const exactMatch = specifier.match(/^==(.+)$/);
    if (exactMatch) {
      deps[name] = exactMatch[1].trim();
      continue;
    }

    // Compatible release: ~=version
    const compatMatch = specifier.match(/^~=(.+)$/);
    if (compatMatch) {
      deps[name] = `~=${compatMatch[1].trim()}`;
      continue;
    }

    // Any other specifier (>=, <=, !=, etc.) → version not deterministic.
    deps[name] = "";
  }

  return deps;
}

// ---------------------------------------------------------------------------
// conda environment.yml
// ---------------------------------------------------------------------------

/**
 * Parse a conda environment.yml / environment.yaml string.
 * Returns a map of package-name (lowercase) → version string.
 * Version is an empty string when the version cannot be determined.
 */
export function parseEnvironmentYml(content: string): Record<string, string> {
  if (content.trim() === "") return {};

  let parsed: unknown;
  try {
    parsed = yamlLoad(content);
  } catch {
    return {};
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }

  const env = parsed as Record<string, unknown>;
  const dependencies = env["dependencies"];
  if (!Array.isArray(dependencies)) return {};

  const deps: Record<string, string> = {};

  for (const item of dependencies) {
    if (typeof item === "string") {
      // conda dep: "numpy=1.24.0" or "numpy>=1.0" or "numpy"
      extractCondaDep(item, deps);
    } else if (
      item !== null &&
      typeof item === "object" &&
      !Array.isArray(item)
    ) {
      // pip sub-section: { pip: ["numpy==1.24.0", ...] }
      const obj = item as Record<string, unknown>;
      if (Array.isArray(obj["pip"])) {
        for (const pipItem of obj["pip"] as unknown[]) {
          if (typeof pipItem === "string") {
            extractPipDep(pipItem, deps);
          }
        }
      }
    }
  }

  return deps;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Normalise a pip/conda package name to lowercase, replacing hyphens and
 * underscores consistently (PEP 503 / conda convention).
 */
function normalizePackageName(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, "-");
}

/** Parse a conda dependency string like "numpy=1.24.0" into deps. */
function extractCondaDep(raw: string, deps: Record<string, string>): void {
  const line = raw.trim();
  if (!line || line.startsWith("#")) return;

  // conda uses single = for exact version, not ==
  // Also supports >=, <=, != specifiers.
  // "package=version" → exact
  // "package>=version" → non-deterministic
  // "package" → unpinned

  const exactMatch = line.match(/^([A-Za-z0-9_\-\.]+)=([^=<>!~\s]+)$/);
  if (exactMatch) {
    deps[normalizePackageName(exactMatch[1])] = exactMatch[2].trim();
    return;
  }

  // Any other specifier.
  const specMatch = line.match(/^([A-Za-z0-9_\-\.]+)[=<>!~]/);
  if (specMatch) {
    deps[normalizePackageName(specMatch[1])] = "";
    return;
  }

  // No specifier — just a name.
  const nameMatch = line.match(/^([A-Za-z0-9_\-\.]+)$/);
  if (nameMatch) {
    deps[normalizePackageName(nameMatch[1])] = "";
  }
}

/** Parse a pip-style dependency string from within a conda environment.yml. */
function extractPipDep(raw: string, deps: Record<string, string>): void {
  // Delegate to the pip parser logic; wrap in a minimal requirements.txt.
  const result = parseRequirementsTxt(raw);
  Object.assign(deps, result);
}
