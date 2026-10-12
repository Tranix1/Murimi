import React, { useState } from "react";
import { Alert, ScrollView } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { BatchPage } from "./_components";
import { FarmButton, FarmDatePicker, FarmField } from "@/components/farm/FarmComponents";
import { ThemedText } from "@/components/ThemedText";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useAuth } from "@/context/AuthContext";
import { useFarmRecords } from "@/hooks/useFarmRecords";
import { saveSlaughter } from "@/services/farmRepository";
import type { Batch } from "@/types/farm";

export default function SlaughterScreen() {
  const { batchId } = useLocalSearchParams<{ batchId?: string }>();
  const { user, activeAccountId } = useAuth();
  const { records: batches } = useFarmRecords<Batch>("batches");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [quantity, setQuantity] = useState("");
  const [liveWeight, setLiveWeight] = useState("");
  const [dressedWeight, setDressedWeight] = useState("");
  const [saleable, setSaleable] = useState("");
  const [rejected, setRejected] = useState("0");
  const [processingCost, setProcessingCost] = useState("0");
  const [packagingCost, setPackagingCost] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const muted = useThemeColor("textlight");
  const bad = useThemeColor("bad");
  const batch = batches.find((item) => item.id === batchId);

  const save = async () => {
    const quantitySlaughtered = Number(quantity);
    const values = [quantitySlaughtered, Number(liveWeight), Number(dressedWeight), Number(saleable), Number(rejected), Number(processingCost), Number(packagingCost)];
    if (!user?.uid || !activeAccountId || !batch) return setError("The batch account could not be found.");
    if (values.some((value) => !Number.isFinite(value) || value < 0) || !Number.isInteger(quantitySlaughtered) || quantitySlaughtered <= 0) return setError("Enter valid quantities and costs. Birds slaughtered must be a whole number above zero.");
    if (Number(saleable) + Number(rejected) > quantitySlaughtered) return setError("Saleable and rejected birds cannot exceed the slaughter quantity.");
    setSaving(true);
    setError(null);
    try {
      await saveSlaughter(user.uid, activeAccountId, batch, {
        date, quantitySlaughtered, liveWeightKg: Number(liveWeight), dressedWeightKg: Number(dressedWeight),
        saleableBirds: Number(saleable), rejectedBirds: Number(rejected), processingCost: Number(processingCost), packagingCost: Number(packagingCost),
      });
      Alert.alert("Slaughter recorded", "The available bird count has been updated.");
      router.back();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the slaughter record.");
    } finally {
      setSaving(false);
    }
  };

  return <BatchPage title="Slaughter record"><ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 28, gap: 15 }} keyboardShouldPersistTaps="handled">
    <ThemedText color={muted}>Available birds: {batch?.currentBirdsAlive ?? batch?.initialQuantity ?? "—"}</ThemedText>
    <FarmDatePicker label="Slaughter date" value={date} onChange={setDate} />
    <FarmField label="Birds slaughtered" value={quantity} onChangeText={setQuantity} keyboardType="number-pad" placeholder="0" />
    <FarmField label="Corresponding live weight (kg)" value={liveWeight} onChangeText={setLiveWeight} keyboardType="decimal-pad" placeholder="For this group" />
    <FarmField label="Total dressed weight (kg)" value={dressedWeight} onChangeText={setDressedWeight} keyboardType="decimal-pad" placeholder="For this same group" />
    <FarmField label="Saleable dressed birds" value={saleable} onChangeText={setSaleable} keyboardType="number-pad" placeholder="0" />
    <FarmField label="Rejected or damaged birds" value={rejected} onChangeText={setRejected} keyboardType="number-pad" placeholder="0" />
    <FarmField label="Processing cost" value={processingCost} onChangeText={setProcessingCost} keyboardType="decimal-pad" placeholder="0.00" />
    <FarmField label="Packaging cost" value={packagingCost} onChangeText={setPackagingCost} keyboardType="decimal-pad" placeholder="0.00" />
    {error && <ThemedText color={bad}>{error}</ThemedText>}
    <FarmButton label="Save slaughter" onPress={() => void save()} disabled={saving} />
  </ScrollView></BatchPage>;
}
