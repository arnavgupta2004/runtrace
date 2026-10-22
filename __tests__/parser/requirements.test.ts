/**
 * __tests__/parser/requirements.test.ts
 *
 * Tests for lib/parser/requirements.ts
 */

import { describe, it, expect } from "vitest";
import {
  parseRequirementsTxt,
  parseEnvironmentYml,
} from "@/lib/parser/requirements";

// ---------------------------------------------------------------------------
// parseRequirementsTxt
// ---------------------------------------------------------------------------

describe("parseRequirementsTxt", () => {
  it("parses exact-version pins (==)", () => {
    const txt = `numpy==1.24.0\ntorch==2.0.1`;
    const result = parseRequirementsTxt(txt);
    expect(result).toEqual({ numpy: "1.24.0", torch: "2.0.1" });
  });

  it("records unpinned packages with empty string version", () => {
    const txt = `numpy\ntorch`;
    const result = parseRequirementsTxt(txt);
    expect(result).toMatchObject({ numpy: "", torch: "" });
  });

  it("records compatible-release pins (~=) as-is", () => {
    const txt = `numpy~=1.24.0`;
    const result = parseRequirementsTxt(txt);
    expect(result["numpy"]).toBe("~=1.24.0");
  });

  it("records range specifiers (>=) as empty string — version not deterministic", () => {
    const txt = `numpy>=1.0\ntorch<2.0`;
    const result = parseRequirementsTxt(txt);
    expect(result["numpy"]).toBe("");
    expect(result["torch"]).toBe("");
  });

  it("records multi-clause specifiers as empty string", () => {
    const txt = `numpy>=1.0,<2.0`;
    const result = parseRequirementsTxt(txt);
    expect(result["numpy"]).toBe("");
  });

  it("strips extras from package name", () => {
    const txt = `numpy[array]==1.24.0`;
    const result = parseRequirementsTxt(txt);
    expect(result["numpy"]).toBe("1.24.0");
  });

  it("strips environment markers", () => {
    const txt = `numpy==1.24.0; python_version >= "3.8"`;
    const result = parseRequirementsTxt(txt);
    expect(result["numpy"]).toBe("1.24.0");
  });

  it("skips comment lines", () => {
    const txt = `# this is a comment\nnumpy==1.24.0`;
    const result = parseRequirementsTxt(txt);
    expect(result).toEqual({ numpy: "1.24.0" });
  });

  it("skips blank lines", () => {
    const txt = `\nnumpy==1.24.0\n\ntorch==2.0.1\n`;
    const result = parseRequirementsTxt(txt);
    expect(result).toEqual({ numpy: "1.24.0", torch: "2.0.1" });
  });

  it("skips option flags (-r, --index-url, etc.)", () => {
    const txt = `-r base.txt\n--index-url https://pypi.org\nnumpy==1.24.0`;
    const result = parseRequirementsTxt(txt);
    expect(result).toEqual({ numpy: "1.24.0" });
  });

  it("handles VCS installs and records egg name with empty version", () => {
    const txt = `git+https://github.com/example/pkg.git#egg=MyPkg`;
    const result = parseRequirementsTxt(txt);
    expect(result["mypkg"]).toBe("");
  });

  it("normalises package names to lowercase with hyphens", () => {
    const txt = `PyYAML==6.0\nSciPy==1.11.0`;
    const result = parseRequirementsTxt(txt);
    expect(result).toHaveProperty("pyyaml", "6.0");
    expect(result).toHaveProperty("scipy", "1.11.0");
  });

  it("returns empty object for empty string", () => {
    expect(parseRequirementsTxt("")).toEqual({});
    expect(parseRequirementsTxt("   ")).toEqual({});
  });

  it("returns empty object for all-comment file", () => {
    const txt = `# no packages\n# just comments`;
    expect(parseRequirementsTxt(txt)).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// parseEnvironmentYml
// ---------------------------------------------------------------------------

describe("parseEnvironmentYml", () => {
  it("parses conda exact-version deps (single =)", () => {
    const yml = `name: myenv\ndependencies:\n  - numpy=1.24.0\n  - python=3.10`;
    const result = parseEnvironmentYml(yml);
    expect(result).toMatchObject({ numpy: "1.24.0", python: "3.10" });
  });

  it("records unpinned conda deps with empty string version", () => {
    const yml = `name: myenv\ndependencies:\n  - numpy`;
    const result = parseEnvironmentYml(yml);
    expect(result["numpy"]).toBe("");
  });

  it("records conda range specifiers as empty string", () => {
    const yml = `name: myenv\ndependencies:\n  - numpy>=1.0`;
    const result = parseEnvironmentYml(yml);
    expect(result["numpy"]).toBe("");
  });

  it("parses pip sub-section in conda environment.yml", () => {
    const yml = [
      "name: myenv",
      "dependencies:",
      "  - numpy=1.24.0",
      "  - pip:",
      "    - torch==2.0.1",
      "    - transformers==4.30.0",
    ].join("\n");
    const result = parseEnvironmentYml(yml);
    expect(result["numpy"]).toBe("1.24.0");
    expect(result["torch"]).toBe("2.0.1");
    expect(result["transformers"]).toBe("4.30.0");
  });

  it("returns empty object for empty string", () => {
    expect(parseEnvironmentYml("")).toEqual({});
    expect(parseEnvironmentYml("   ")).toEqual({});
  });

  it("returns empty object for invalid YAML (non-crash)", () => {
    expect(parseEnvironmentYml("{broken yaml")).toEqual({});
  });

  it("returns empty object when 'dependencies' key is absent", () => {
    const yml = `name: myenv\nchannels:\n  - conda-forge`;
    expect(parseEnvironmentYml(yml)).toEqual({});
  });

  it("normalises conda package names to lowercase", () => {
    const yml = `name: myenv\ndependencies:\n  - PyYAML=6.0`;
    const result = parseEnvironmentYml(yml);
    expect(result["pyyaml"]).toBe("6.0");
  });
});
