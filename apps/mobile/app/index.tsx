import { useEffect, useState } from "react";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { Link } from "expo-router";
import { useRecorder } from "@/src/audio/recorder";
import { LatencyBadges } from "@/src/components/LatencyBadges";
import { RecentList } from "@/src/components/RecentList";
import { RecordButton } from "@/src/components/RecordButton";
import { rowToTimings } from "@/src/observability/rowToTimings";
import { decode, enqueue } from "@/src/storage/queue";
import { useRecordingRow } from "@/src/storage/useRecordingRow";

export default function Home() {
  const recorder = useRecorder();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [recentVersion, setRecentVersion] = useState(0);
  const activeRow = useRecordingRow(activeId);
  const timings = rowToTimings(activeRow);

  // Whenever the active row terminates, bump the recent-list refresh key so
  // it re-reads from sqlite.
  useEffect(() => {
    if (activeRow?.status === "done" || activeRow?.status === "failed") {
      setRecentVersion((v) => v + 1);
    }
  }, [activeRow?.status]);

  const onPress = async () => {
    if (recorder.state === "recording") {
      const clip = await recorder.stop();
      if (!clip) return;
      const id = await enqueue(clip);
      setActiveId(id);
      return;
    }
    if (recorder.state === "idle" || recorder.state === "recorded") {
      if (recorder.state === "recorded") recorder.reset();
      setActiveId(null);
      await recorder.start();
    }
  };

  const decoded = activeRow ? decode(activeRow) : null;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Jane AI by YJ</Text>
        <Text style={styles.subtitle}>Tap, talk, get a SOAP note.</Text>

        <View style={styles.buttonArea}>
          <RecordButton
            state={recorder.state}
            elapsedMs={recorder.elapsedMs}
            onPress={onPress}
          />
        </View>

        {activeId && (
          <View style={styles.statusArea}>
            <LatencyBadges timings={timings} />
            {activeRow && (
              <Text style={styles.statusLabel}>
                {labelForStatus(activeRow.status)}
              </Text>
            )}
            {decoded?.status === "done" && decoded.soap && (
              <Link href={{ pathname: "/note/[id]", params: { id: decoded.id } }} asChild>
                <Pressable style={styles.openNote}>
                  <Text style={styles.openNoteText}>Open SOAP note →</Text>
                </Pressable>
              </Link>
            )}
            {activeRow?.status === "failed" && activeRow.last_error && (
              <Text style={styles.error}>Failed: {activeRow.last_error}</Text>
            )}
          </View>
        )}

        {recorder.state === "permission_denied" && (
          <Text style={styles.hint}>
            Microphone permission denied. Enable it in Settings to record.
          </Text>
        )}
        {recorder.state === "error" && (
          <Text style={styles.error}>
            Something went wrong: {recorder.errorMessage}
          </Text>
        )}

        <RecentList refreshKey={recentVersion} />
      </ScrollView>
    </SafeAreaView>
  );
}

function labelForStatus(s: string): string {
  switch (s) {
    case "pending":
      return "Queued — waiting for connection";
    case "transcribing":
      return "Uploading & transcribing…";
    case "transcribed":
      return "Transcribed — generating SOAP note…";
    case "soap":
      return "Generating SOAP note…";
    case "done":
      return "Done";
    case "failed":
      return "Failed";
    default:
      return s;
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "white" },
  container: { padding: 24, gap: 16, paddingBottom: 40, flexGrow: 1 },
  title: { fontSize: 28, fontWeight: "700", marginTop: 24 },
  subtitle: { fontSize: 16, color: "#6b7280" },
  buttonArea: { flex: 1, alignItems: "center", justifyContent: "center" },
  statusArea: { gap: 8, alignItems: "center" },
  statusLabel: { fontSize: 13, color: "#374151" },
  openNote: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#0f172a",
    borderRadius: 999,
    marginTop: 4,
  },
  openNoteText: { color: "white", fontWeight: "600" },
  hint: { fontSize: 14, color: "#b45309", textAlign: "center" },
  error: { fontSize: 13, color: "#dc2626", textAlign: "center" },
});
