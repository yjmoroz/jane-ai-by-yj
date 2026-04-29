import type { RecordingRow } from "../storage/db";
import { initialTimings, type PhaseTimings } from "./latency";

// Project a queue row into the three-phase latency view used by <LatencyBadges/>.
export function rowToTimings(row: RecordingRow | null): PhaseTimings {
  if (!row) return initialTimings;

  const upload: PhaseTimings["upload"] =
    row.upload_ms != null
      ? { status: "ok", ms: row.upload_ms }
      : row.status === "pending" || row.status === "transcribing"
        ? { status: "running" }
        : row.status === "failed"
          ? { status: "failed" }
          : { status: "idle" };

  const transcribe: PhaseTimings["transcribe"] =
    row.transcribe_ms != null
      ? { status: "ok", ms: row.transcribe_ms }
      : row.status === "transcribing"
        ? { status: "running" }
        : row.status === "failed" && !row.transcript
          ? { status: "failed" }
          : { status: "idle" };

  const llm: PhaseTimings["llm"] =
    row.llm_ms != null
      ? { status: "ok", ms: row.llm_ms }
      : row.status === "soap"
        ? { status: "running" }
        : row.status === "failed" && row.transcript
          ? { status: "failed" }
          : { status: "idle" };

  return { upload, transcribe, llm };
}
