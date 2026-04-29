// Per-phase latency tracking for the record→transcribe→SOAP pipeline.
// Surfaced via <LatencyBadges/> as a visible signal that we measure what we ship.

export type PhaseStatus = "idle" | "running" | "ok" | "failed";

export interface PhaseTiming {
  status: PhaseStatus;
  ms?: number;
}

export interface PhaseTimings {
  upload: PhaseTiming;
  transcribe: PhaseTiming;
  llm: PhaseTiming;
}

export const initialTimings: PhaseTimings = {
  upload: { status: "idle" },
  transcribe: { status: "idle" },
  llm: { status: "idle" },
};

export function formatMs(ms?: number): string {
  if (ms === undefined) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
