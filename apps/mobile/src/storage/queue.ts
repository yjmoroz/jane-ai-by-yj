import type { SoapNote } from "@jane-ai-by-yj/shared";
import { generateSoap, transcribe } from "../api/client";
import type { RecordedClip } from "../audio/recorder";
import {
  getDb,
  type RecordingRow,
  type RecordingStatus,
} from "./db";

const MAX_RETRIES = 5;

// Generate a UUID v4. Hermes supports crypto.randomUUID() in recent versions;
// fall back to a simple implementation if unavailable.
function newId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // Non-crypto fallback — fine for local primary keys.
  return "rec_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export async function enqueue(clip: RecordedClip): Promise<string> {
  const db = getDb();
  const id = newId();
  await db.runAsync(
    `INSERT INTO recordings (id, audio_uri, duration_ms, created_at, status, retries)
     VALUES (?, ?, ?, ?, 'pending', 0)`,
    [id, clip.uri, clip.durationMs, Date.now()],
  );
  // Fire-and-forget drain. Caller doesn't need to await.
  void drain();
  return id;
}

export async function listRecent(limit = 5): Promise<RecordingRow[]> {
  const db = getDb();
  return db.getAllAsync<RecordingRow>(
    `SELECT * FROM recordings ORDER BY created_at DESC LIMIT ?`,
    [limit],
  );
}

export async function getById(id: string): Promise<RecordingRow | null> {
  const db = getDb();
  return db.getFirstAsync<RecordingRow>(
    `SELECT * FROM recordings WHERE id = ?`,
    [id],
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Drain — single-flight, exponential-backoff state machine.
// ──────────────────────────────────────────────────────────────────────────────

let drainInFlight: Promise<void> | null = null;

export function drain(): Promise<void> {
  if (drainInFlight) return drainInFlight;
  drainInFlight = drainImpl().finally(() => {
    drainInFlight = null;
  });
  return drainInFlight;
}

async function drainImpl(): Promise<void> {
  const db = getDb();
  // Pull every row that still has work to do, in age order.
  const rows = await db.getAllAsync<RecordingRow>(
    `SELECT * FROM recordings
     WHERE status IN ('pending', 'transcribing', 'transcribed', 'soap')
     ORDER BY created_at ASC`,
  );

  for (const row of rows) {
    if (!shouldAttempt(row)) continue;
    if (row.status === "pending" || row.status === "transcribing") {
      await transcribeRow(row);
    } else if (row.status === "transcribed" || row.status === "soap") {
      await soapRow(row);
    }
  }
}

function shouldAttempt(row: RecordingRow): boolean {
  if (row.retries === 0) return true;
  // Exponential backoff: ready at created_at + 2^retries seconds (capped at 60s).
  const backoffMs = Math.min(60_000, Math.pow(2, row.retries) * 1000);
  return Date.now() >= row.created_at + backoffMs;
}

async function transcribeRow(row: RecordingRow): Promise<void> {
  const db = getDb();
  await setStatus(row.id, "transcribing");
  const result = await transcribe(row.audio_uri);
  if (result.ok) {
    await db.runAsync(
      `UPDATE recordings
       SET status = 'transcribed', transcript = ?, last_error = NULL,
           upload_ms = ?, transcribe_ms = ?
       WHERE id = ?`,
      [result.value.transcript, result.uploadMs, result.serverMs, row.id],
    );
    // Continue the chain immediately while we're already running.
    const refreshed = await getById(row.id);
    if (refreshed && refreshed.status === "transcribed") await soapRow(refreshed);
  } else {
    await recordFailure(row, result.error, result.detail);
  }
}

async function soapRow(row: RecordingRow): Promise<void> {
  const db = getDb();
  if (!row.transcript) {
    // Defensive: shouldn't happen, but if it does, mark failed instead of looping.
    await markFailed(row.id, "missing_transcript");
    return;
  }
  await setStatus(row.id, "soap");
  const result = await generateSoap(row.transcript);
  if (result.ok) {
    await db.runAsync(
      `UPDATE recordings
       SET status = 'done', soap_json = ?, last_error = NULL, llm_ms = ?
       WHERE id = ?`,
      [JSON.stringify(result.value.soap), result.serverMs, row.id],
    );
  } else {
    await recordFailure(row, result.error, result.detail);
  }
}

async function recordFailure(
  row: RecordingRow,
  error: string,
  detail?: string,
): Promise<void> {
  const db = getDb();
  const newRetries = row.retries + 1;
  // Roll back to the last successful step so the next drain picks it up correctly.
  const rollbackStatus: RecordingStatus =
    row.status === "transcribing" || row.status === "pending"
      ? "pending"
      : "transcribed";
  if (newRetries >= MAX_RETRIES) {
    await db.runAsync(
      `UPDATE recordings SET status = 'failed', retries = ?, last_error = ? WHERE id = ?`,
      [newRetries, `${error}: ${detail ?? ""}`.slice(0, 500), row.id],
    );
    return;
  }
  await db.runAsync(
    `UPDATE recordings SET status = ?, retries = ?, last_error = ? WHERE id = ?`,
    [
      rollbackStatus,
      newRetries,
      `${error}: ${detail ?? ""}`.slice(0, 500),
      row.id,
    ],
  );
}

async function setStatus(id: string, status: RecordingStatus): Promise<void> {
  const db = getDb();
  await db.runAsync(`UPDATE recordings SET status = ? WHERE id = ?`, [status, id]);
}

async function markFailed(id: string, error: string): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `UPDATE recordings SET status = 'failed', last_error = ? WHERE id = ?`,
    [error, id],
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Decoded view of a row — convenient for UI code.
// ──────────────────────────────────────────────────────────────────────────────

export interface RecordingView extends Omit<RecordingRow, "soap_json"> {
  soap: SoapNote | null;
}

export function decode(row: RecordingRow): RecordingView {
  return {
    ...row,
    soap: row.soap_json ? (JSON.parse(row.soap_json) as SoapNote) : null,
  };
}
