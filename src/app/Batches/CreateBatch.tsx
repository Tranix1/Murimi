import { FarmButton, FarmDatePicker, FarmField } from "@/components/farm/FarmComponents";
import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";
import { useFarmRecords } from "@/hooks/useFarmRecords";
import { useThemeColor } from "@/hooks/useThemeColor";
import { createFarmRecord, saveBatchRecord } from "@/services/farmRepository";
import type { Batch, EnterpriseType, FarmSupplier } from "@/types/farm";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { BatchPage } from "./_components";

const enterprises: { key: EnterpriseType; label: string }[] = [
  { key: "broiler", label: "Broilers" },
  { key: "pigs", label: "Pigs" },
  { key: "fish", label: "Fish" },
  { key: "crops", label: "Crops" },
  { key: "other", label: "Other" },
];

const optionalNumber = (value: string) => value.trim() ? Number(value) : undefined;

export default function CreateBatchScreen() {
  const { user, activeAccountId } = useAuth();
  const { records: batches, isLoading: batchesLoading } = useFarmRecords<Batch>("batches");
  const { records: suppliers } = useFarmRecords<FarmSupplier>("suppliers");
  const [batchNumber, setBatchNumber] = useState("");
  const [name, setName] = useState("");
  const [enterprise, setEnterprise] = useState<EnterpriseType>("broiler");
  const [stockType, setStockType] = useState("Cobb");
  const [customBreed, setCustomBreed] = useState("");
  const [supplier, setSupplier] = useState("");
  const [supplierId, setSupplierId] = useState<string | undefined>();
  const [saveSupplier, setSaveSupplier] = useState(false);
  const [dateStarted, setDateStarted] = useState(localDate(new Date()));
  const [quantity, setQuantity] = useState("");
  const [paidQuantity, setPaidQuantity] = useState("");
  const [costPerUnit, setCostPerUnit] = useState("");
  const [transportCost, setTransportCost] = useState("");
  const [setupCost, setSetupCost] = useState("");
  const [showOptionalCosts, setShowOptionalCosts] = useState(false);
  const [duration, setDuration] = useState("");
  const [expectedSaleDate, setExpectedSaleDate] = useState("");
  const [targetWeight, setTargetWeight] = useState("");
  const [expectedPrice, setExpectedPrice] = useState("");
  const [plannedFeed, setPlannedFeed] = useState("");
  const [initialAverageWeight, setInitialAverageWeight] = useState("");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accent = useThemeColor("accent");
  const border = useThemeColor("border");
  const surface = useThemeColor("backgroundLight");
  const muted = useThemeColor("textlight");
  const danger = useThemeColor("bad");

  useEffect(() => {
    if (batchNumber || batchesLoading) return;
    const highest = batches.map((batch) => (batch.batchNumber ?? batch.name).match(/(?:batch\s*)?(\d+)\s*$/i)?.[1]).filter((number): number is string => !!number).map(Number).filter(Number.isSafeInteger);
    setBatchNumber(String(Math.max(0, ...highest) + 1));
  }, [batches, batchNumber, batchesLoading]);

  const save = async () => {
    const initialQuantity = Number(quantity);
    const numberFields = [initialQuantity, transportCost.trim() ? Number(transportCost) : 0, setupCost.trim() ? Number(setupCost) : 0];
    if (!user?.uid || !activeAccountId) {
      setError("Sign in and select an account before creating a batch.");
      return;
    }
    if (!name.trim() || !Number.isInteger(initialQuantity) || initialQuantity <= 0 || !dateStarted.trim()) {
      setError("Enter a batch name, a valid starting bird count and a start date.");
      return;
    }
    if (enterprise === "broiler" && stockType === "Custom" && !customBreed.trim()) {
      setError("Enter the custom broiler breed name.");
      return;
    }
    if (numberFields.some((value) => !Number.isFinite(value) || value < 0)) {
      setError("Costs and quantities must be zero or greater.");
      return;
    }
    const paidBirds = optionalNumber(paidQuantity);
    if (paidBirds !== undefined && (!Number.isInteger(paidBirds) || paidBirds < 0)) {
      setError("Birds paid for must be a whole number, zero or greater.");
      return;
    }
    const optionalFields = [costPerUnit, duration, targetWeight, expectedPrice, plannedFeed, initialAverageWeight]
      .map(optionalNumber)
      .filter((value): value is number => value !== undefined);
    if (optionalFields.some((value) => !Number.isFinite(value) || value < 0)) {
      setError("Optional numeric values must also be zero or greater.");
      return;
    }
    setError(null);
    setIsSaving(true);
    const initialAverageWeightKg = optionalNumber(initialAverageWeight);
    const data: Omit<Batch, "id" | "ownerId" | "accountId" | "createdAt" | "updatedAt"> & { currentBirdsAlive: number } = {
      name: name.trim(),
      batchNumber: batchNumber.trim(),
      enterprise,
      stockType: enterprise === "broiler" ? stockType === "Custom" ? customBreed.trim() : stockType : stockType.trim() || enterprise,
      supplier: supplier.trim() || undefined,
      dateStarted,
      initialQuantity,
      paidQuantity: paidBirds ?? initialQuantity,
      costPerUnit: optionalNumber(costPerUnit),
      initialAverageWeightKg,
      transportCost: transportCost.trim() ? Number(transportCost) : 0,
      setupCost: setupCost.trim() ? Number(setupCost) : 0,
      expectedDurationDays: optionalNumber(duration),
      expectedSaleDate: expectedSaleDate.trim() || undefined,
      targetLiveWeightKg: optionalNumber(targetWeight),
      expectedSellingPrice: optionalNumber(expectedPrice),
      plannedFeedKg: optionalNumber(plannedFeed),
      notes: notes.trim() || undefined,
      status: "growing",
      productionComplete: false,
      sellingComplete: false,
      currentBirdsAlive: initialQuantity,
    };
    try {
      let linkedSupplierId = supplierId;
      if (supplier.trim() && saveSupplier && !linkedSupplierId) {
        const matchingSupplier = suppliers.find((item) => item.name.trim().toLocaleLowerCase() === supplier.trim().toLocaleLowerCase());
        linkedSupplierId = matchingSupplier?.id ?? await createFarmRecord(user.uid, activeAccountId, "suppliers", { name: supplier.trim(), active: true });
      }
      data.supplierId = linkedSupplierId;
      const id = await saveBatchRecord(user.uid, activeAccountId, data);
      Alert.alert("Batch created", `${name.trim()} is saved to your farm account.`);
      router.replace({ pathname: "/Batches/BatchDetails" as never, params: { batchId: id } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save this batch. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <BatchPage title="Create batch">
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <ThemedText color={muted}>Enter what you know now. Optional details can be added later.</ThemedText>
        <ThemedText type="defaultSemiBold">Enterprise</ThemedText>
        <View style={styles.choices}>
          {enterprises.map((item) => {
            const selected = enterprise === item.key;
            return <TouchableOpacity key={item.key} onPress={() => setEnterprise(item.key)} style={[styles.choice, { backgroundColor: selected ? accent : surface, borderColor: selected ? accent : border }]}><ThemedText type="tiny" color={selected ? "#FFFFFF" : muted} style={styles.choiceText}>{item.label}</ThemedText></TouchableOpacity>;
          })}
        </View>
        <FarmField label="Batch name" value={name} onChangeText={setName} placeholder="For example, Broilers July" />
        <FarmField label="Batch number" value={batchNumber} onChangeText={setBatchNumber} keyboardType="number-pad" placeholder="Suggested automatically; editable" />
        {enterprise === "broiler" ? <>
          <ThemedText type="defaultSemiBold">Broiler breed</ThemedText>
          <View style={styles.choices}>{["Cobb", "Ross", "Custom"].map((breed) => {
            const selected = stockType === breed;
            return <TouchableOpacity key={breed} onPress={() => setStockType(breed)} style={[styles.choice, { backgroundColor: selected ? accent : surface, borderColor: selected ? accent : border }]}><ThemedText type="tiny" color={selected ? "#FFFFFF" : muted} style={styles.choiceText}>{breed}</ThemedText></TouchableOpacity>;
          })}</View>
          {stockType === "Custom" && <FarmField label="Custom broiler breed" value={customBreed} onChangeText={setCustomBreed} placeholder="Enter breed name" />}
        </> : <FarmField label="Breed or stock type" value={stockType} onChangeText={setStockType} placeholder="Stock type" />}
        <FarmField label="Supplier (optional)" value={supplier} onChangeText={(value) => { setSupplier(value); setSupplierId(undefined); }} placeholder="Supplier name" />
        {suppliers.filter((item) => item.active).length > 0 && <>
          <ThemedText type="tiny" color={muted}>Saved suppliers</ThemedText>
          <View style={styles.choices}>{suppliers.filter((item) => item.active).map((item) => {
            const selected = supplierId === item.id;
            return <TouchableOpacity key={item.id} onPress={() => { setSupplier(item.name); setSupplierId(item.id); setSaveSupplier(false); }} style={[styles.choice, { backgroundColor: selected ? accent : surface, borderColor: selected ? accent : border }]}><ThemedText type="tiny" color={selected ? "#FFFFFF" : muted} style={styles.choiceText}>{item.name}</ThemedText></TouchableOpacity>;
          })}</View>
        </>}
        <TouchableOpacity onPress={() => setSaveSupplier(!saveSupplier)} style={[styles.optionalToggle, { borderColor: border, backgroundColor: surface }]} disabled={!!supplierId || !supplier.trim()}><ThemedText type="tiny" color={supplierId ? accent : muted}>{supplierId ? "Saved supplier · linked by ID" : `${saveSupplier ? "☑" : "☐"} Save supplier for future batches`}</ThemedText></TouchableOpacity>
        <FarmDatePicker label="Arrival / start date" value={dateStarted} onChange={setDateStarted} />
        <FarmField label="Initial birds placed" value={quantity} onChangeText={setQuantity} keyboardType="number-pad" placeholder="Required" />
        <TouchableOpacity onPress={() => setShowOptionalCosts(!showOptionalCosts)} style={[styles.optionalToggle, { borderColor: border, backgroundColor: surface }]}><ThemedText type="defaultSemiBold" color={accent}>{showOptionalCosts ? "− Hide optional initial costs" : "+ Add initial costs (optional)"}</ThemedText></TouchableOpacity>
        {showOptionalCosts && <><FarmField label="Birds paid for (optional)" value={paidQuantity} onChangeText={setPaidQuantity} keyboardType="number-pad" placeholder="Leave blank if same as birds placed" /><ThemedText type="tiny" color={muted}>Use this when you received extra birds that were not charged. Chick cost is based on birds paid for, not birds placed.</ThemedText><FarmField label="Cost per chick (optional)" value={costPerUnit} onChangeText={setCostPerUnit} keyboardType="decimal-pad" placeholder="0.00" /><FarmField label="Transport cost (optional)" value={transportCost} onChangeText={setTransportCost} keyboardType="decimal-pad" placeholder="0.00" /><FarmField label="Initial setup costs (optional)" value={setupCost} onChangeText={setSetupCost} keyboardType="decimal-pad" placeholder="0.00" /></>}
        <FarmField label="Expected duration in days (optional)" value={duration} onChangeText={setDuration} keyboardType="number-pad" placeholder="For planning" />
        <FarmDatePicker label="Expected sale date (optional)" value={expectedSaleDate} onChange={setExpectedSaleDate} />
        <FarmField label="Target live weight in kg (optional)" value={targetWeight} onChangeText={setTargetWeight} keyboardType="decimal-pad" placeholder="0.00" />
        <FarmField label="Expected selling price (optional)" value={expectedPrice} onChangeText={setExpectedPrice} keyboardType="decimal-pad" placeholder="0.00" />
        <FarmField label="Planned feed in kg (optional)" value={plannedFeed} onChangeText={setPlannedFeed} keyboardType="decimal-pad" placeholder="0" />
        <FarmField label="Initial average live weight (optional)" value={initialAverageWeight} onChangeText={setInitialAverageWeight} keyboardType="decimal-pad" placeholder="For FCR calculations" />
        <FarmField label="Notes (optional)" value={notes} onChangeText={setNotes} multiline placeholder="Additional batch details" />
        {error && <ThemedText color={danger}>{error}</ThemedText>}
        <FarmButton label="Save batch" onPress={() => void save()} disabled={isSaving} />
      </ScrollView>
    </BatchPage>
  );
}

function localDate(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }

const styles = StyleSheet.create({
  form: { padding: 18, paddingBottom: 32, gap: 16 },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: { borderWidth: 1, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 20 },
  choiceText: { fontWeight: "700" },
  optionalToggle: { minHeight: 46, borderWidth: 1, borderRadius: 13, padding: 13, justifyContent: "center" },
});