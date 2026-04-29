import { addNetworkStateListener, getNetworkStateAsync } from "expo-network";
import { drain } from "./queue";

// Subscribe once at app launch. Returns the cleanup function.
export function startConnectivityWatcher(): () => void {
  let lastReachable: boolean | undefined;

  // Best-effort initial state probe so we don't miss a "we came online during
  // boot" transition.
  getNetworkStateAsync()
    .then((s) => {
      lastReachable = s.isInternetReachable ?? s.isConnected ?? false;
      if (lastReachable) void drain();
    })
    .catch(() => {});

  const sub = addNetworkStateListener(({ isInternetReachable, isConnected }) => {
    const reachable = isInternetReachable ?? isConnected ?? false;
    // Only fire on offline → online transitions.
    if (lastReachable === false && reachable) {
      void drain();
    }
    lastReachable = reachable;
  });

  return () => sub.remove();
}
