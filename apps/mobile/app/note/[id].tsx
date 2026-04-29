import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useEffect, useState } from "react";
import type { SoapNote } from "@jane-ai-by-yj/shared";
import { decode, getById, type RecordingView } from "@/src/storage/queue";
import type { RecordingRow } from "@/src/storage/db";
import { rowToTimings } from "@/src/observability/rowToTimings";
import { LatencyBadges } from "@/src/components/LatencyBadges";

const SECTIONS: Array<{ key: keyof SoapNote; label: string }> = [
  { key: "subjective", label: "Subjective" },
  { key: "objective", label: "Objective" },
  { key: "assessment", label: "Assessment" },
  { key: "plan", label: "Plan" },
];

function relTime(ts: number): string {
  const sec = Math.round((Date.now() - ts) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h ago`;
  return `${Math.round(sec / 86400)}d ago`;
}

function durLabel(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function NoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [view, setView] = useState<RecordingView | null>(null);
  const [row, setRow] = useState<RecordingRow | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const r = await getById(id);
      if (cancelled) return;
      setRow(r);
      setView(r ? decode(r) : null);
      // Keep polling until terminal in case the user navigated here mid-flight.
      if (r && r.status !== "done" && r.status !== "failed") {
        timer = setTimeout(tick, 400);
      }
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [id]);

  if (!view) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={styles.emptyState}>Loading…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>← Home</Text>
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.title}>SOAP note</Text>
          <Text style={styles.meta}>
            {durLabel(view.duration_ms)} · {relTime(view.created_at)}
          </Text>
        </View>

        <LatencyBadges timings={rowToTimings(row)} />

        {view.status !== "done" && (
          <View style={styles.statusPill}>
            <Text style={styles.statusPillText}>
              {view.status === "failed"
                ? `Failed: ${view.last_error ?? "unknown error"}`
                : `In progress — ${view.status}`}
            </Text>
          </View>
        )}

        {view.soap ? (
          <View style={styles.sections}>
            {SECTIONS.map(({ key, label }) => (
              <View key={key} style={styles.section}>
                <Text style={styles.sectionLabel}>{label}</Text>
                {view.soap![key] ? (
                  <Text style={styles.sectionBody}>{view.soap![key]}</Text>
                ) : (
                  <Text style={styles.empty}>— none captured —</Text>
                )}
              </View>
            ))}
          </View>
        ) : null}

        {view.transcript ? (
          <View style={styles.transcriptWrap}>
            <Pressable onPress={() => setShowTranscript((v) => !v)}>
              <Text style={styles.disclosureText}>
                {showTranscript ? "▾ Transcript" : "▸ Show transcript"}
              </Text>
            </Pressable>
            {showTranscript && (
              <Text style={styles.transcriptBody}>{view.transcript}</Text>
            )}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "white" },
  container: { padding: 24, gap: 16, paddingBottom: 40 },
  back: { alignSelf: "flex-start" },
  backText: { fontSize: 16, color: "#0f172a" },
  header: { gap: 4 },
  title: { fontSize: 26, fontWeight: "700" },
  meta: { fontSize: 13, color: "#6b7280" },
  statusPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#fef3c7",
    borderRadius: 999,
  },
  statusPillText: { fontSize: 13, color: "#92400e" },
  sections: { gap: 16, marginTop: 8 },
  section: { gap: 4 },
  sectionLabel: {
    fontSize: 11,
    color: "#6b7280",
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  sectionBody: { fontSize: 16, color: "#111827", lineHeight: 22 },
  empty: { fontSize: 14, color: "#9ca3af", fontStyle: "italic" },
  transcriptWrap: { gap: 8, marginTop: 8 },
  disclosureText: { fontSize: 14, color: "#0f172a", fontWeight: "600" },
  transcriptBody: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
    backgroundColor: "#f9fafb",
    padding: 12,
    borderRadius: 8,
  },
  emptyState: { padding: 24, fontSize: 16, color: "#6b7280" },
});
