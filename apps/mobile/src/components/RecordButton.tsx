import { Pressable, StyleSheet, Text, View } from "react-native";
import type { RecorderState } from "../audio/recorder";

interface Props {
  state: RecorderState;
  elapsedMs: number;
  onPress(): void;
}

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export function RecordButton({ state, elapsedMs, onPress }: Props) {
  const disabled = state === "permission_denied" || state === "error";
  const recording = state === "recording";

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={recording ? "Stop recording" : "Start recording"}
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [
          styles.button,
          recording && styles.recording,
          state === "recorded" && styles.done,
          disabled && styles.disabled,
          pressed && styles.pressed,
        ]}
      >
        {recording ? (
          <View style={styles.stopSquare} />
        ) : state === "recorded" ? (
          <Text style={styles.glyph}>✓</Text>
        ) : (
          <Text style={styles.glyph}>●</Text>
        )}
      </Pressable>
      <Text style={styles.elapsed}>
        {recording ? formatElapsed(elapsedMs) : recording ? "" : "tap to record"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: 12 },
  button: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#1f2937",
    alignItems: "center",
    justifyContent: "center",
  },
  recording: { backgroundColor: "#dc2626" },
  done: { backgroundColor: "#16a34a" },
  disabled: { opacity: 0.4 },
  pressed: { transform: [{ scale: 0.96 }] },
  glyph: { color: "white", fontSize: 36, fontWeight: "600" },
  stopSquare: { width: 28, height: 28, backgroundColor: "white", borderRadius: 4 },
  elapsed: { fontSize: 14, color: "#6b7280" },
});
