import React from "react";
import { ActivityIndicator, Modal, StyleSheet, TextInput, TouchableOpacity, View, type KeyboardTypeOptions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { useThemeColor } from "@/hooks/useThemeColor";

export function FarmField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
}) {
  const border = useThemeColor("border");
  const surface = useThemeColor("backgroundLight");
  const muted = useThemeColor("textlight");
  const text = useThemeColor("text");
  return (
    <View style={styles.fieldGroup}>
      <ThemedText type="defaultSemiBold" style={styles.fieldLabel}>{label}</ThemedText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={muted}
        keyboardType={keyboardType}
        multiline={multiline}
        autoCapitalize={autoCapitalize}
        textAlignVertical={multiline ? "top" : "center"}
        style={[styles.input, { backgroundColor: surface, borderColor: border, color: text }, multiline && styles.multiline]}
      />
    </View>
  );
}

export function FarmButton({ label, onPress, disabled, secondary }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  const accent = useThemeColor("accent");
  const border = useThemeColor("border");
  const background = useThemeColor("backgroundLight");
  const text = useThemeColor("text");
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      disabled={disabled}
      style={[styles.button, { backgroundColor: secondary ? background : accent, borderColor: secondary ? border : accent, opacity: disabled ? 0.55 : 1 }]}
    >
      {disabled && <ActivityIndicator color={secondary ? text : "#FFFFFF"} size="small" />}
      <ThemedText type="defaultSemiBold" style={{ color: secondary ? text : "#FFFFFF" }}>{label}</ThemedText>
    </TouchableOpacity>
  );
}

export function FarmDatePicker({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [visible, setVisible] = React.useState(false);
  const initial = parseDate(value);
  const [month, setMonth] = React.useState(new Date(initial.getFullYear(), initial.getMonth(), 1));
  const border = useThemeColor("border"); const surface = useThemeColor("backgroundLight"); const accent = useThemeColor("accent"); const muted = useThemeColor("textlight"); const text = useThemeColor("text");
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate(); const offset = (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7;
  const selectDay = (day: number) => { onChange(`${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`); setVisible(false); };
  return <>
    <View style={styles.fieldGroup}><ThemedText type="defaultSemiBold" style={styles.fieldLabel}>{label}</ThemedText><TouchableOpacity accessibilityRole="button" onPress={() => { const selected = parseDate(value); setMonth(new Date(selected.getFullYear(), selected.getMonth(), 1)); setVisible(true); }} style={[styles.input, { backgroundColor: surface, borderColor: border, justifyContent: "center" }]}><ThemedText color={text}>{value}</ThemedText></TouchableOpacity></View>
    <Modal transparent visible={visible} animationType="fade" onRequestClose={() => setVisible(false)}>
      <View style={styles.dateBackdrop}><View style={[styles.dateDialog, { backgroundColor: surface, borderColor: border }]}>
        <View style={styles.dateHeader}><TouchableOpacity accessibilityLabel="Previous month" onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><Ionicons name="chevron-back" size={22} color={accent} /></TouchableOpacity><ThemedText type="defaultSemiBold" color={text}>{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</ThemedText><TouchableOpacity accessibilityLabel="Next month" onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><Ionicons name="chevron-forward" size={22} color={accent} /></TouchableOpacity></View>
        <View style={styles.dateGrid}>{["M", "T", "W", "T", "F", "S", "S"].map((day, index) => <ThemedText key={`weekday-${index}`} type="tiny" color={muted} style={styles.dateCell}>{day}</ThemedText>)}{Array.from({ length: offset }, (_, index) => <View key={`blank-${index}`} style={styles.dateCell} />)}{Array.from({ length: days }, (_, index) => { const day = index + 1; const selected = value === `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`; return <TouchableOpacity key={day} onPress={() => selectDay(day)} style={[styles.dateCell, selected && { backgroundColor: accent, borderRadius: 18 }]}><ThemedText type="tiny" color={selected ? "#FFFFFF" : text}>{day}</ThemedText></TouchableOpacity>; })}</View>
        <TouchableOpacity onPress={() => setVisible(false)} style={styles.dateCancel}><ThemedText color={accent}>Cancel</ThemedText></TouchableOpacity>
      </View></View>
    </Modal>
  </>;
}

function parseDate(value: string) { const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(); return Number.isNaN(parsed.getTime()) ? new Date() : parsed; }

export function FarmEmpty({ title, message, icon = "leaf-outline" }: { title: string; message: string; icon?: keyof typeof Ionicons.glyphMap }) {
  const accent = useThemeColor("accent");
  const muted = useThemeColor("textlight");
  const surface = useThemeColor("backgroundLight");
  return (
    <View style={[styles.empty, { backgroundColor: surface }]}>
      <Ionicons name={icon} size={26} color={accent} />
      <ThemedText type="defaultSemiBold">{title}</ThemedText>
      <ThemedText type="tiny" color={muted} style={styles.emptyMessage}>{message}</ThemedText>
    </View>
  );
}

export function FarmScreenHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const text = useThemeColor("text");
  const muted = useThemeColor("textlight");
  return (
    <View style={styles.screenHeader}>
      <ThemedText type="title" color={text} style={styles.screenTitle}>{title}</ThemedText>
      {subtitle && <ThemedText type="tiny" color={muted}>{subtitle}</ThemedText>}
    </View>
  );
}

const styles = StyleSheet.create({
  fieldGroup: { gap: 7 },
  fieldLabel: { fontSize: 14 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 11, fontSize: 15 },
  multiline: { minHeight: 92 },
  button: { minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, flexDirection: "row", gap: 9, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", justifyContent: "center", gap: 8, padding: 24, borderRadius: 17, marginVertical: 10 },
  emptyMessage: { textAlign: "center", lineHeight: 18, maxWidth: 280 },
  screenHeader: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12, gap: 4 },
  screenTitle: { fontSize: 24, lineHeight: 30 },
  dateBackdrop: { flex: 1, backgroundColor: "#0008", justifyContent: "center", padding: 24 },
  dateDialog: { borderWidth: 1, borderRadius: 18, padding: 16, alignSelf: "center", width: "100%", maxWidth: 360 },
  dateHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  dateGrid: { flexDirection: "row", flexWrap: "wrap" },
  dateCell: { width: "14.285%", height: 40, alignItems: "center", justifyContent: "center" },
  dateCancel: { alignSelf: "flex-end", padding: 10 },
});
