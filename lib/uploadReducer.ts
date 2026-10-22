/**
 * lib/uploadReducer.ts
 *
 * Application state for ZIP upload records.
 *
 * Each upload is tracked independently with a stable uuid.
 * Asynchronous parse results are associated by id so concurrent uploads
 * cannot overwrite one another, and removal during parsing is safe.
 */

import type { ExperimentRun } from "@/lib/schema";

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

export interface UploadLoading {
  id: string;
  filename: string;
  status: "loading";
}

export interface UploadSuccess {
  id: string;
  filename: string;
  status: "success";
  run: ExperimentRun;
}

export interface UploadError {
  id: string;
  filename: string;
  status: "error";
  message: string;
}

export type UploadRecord = UploadLoading | UploadSuccess | UploadError;

export type UploadState = UploadRecord[];

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type UploadAction =
  | { type: "UPLOAD_START"; id: string; filename: string }
  | { type: "UPLOAD_SUCCESS"; id: string; run: ExperimentRun }
  | { type: "UPLOAD_ERROR"; id: string; message: string }
  | { type: "REMOVE"; id: string };

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function uploadReducer(
  state: UploadState,
  action: UploadAction
): UploadState {
  switch (action.type) {
    case "UPLOAD_START":
      return [
        ...state,
        { id: action.id, filename: action.filename, status: "loading" },
      ];

    case "UPLOAD_SUCCESS": {
      // If the record was removed before the parse completed, discard silently.
      const idx = state.findIndex((r) => r.id === action.id);
      if (idx === -1) return state;
      const updated: UploadSuccess = {
        ...state[idx],
        status: "success",
        run: action.run,
      };
      return [...state.slice(0, idx), updated, ...state.slice(idx + 1)];
    }

    case "UPLOAD_ERROR": {
      // Same guard — removed before parse finished.
      const idx = state.findIndex((r) => r.id === action.id);
      if (idx === -1) return state;
      const updated: UploadError = {
        ...state[idx],
        status: "error",
        message: action.message,
      };
      return [...state.slice(0, idx), updated, ...state.slice(idx + 1)];
    }

    case "REMOVE":
      return state.filter((r) => r.id !== action.id);

    default:
      return state;
  }
}
