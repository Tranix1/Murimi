import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { useThemeColor } from "@/hooks/useThemeColor";

type CustomHeaderProps = {
  pageTitle?: string;
  addingNavigate?: string;
  filterElement?: (value: boolean) => void;
  selectProfileImage?: () => void;
  selectedImage?: { uri: string } | null;
};

export default function CustomHeader({ pageTitle = "Murimi", addingNavigate, filterElement }: CustomHeaderProps) {
  const accent = useThemeColor("accent");
  const background = useThemeColor("background");
  const text = useThemeColor("text");
  const muted = useThemeColor("textlight");
  const border = useThemeColor("border");

  const handleAction = () => {
    if (addingNavigate) {
      router.push(addingNavigate as never);
      return;
    }
    if (filterElement) {
      filterElement(true);
      return;
    }
    router.push("/Account/Accounts" as never);
  };

  return (
    <View style={[styles.container, { backgroundColor: background, borderBottomColor: border }]}>
      <View style={styles.titleGroup}>
        <View style={[styles.logoMark, { backgroundColor: `${accent}18` }]}>
          <Ionicons name="leaf-outline" size={21} color={accent} />
        </View>
        <View style={styles.titleText}>
          <ThemedText type="subtitle" style={[styles.title, { color: text }]}>{pageTitle}</ThemedText>
          <ThemedText type="tiny" style={{ color: muted }}>Your farm at a glance</ThemedText>
        </View>
      </View>

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={addingNavigate ? "Add" : filterElement ? "Filter" : "Switch account"}
        activeOpacity={0.75}
        onPress={handleAction}
        style={[styles.action, { backgroundColor: `${accent}14` }]}
      >
        <Ionicons
          name={addingNavigate ? "add" : filterElement ? "options-outline" : "swap-horizontal-outline"}
          size={20}
          color={accent}
        />
        {!addingNavigate && !filterElement && <ThemedText type="tiny" style={[styles.actionLabel, { color: accent }]}>Accounts</ThemedText>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 72,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  titleGroup: { flexDirection: "row", alignItems: "center", flex: 1, gap: 11 },
  logoMark: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  titleText: { flex: 1, gap: 1 },
  title: { fontSize: 21, lineHeight: 25 },
  action: { minHeight: 42, borderRadius: 13, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  actionLabel: { fontWeight: "700" },
});
