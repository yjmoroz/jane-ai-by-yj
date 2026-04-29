import { StyleSheet, Text, View } from "react-native";
import { formatMs, type PhaseTiming, type PhaseTimings } from "../observability/latency";

interface Props {
  timings: PhaseTimings;
}

export function LatencyBadges({ timings }: Props) {
  return (
    <View style={styles.row}>
      <Badge label="Upload" timing={timings.upload} />
      <Badge label="Transcribe" timing={timings.transcribe} />
      <Badge label="LLM" timing={timings.llm} />
    </View>
  );
}

function Badge({ label, timing }: { label: string; timing: PhaseTiming }) {
  const style = [
    styles.badge,
    timing.status === "running" && styles.running,
    timing.status === "ok" && styles.ok,
    timing.status === "failed" && styles.failed,
  ];
  const valueStyle = [
    styles.value,
    timing.status === "ok" && styles.valueOk,
    timing.status === "failed" && styles.valueFailed,
  ];
  return (
    <View style={style}>
      <Text style={styles.label}>{label}</Text>
      <Text style={valueStyle}>
        {timing.status === "running" ? "…" : formatMs(timing.ms)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8, justifyContent: "center" },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    minWidth: 88,
    alignItems: "center",
  },
  running: { backgroundColor: "#fef3c7", borderColor: "#fde68a" },
  ok: { backgroundColor: "#dcfce7", borderColor: "#bbf7d0" },
  failed: { backgroundColor: "#fee2e2", borderColor: "#fecaca" },
  label: { fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 },
  value: { fontSize: 14, fontWeight: "600", color: "#111827", marginTop: 2 },
  valueOk: { color: "#15803d" },
  valueFailed: { color: "#b91c1c" },
});
