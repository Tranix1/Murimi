/* eslint react-hooks/set-state-in-effect: "off" -- populate the daily form from a saved local record for editing. */
import React, { useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { BatchPage } from "./_components";
import { FarmButton, FarmDatePicker, FarmField } from "@/components/farm/FarmComponents";
import { ThemedText } from "@/components/ThemedText";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useAuth } from "@/context/AuthContext";
import { useFarmRecords } from "@/hooks/useFarmRecords";
import { saveDailyRecord } from "@/services/farmRepository";
import type { Batch, DailyRecord, DeathCause } from "@/types/farm";

type CauseInput = { quantity: string; cause: string; symptoms: string; actionTaken: string };
const today = () => new Date().toISOString().slice(0, 10);

export default function RecordTodayScreen() {
  const { batchId } = useLocalSearchParams<{ batchId?: string }>();
  const { user, activeAccountId } = useAuth();
  const { records: batches } = useFarmRecords<Batch>("batches");
  const { records } = useFarmRecords<DailyRecord>("dailyRecords");
  const [date, setDate] = useState(today());
  const [causes, setCauses] = useState<CauseInput[]>([]);
  const [removals, setRemovals] = useState("0");
  const [additions, setAdditions] = useState("0");
  const [feedType, setFeedType] = useState("");
  const [feedKg, setFeedKg] = useState("");
  const [waterLitres, setWaterLitres] = useState("");
  const [temperature, setTemperature] = useState("");
  const [humidity, setHumidity] = useState("");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accent = useThemeColor("accent");
  const border = useThemeColor("border");
  const surface = useThemeColor("backgroundLight");
  const muted = useThemeColor("textlight");
  const bad = useThemeColor("bad");
  const batch = batches.find((item) => item.id === batchId);

  const existing = records.find((record) => record.batchId === batchId && record.date === date);
  const openingCount = useMemo(() => {
    if (existing) return existing.openingCount;
    const prior = records.filter((record) => record.batchId === batchId && record.date < date).sort((a, b) => b.date.localeCompare(a.date))[0];
    return prior?.closingCount ?? (batch?.currentBirdsAlive ?? batch?.initialQuantity ?? 0);
  }, [records, batchId, date, batch, existing]);
  const deaths = causes.reduce((sum, cause) => sum + (Number(cause.quantity) || 0), 0);
  const closingCount = openingCount - deaths - (Number(removals) || 0) + (Number(additions) || 0);

  useEffect(() => {
    if (!existing) return;
    setCauses(existing.deathCauses.map((cause) => ({ quantity: String(cause.quantity), cause: cause.cause, symptoms: cause.symptoms ?? "", actionTaken: cause.actionTaken ?? "" })));
    setRemovals(String(existing.removals));
    setAdditions(String(existing.additions));
    setFeedType(existing.feedType ?? "");
    setFeedKg(existing.feedKg == null ? "" : String(existing.feedKg));
    setWaterLitres(existing.waterLitres == null ? "" : String(existing.waterLitres));
    setTemperature(existing.temperatureC == null ? "" : String(existing.temperatureC));
    setHumidity(existing.humidityPercent == null ? "" : String(existing.humidityPercent));
    setNotes(existing.notes ?? "");
  }, [existing?.id]);

  const save = async () => {
    if (!user?.uid || !activeAccountId || !batch) {
      setError("Select a farm account and batch before saving.");
      return;
    }
    const numeric = [Number(removals), Number(additions), ...(feedKg ? [Number(feedKg)] : []), ...(waterLitres ? [Number(waterLitres)] : [])];
    if (numeric.some((value) => !Number.isFinite(value) || value < 0) || closingCount < 0) {
      setError("Counts and quantities must be valid and cannot reduce birds below zero.");
      return;
    }
    if (causes.some((cause) => cause.quantity && (!Number.isInteger(Number(cause.quantity)) || Number(cause.quantity) < 0))) {
      setError("Death counts must be whole numbers greater than or equal to zero.");
      return;
    }
    const deathCauses: DeathCause[] = causes.filter((cause) => Number(cause.quantity) > 0).map((cause) => ({ quantity: Number(cause.quantity), cause: cause.cause.trim() || "unknown", symptoms: cause.symptoms.trim() || undefined, actionTaken: cause.actionTaken.trim() || undefined }));
    setIsSaving(true);
    setError(null);
    try {
      await saveDailyRecord(user.uid, activeAccountId, batch, {
        date,
        deaths,
        deathCauses,
        removals: Number(removals),
        additions: Number(additions),
        feedType: feedType.trim() || undefined,
        feedKg: feedKg ? Number(feedKg) : undefined,
        waterLitres: waterLitres ? Number(waterLitres) : undefined,
        temperatureC: temperature ? Number(temperature) : undefined,
        humidityPercent: humidity ? Number(humidity) : undefined,
        notes: notes.trim() || undefined,
        openingCount,
      });
      Alert.alert("Record saved", `Closing count: ${closingCount} birds.`);
      router.back();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the daily record.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <BatchPage title="Record today">
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <ThemedText type="tiny" color={muted}>One daily record per date. Saving the same date edits its existing record.</ThemedText>
        <FarmDatePicker label="Date" value={date} onChange={setDate} />
        <View style={[styles.countCard, { backgroundColor: surface, borderColor: border }]}>
          <ThemedText type="tiny" color={muted}>Opening birds</ThemedText>
          <ThemedText type="subtitle">{openingCount.toLocaleString()}</ThemedText>
          <ThemedText type="tiny" color={muted}>Closing birds after entries</ThemedText>
          <ThemedText type="subtitle" color={closingCount < 0 ? bad : accent}>{Math.max(0, closingCount).toLocaleString()}</ThemedText>
        </View>
        <View style={styles.causeTitle}>
          <ThemedText type="defaultSemiBold">Deaths and causes</ThemedText>
          <TouchableOpacity onPress={() => setCauses((current) => [...current, { quantity: "", cause: "unknown", symptoms: "", actionTaken: "" }])} style={[styles.addCause, { backgroundColor: `${accent}18` }]}>
            <ThemedText type="tiny" color={accent} style={styles.addCauseText}>+ Add cause</ThemedText>
          </TouchableOpacity>
        </View>
        {causes.length === 0 && <ThemedText type="tiny" color={muted}>No deaths recorded today.</ThemedText>}
        {causes.map((cause, index) => (
          <View key={`cause-${index}`} style={[styles.causeCard, { backgroundColor: surface, borderColor: border }]}>
            <FarmField label={`Cause ${index + 1} · quantity`} value={cause.quantity} onChangeText={(value) => setCauses((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: value } : item))} keyboardType="number-pad" placeholder="Number of birds" />
            <FarmField label="Cause" value={cause.cause} onChangeText={(value) => setCauses((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, cause: value } : item))} placeholder="Unknown, injury, illness…" />
            <FarmField label="Symptoms (optional)" value={cause.symptoms} onChangeText={(value) => setCauses((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, symptoms: value } : item))} placeholder="Observed signs" />
            <FarmField label="Action taken (optional)" value={cause.actionTaken} onChangeText={(value) => setCauses((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, actionTaken: value } : item))} placeholder="What was done" />
            <TouchableOpacity onPress={() => setCauses((items) => items.filter((_, itemIndex) => itemIndex !== index))}><ThemedText type="tiny" color={bad}>Remove cause</ThemedText></TouchableOpacity>
          </View>
        ))}
        <FarmField label="Other removals" value={removals} onChangeText={setRemovals} keyboardType="number-pad" placeholder="0" />
        <FarmField label="Additions / transfers in" value={additions} onChangeText={setAdditions} keyboardType="number-pad" placeholder="0" />
        <FarmField label="Feed type (optional)" value={feedType} onChangeText={setFeedType} placeholder="Starter, grower, finisher…" />
        <FarmField label="Feed consumed in kg (optional)" value={feedKg} onChangeText={setFeedKg} keyboardType="decimal-pad" placeholder="0" />
        <FarmField label="Water consumed in litres (optional)" value={waterLitres} onChangeText={setWaterLitres} keyboardType="decimal-pad" placeholder="0" />
        <FarmField label="Temperature °C (optional)" value={temperature} onChangeText={setTemperature} keyboardType="decimal-pad" placeholder="Measured value" />
        <FarmField label="Humidity % (optional)" value={humidity} onChangeText={setHumidity} keyboardType="decimal-pad" placeholder="Measured value" />
        <FarmField label="Observations and notes (optional)" value={notes} onChangeText={setNotes} multiline placeholder="Daily observations" />
        {error && <ThemedText color={bad}>{error}</ThemedText>}
        <FarmButton label="Save daily record" onPress={() => void save()} disabled={isSaving} />
      </ScrollView>
    </BatchPage>
  );
}

const styles = StyleSheet.create({
  form: { padding: 17, paddingBottom: 28, gap: 15 },
  countCard: { borderWidth: 1, borderRadius: 15, padding: 14, flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 },
  causeTitle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  addCause: { borderRadius: 18, paddingHorizontal: 11, paddingVertical: 7 },
  addCauseText: { fontWeight: "700" },
  causeCard: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 12 },
});
