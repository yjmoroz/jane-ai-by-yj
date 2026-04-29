import { openDatabaseSync, type SQLiteDatabase } from "expo-sqlite";

const DB_NAME = "jane-ai-by-yj.db";

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS recordings (
  id TEXT PRIMARY KEY,
  audio_uri TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL,
  retries INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  transcript TEXT,
  soap_json TEXT,
  upload_ms INTEGER,
  transcribe_ms INTEGER,
  llm_ms INTEGER
);

CREATE INDEX IF NOT EXISTS recordings_status_idx ON recordings(status, created_at);
`;

let _db: SQLiteDatabase | null = null;

export function getDb(): SQLiteDatabase {
  if (_db) return _db;
  _db = openDatabaseSync(DB_NAME);
  // execAsync is async but the schema is idempotent; fire-and-await on first use.
  _db.execAsync(SCHEMA).catch((e) => {
    console.warn("[db] schema init failed:", e);
  });
  return _db;
}

export type RecordingStatus =
  | "pending"
  | "transcribing"
  | "transcribed"
  | "soap"
  | "done"
  | "failed";

export interface RecordingRow {
  id: string;
  audio_uri: string;
  duration_ms: number;
  created_at: number;
  status: RecordingStatus;
  retries: number;
  last_error: string | null;
  transcript: string | null;
  soap_json: string | null;
  upload_ms: number | null;
  transcribe_ms: number | null;
  llm_ms: number | null;
}
