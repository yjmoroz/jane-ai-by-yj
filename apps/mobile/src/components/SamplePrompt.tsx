import { StyleSheet, Text, View } from "react-native";

const SAMPLE_PROMPT =
  "Patient says they've had right shoulder stiffness for two weeks after lifting a heavy box. " +
  "Active range of motion limited to 90 degrees abduction. No radicular symptoms. " +
  "Plan: resistance band exercises, stretching, follow-up in ten days.";

// Shown on the home screen when the user is idle, to seed them with something
// realistic to say. Real practitioners obviously won't read from a script — this
// is for reviewers trying the demo without medical context.
export function SamplePrompt() {
  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>Try saying</Text>
      <Text style={styles.body}>"{SAMPLE_PROMPT}"</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#f9fafb",
    borderColor: "#e5e7eb",
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    color: "#9ca3af",
    textTransform: "uppercase",
  },
  body: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
    fontStyle: "italic",
  },
});
