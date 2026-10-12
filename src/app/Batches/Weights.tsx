import React, { useState } from "react";
import { Alert, ScrollView } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { BatchPage } from "./_components";
import { FarmButton, FarmDatePicker, FarmField } from "@/components/farm/FarmComponents";
import { ThemedText } from "@/components/ThemedText";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useAuth } from "@/context/AuthContext";
import { createFarmRecord } from "@/services/farmRepository";
import { useFarmRecords } from "@/hooks/useFarmRecords";
import type { Batch, WeightMeasurement } from "@/types/farm";

export default function WeightEntryScreen() {
  const { batchId } = useLocalSearchParams<{ batchId?: string }>();
  const { user, activeAccountId } = useAuth();
  const { records: batches } = useFarmRecords<Batch>("batches");
  const batch = batches.find((item) => item.id === batchId);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [weights, setWeights] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const muted = useThemeColor("textlight");
  const bad = useThemeColor("bad");

  const save = async () => {
    const values = weights.split(/[\s,;]+/).map(Number).filter((value) => Number.isFinite(value) && value > 0);
    if (!user?.uid || !activeAccountId || !batchId || !batch) return setError("The batch account could not be found.");
    if (batch.status === "completed" || batch.status === "archived") return setError("This batch is closed. Ordinary measurements cannot be added.");
    if (!values.length || values.length !== weights.split(/[\s,;]+/).filter(Boolean).length) return setError("Enter one or more valid weights in kilograms.");
    setSaving(true);
    setError(null);
    try {
      const averageKg = values.reduce((sum, value) => sum + value, 0) / values.length;
      await createFarmRecord<Omit<WeightMeasurement, "id" | "ownerId" | "accountId" | "createdAt" | "updatedAt">>(user.uid, activeAccountId, "weights", {
        batchId, date, sampleSize: values.length, weightsKg: values, averageKg, minimumKg: Math.min(...values), maximumKg: Math.max(...values),
      });
      Alert.alert("Weights saved", `Average sample weight: ${averageKg.toFixed(2)} kg.`);
      router.back();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save weights.");
    } finally {
      setSaving(false);
    }
  };

  return <BatchPage title="Weight record"><ScrollView contentContainerStyle={{ padding: 18, gap: 16 }} keyboardShouldPersistTaps="handled">
    <ThemedText color={muted}>Enter individual sample weights in kg, separated by commas or spaces. Murimi will calculate the average, minimum and maximum.</ThemedText>
    <FarmDatePicker label="Date" value={date} onChange={setDate} />
    <FarmField label="Sample weights (kg)" value={weights} onChangeText={setWeights} multiline placeholder="For example: 1.05, 1.12, 1.08" />
    {error && <ThemedText color={bad}>{error}</ThemedText>}
    <FarmButton label="Save weights" onPress={() => void save()} disabled={saving} />
  </ScrollView></BatchPage>;
}
