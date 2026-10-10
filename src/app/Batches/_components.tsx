import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import ScreenWrapper from "@/components/ScreenWrapper";
import { ThemedText } from "@/components/ThemedText";
import { useThemeColor } from "@/hooks/useThemeColor";

export function BatchPage({ title, children }: { title: string; children: React.ReactNode }) {
  const border = useThemeColor("border");
  const surface = useThemeColor("backgroundLight");
  const accent = useThemeColor("accent");
  return (
    <ScreenWrapper fh={false}>
      <View style={[styles.header, { borderBottomColor: border }]}>
        <TouchableOpacity onPress={() => router.back()} style={[styles.back, { backgroundColor: surface }]} accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={20} color={accent} />
        </TouchableOpacity>
        <ThemedText type="subtitle" style={styles.title}>{title}</ThemedText>
        <View style={styles.spacer} />
      </View>
      <View style={styles.content}>{children}</View>
    </ScreenWrapper>
  );
}

export const batchStyles = StyleSheet.create({
  body: { flex: 1, padding: 20, gap: 16 },
  fieldGroup: { gap: 7 },
  fieldLabel: { fontWeight: "700" },
  field: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, justifyContent: "center" },
  button: { minHeight: 48, borderRadius: 13, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, marginTop: 8 },
  buttonText: { color: "#FFFFFF", fontWeight: "700" },
  note: { lineHeight: 21 },
});

const styles = StyleSheet.create({
  header: { minHeight: 64, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  back: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 19, flex: 1 },
  spacer: { width: 38 },
  content: { flex: 1 },
});
