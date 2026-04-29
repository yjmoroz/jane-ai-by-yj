import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { startConnectivityWatcher } from "@/src/storage/connectivity";
import { getDb } from "@/src/storage/db";

export default function RootLayout() {
  useEffect(() => {
    // Open the DB once on mount; the schema is created lazily.
    getDb();
    // Watch for offline → online transitions and drain the queue.
    return startConnectivityWatcher();
  }, []);

  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <StatusBar style="auto" />
    </>
  );
}
