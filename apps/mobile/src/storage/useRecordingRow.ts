import { useEffect, useState } from "react";
import { getById } from "./queue";
import type { RecordingRow } from "./db";

const TERMINAL = new Set(["done", "failed"]);

// Polls the row every 300ms while in flight. Cheap with sqlite (in-memory
// page cache) and avoids needing a separate event-emitter pubsub layer.
export function useRecordingRow(id: string | null): RecordingRow | null {
  const [row, setRow] = useState<RecordingRow | null>(null);

  useEffect(() => {
    if (!id) {
      setRow(null);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      const r = await getById(id);
      if (cancelled) return;
      setRow(r);
      if (r && !TERMINAL.has(r.status)) {
        timer = setTimeout(tick, 300);
      }
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [id]);

  return row;
}
