import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { useFarmSync } from "@/context/FarmSyncContext";
import { useThemeColor } from "@/hooks/useThemeColor";

export function FarmSyncStatus() {
  const { state, pendingCount, failedCount, error, retry } = useFarmSync();
  const accent = useThemeColor("accent"); const muted = useThemeColor("textlight"); const danger = useThemeColor("bad");
  if (state === "signed_out") return null;
  const isFailed = state === "failed" || failedCount > 0;
  const isOffline = state === "offline" || state === "saved_offline";
  const label = state === "syncing" ? "Syncing farm records…" : isFailed ? `Sync failed · ${pendingCount} pending` : isOffline ? pendingCount ? `${pendingCount} saved offline` : "Offline · saved records available" : pendingCount ? `${pendingCount} pending changes` : "Farm records synced";
  const color = isFailed ? danger : isOffline ? muted : accent;
  return <View accessibilityRole="summary" style={styles.container}>
    <Ionicons name={isFailed ? "alert-circle-outline" : isOffline ? "cloud-offline-outline" : state === "syncing" ? "sync-outline" : "cloud-done-outline"} size={15} color={color} />
    <ThemedText type="tiny" color={color} style={styles.label}>{label}</ThemedText>
    {isFailed ? <TouchableOpacity onPress={() => void retry()} accessibilityRole="button" accessibilityLabel="Retry farm synchronization"><ThemedText type="tiny" color={accent} style={styles.retry}>Retry</ThemedText></TouchableOpacity> : null}
    {error && isFailed ? <ThemedText accessibilityLiveRegion="polite" style={styles.hidden}>{error}</ThemedText> : null}
  </View>;
}

const styles = StyleSheet.create({ container: { minHeight: 32, paddingHorizontal: 19, flexDirection: "row", alignItems: "center", gap: 7 }, label: { flex: 1 }, retry: { fontWeight: "700", paddingVertical: 5, paddingLeft: 8 }, hidden: { display: "none" } });
