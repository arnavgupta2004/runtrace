/**
 * __tests__/components/uploadReducer.test.ts
 *
 * Unit tests for the uploadReducer state machine.
 *
 * Covers:
 * - All action types.
 * - Concurrent uploads with independent outcomes.
 * - Removing a record while its parse is still pending.
 * - Stale async results after removal (ghost-prevention).
 * - Re-uploading after failure.
 */

import { describe, it, expect } from "vitest";
import { uploadReducer } from "@/lib/uploadReducer";
import type { UploadState, UploadAction } from "@/lib/uploadReducer";
import { makeRun } from "@/__tests__/helpers/factories";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function apply(state: UploadState, ...actions: UploadAction[]): UploadState {
  return actions.reduce((s, a) => uploadReducer(s, a), state);
}

const run1 = makeRun("run-1", { accuracy: 0.9 });
const run2 = makeRun("run-2", { accuracy: 0.8 });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("uploadReducer — UPLOAD_START", () => {
  it("adds a loading record to empty state", () => {
    const state = uploadReducer([], { type: "UPLOAD_START", id: "a", filename: "a.zip" });
    expect(state).toHaveLength(1);
    expect(state[0]).toMatchObject({ id: "a", filename: "a.zip", status: "loading" });
  });

  it("appends without overwriting existing records", () => {
    const state = apply(
      [],
      { type: "UPLOAD_START", id: "a", filename: "a.zip" },
      { type: "UPLOAD_START", id: "b", filename: "b.zip" }
    );
    expect(state).toHaveLength(2);
    expect(state[0].id).toBe("a");
    expect(state[1].id).toBe("b");
  });
});

describe("uploadReducer — UPLOAD_SUCCESS", () => {
  it("transitions a loading record to success", () => {
    const state = apply(
      [],
      { type: "UPLOAD_START", id: "a", filename: "a.zip" },
      { type: "UPLOAD_SUCCESS", id: "a", run: run1 }
    );
    expect(state[0].status).toBe("success");
    if (state[0].status === "success") {
      expect(state[0].run).toBe(run1);
    }
  });

  it("preserves filename from the start record", () => {
    const state = apply(
      [],
      { type: "UPLOAD_START", id: "a", filename: "my-run.zip" },
      { type: "UPLOAD_SUCCESS", id: "a", run: run1 }
    );
    expect(state[0].filename).toBe("my-run.zip");
  });

  it("does NOT resurrect a removed record (stale result is discarded)", () => {
    const state = apply(
      [],
      { type: "UPLOAD_START", id: "a", filename: "a.zip" },
      { type: "REMOVE", id: "a" },
      { type: "UPLOAD_SUCCESS", id: "a", run: run1 }
    );
    expect(state).toHaveLength(0);
  });

  it("only updates the matching record, not others", () => {
    const state = apply(
      [],
      { type: "UPLOAD_START", id: "a", filename: "a.zip" },
      { type: "UPLOAD_START", id: "b", filename: "b.zip" },
      { type: "UPLOAD_SUCCESS", id: "a", run: run1 }
    );
    expect(state[0].status).toBe("success");
    expect(state[1].status).toBe("loading"); // unaffected
  });
});

describe("uploadReducer — UPLOAD_ERROR", () => {
  it("transitions a loading record to error", () => {
    const state = apply(
      [],
      { type: "UPLOAD_START", id: "a", filename: "a.zip" },
      { type: "UPLOAD_ERROR", id: "a", message: "Bad archive" }
    );
    expect(state[0].status).toBe("error");
    if (state[0].status === "error") {
      expect(state[0].message).toBe("Bad archive");
    }
  });

  it("does NOT resurrect a removed record after an error", () => {
    const state = apply(
      [],
      { type: "UPLOAD_START", id: "a", filename: "a.zip" },
      { type: "REMOVE", id: "a" },
      { type: "UPLOAD_ERROR", id: "a", message: "oops" }
    );
    expect(state).toHaveLength(0);
  });

  it("only updates the errored record, not others", () => {
    const state = apply(
      [],
      { type: "UPLOAD_START", id: "a", filename: "a.zip" },
      { type: "UPLOAD_START", id: "b", filename: "b.zip" },
      { type: "UPLOAD_ERROR", id: "a", message: "boom" }
    );
    expect(state[0].status).toBe("error");
    expect(state[1].status).toBe("loading");
  });
});

describe("uploadReducer — REMOVE", () => {
  it("removes a loading record", () => {
    const state = apply(
      [],
      { type: "UPLOAD_START", id: "a", filename: "a.zip" },
      { type: "REMOVE", id: "a" }
    );
    expect(state).toHaveLength(0);
  });

  it("removes a success record", () => {
    const state = apply(
      [],
      { type: "UPLOAD_START", id: "a", filename: "a.zip" },
      { type: "UPLOAD_SUCCESS", id: "a", run: run1 },
      { type: "REMOVE", id: "a" }
    );
    expect(state).toHaveLength(0);
  });

  it("removes an error record", () => {
    const state = apply(
      [],
      { type: "UPLOAD_START", id: "a", filename: "a.zip" },
      { type: "UPLOAD_ERROR", id: "a", message: "err" },
      { type: "REMOVE", id: "a" }
    );
    expect(state).toHaveLength(0);
  });

  it("removes only the targeted record, leaving others intact", () => {
    const state = apply(
      [],
      { type: "UPLOAD_START", id: "a", filename: "a.zip" },
      { type: "UPLOAD_SUCCESS", id: "a", run: run1 },
      { type: "UPLOAD_START", id: "b", filename: "b.zip" },
      { type: "UPLOAD_SUCCESS", id: "b", run: run2 },
      { type: "REMOVE", id: "a" }
    );
    expect(state).toHaveLength(1);
    expect(state[0].id).toBe("b");
  });

  it("is a no-op when the id does not exist", () => {
    const state = apply(
      [],
      { type: "UPLOAD_START", id: "a", filename: "a.zip" },
      { type: "REMOVE", id: "nonexistent" }
    );
    expect(state).toHaveLength(1);
  });
});

describe("uploadReducer — concurrent uploads", () => {
  it("handles two concurrent uploads completing independently", () => {
    const state = apply(
      [],
      { type: "UPLOAD_START", id: "a", filename: "a.zip" },
      { type: "UPLOAD_START", id: "b", filename: "b.zip" },
      { type: "UPLOAD_SUCCESS", id: "b", run: run2 }, // b finishes first
      { type: "UPLOAD_SUCCESS", id: "a", run: run1 }
    );
    expect(state).toHaveLength(2);
    // Order is preserved: a first, then b
    const recordA = state.find((r) => r.id === "a");
    const recordB = state.find((r) => r.id === "b");
    expect(recordA?.status).toBe("success");
    expect(recordB?.status).toBe("success");
  });

  it("handles one success and one error in concurrent uploads", () => {
    const state = apply(
      [],
      { type: "UPLOAD_START", id: "a", filename: "a.zip" },
      { type: "UPLOAD_START", id: "b", filename: "b.zip" },
      { type: "UPLOAD_SUCCESS", id: "a", run: run1 },
      { type: "UPLOAD_ERROR", id: "b", message: "corrupt" }
    );
    expect(state.find((r) => r.id === "a")?.status).toBe("success");
    expect(state.find((r) => r.id === "b")?.status).toBe("error");
  });

  it("removing one upload does not affect the other", () => {
    const state = apply(
      [],
      { type: "UPLOAD_START", id: "a", filename: "a.zip" },
      { type: "UPLOAD_START", id: "b", filename: "b.zip" },
      { type: "REMOVE", id: "a" }
    );
    expect(state).toHaveLength(1);
    expect(state[0].id).toBe("b");
  });
});

describe("uploadReducer — re-upload after failure", () => {
  it("allows a new upload after dismissing a failed record", () => {
    const state = apply(
      [],
      { type: "UPLOAD_START", id: "a", filename: "a.zip" },
      { type: "UPLOAD_ERROR", id: "a", message: "broken" },
      { type: "REMOVE", id: "a" },
      { type: "UPLOAD_START", id: "b", filename: "a.zip" }, // same filename, new id
      { type: "UPLOAD_SUCCESS", id: "b", run: run1 }
    );
    expect(state).toHaveLength(1);
    expect(state[0].status).toBe("success");
    expect(state[0].filename).toBe("a.zip");
  });
});

describe("uploadReducer — remove during parse (stale result prevention)", () => {
  it("discards a success result that arrives after removal", () => {
    // Simulate: start → remove → success arrives (stale)
    const state = apply(
      [],
      { type: "UPLOAD_START", id: "x", filename: "x.zip" },
      { type: "REMOVE", id: "x" },
      { type: "UPLOAD_SUCCESS", id: "x", run: run1 } // stale
    );
    expect(state).toHaveLength(0);
  });

  it("discards an error result that arrives after removal", () => {
    const state = apply(
      [],
      { type: "UPLOAD_START", id: "x", filename: "x.zip" },
      { type: "REMOVE", id: "x" },
      { type: "UPLOAD_ERROR", id: "x", message: "late error" } // stale
    );
    expect(state).toHaveLength(0);
  });

  it("stale result does not corrupt an unrelated record", () => {
    const state = apply(
      [],
      { type: "UPLOAD_START", id: "ghost", filename: "ghost.zip" },
      { type: "UPLOAD_START", id: "real", filename: "real.zip" },
      { type: "REMOVE", id: "ghost" },
      { type: "UPLOAD_SUCCESS", id: "ghost", run: run1 }, // stale — discarded
      { type: "UPLOAD_SUCCESS", id: "real", run: run2 }
    );
    expect(state).toHaveLength(1);
    expect(state[0].id).toBe("real");
    if (state[0].status === "success") {
      expect(state[0].run).toBe(run2);
    }
  });
});
