import {
  AudioQuality,
  IOSOutputFormat,
  type RecordingOptions,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderState =
  | "idle"
  | "permission_denied"
  | "recording"
  | "recorded"
  | "error";

export interface RecordedClip {
  uri: string;
  durationMs: number;
}

// 16kHz mono AAC in an .m4a container — Deepgram's sweet spot, smaller files
// for faster upload over cell networks.
const RECORDING_OPTIONS: RecordingOptions = {
  extension: ".m4a",
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 32000,
  android: {
    outputFormat: "mpeg4",
    audioEncoder: "aac",
  },
  ios: {
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.HIGH,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: "audio/webm",
    bitsPerSecond: 32000,
  },
};

interface UseRecorder {
  state: RecorderState;
  elapsedMs: number;
  errorMessage?: string;
  start(): Promise<void>;
  stop(): Promise<RecordedClip | null>;
  reset(): void;
}

export function useRecorder(): UseRecorder {
  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const liveState = useAudioRecorderState(recorder, 100);
  const [state, setState] = useState<RecorderState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const startTimeRef = useRef<number | null>(null);

  // expo-audio's recorder fires status events; we'd handle iOS interruptions
  // here in a v2 (calls coming in mid-recording), but for v1 the default
  // behavior is fine.
  useEffect(() => {
    setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
    }).catch(() => {});
  }, []);

  const start = useCallback(async () => {
    setErrorMessage(undefined);
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setState("permission_denied");
        return;
      }
      await recorder.prepareToRecordAsync();
      recorder.record();
      startTimeRef.current = Date.now();
      setState("recording");
    } catch (e) {
      setState("error");
      setErrorMessage((e as Error).message);
    }
  }, [recorder]);

  const stop = useCallback(async (): Promise<RecordedClip | null> => {
    if (state !== "recording") return null;
    try {
      await recorder.stop();
      const startedAt = startTimeRef.current ?? Date.now();
      const durationMs =
        Math.round(liveState.durationMillis) || Date.now() - startedAt;
      const uri = recorder.uri;
      startTimeRef.current = null;
      if (!uri) {
        setState("error");
        setErrorMessage("recorder did not produce a file uri");
        return null;
      }
      setState("recorded");
      return { uri, durationMs };
    } catch (e) {
      setState("error");
      setErrorMessage((e as Error).message);
      return null;
    }
  }, [recorder, state, liveState.durationMillis]);

  const reset = useCallback(() => {
    setState("idle");
    setErrorMessage(undefined);
    startTimeRef.current = null;
  }, []);

  // The reactive `elapsedMs` should follow the recorder's own clock when
  // recording is live, and freeze on stop.
  const elapsedMs =
    state === "recording" ? Math.round(liveState.durationMillis) : 0;

  return { state, elapsedMs, errorMessage, start, stop, reset };
}
