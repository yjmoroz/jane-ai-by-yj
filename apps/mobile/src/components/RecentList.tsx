import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Link } from "expo-router";
import { listRecent } from "@/src/storage/queue";
import type { RecordingRow } from "@/src/storage/db";

interface Props {
  // Bumping this prop's value forces the list to refresh; we do this whenever
  // the active row's status flips to a terminal state.
  refreshKey: number;
}

function relTime(ts: number): string {
  const sec = Math.round((Date.now() - ts) / 1000);
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h`;
  return `${Math.round(sec / 86400)}d`;
}

function durLabel(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m${s}s` : `${s}s`;
}

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  pending: { bg: "#fef3c7", fg: "#92400e", label: "queued" },
  transcribing: { bg: "#dbeafe", fg: "#1d4ed8", label: "transcribing" },
  transcribed: { bg: "#dbeafe", fg: "#1d4ed8", label: "thinking" },
  soap: { bg: "#dbeafe", fg: "#1d4ed8", label: "thinking" },
  done: { bg: "#dcfce7", fg: "#15803d", label: "done" },
  failed: { bg: "#fee2e2", fg: "#b91c1c", label: "failed" },
};

export function RecentList({ refreshKey }: Props) {
  const [rows, setRows] = useState<RecordingRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    listRecent(5).then((r) => {
      if (!cancelled) setRows(r);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (rows.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>Recent</Text>
      {rows.map((row) => {
        const s = STATUS_STYLE[row.status] ?? STATUS_STYLE.pending!;
        return (
          <Link
            key={row.id}
            href={{ pathname: "/note/[id]", params: { id: row.id } }}
            asChild
          >
            <Pressable style={styles.item}>
              <View style={[styles.pill, { backgroundColor: s.bg }]}>
                <Text style={[styles.pillText, { color: s.fg }]}>{s.label}</Text>
              </View>
              <Text style={styles.duration}>{durLabel(row.duration_ms)}</Text>
              <Text style={styles.time}>{relTime(row.created_at)}</Text>
            </Pressable>
          </Link>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  heading: { fontSize: 12, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1, fontWeight: "700" },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#f9fafb",
    gap: 12,
  },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  pillText: { fontSize: 11, fontWeight: "700" },
  duration: { fontSize: 14, color: "#374151", fontVariant: ["tabular-nums"] },
  time: { marginLeft: "auto", fontSize: 12, color: "#9ca3af" },
});
