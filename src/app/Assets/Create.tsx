/* eslint react-hooks/set-state-in-effect: "off" -- hydrate the edit form when its local record arrives. */
import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { BatchPage } from "@/app/Batches/_components";
import { FarmButton, FarmDatePicker, FarmField } from "@/components/farm/FarmComponents";
import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";
import { useFarmRecords } from "@/hooks/useFarmRecords";
import { useThemeColor } from "@/hooks/useThemeColor";
import { createFarmRecord, updateFarmRecord } from "@/services/farmRepository";
import type { AssetCategory, FarmAsset, FinancialTransaction } from "@/types/farm";
const categories: AssetCategory[] = ["land", "buildings", "fencing", "water", "feeders_drinkers", "heating", "scales", "power", "vehicles", "machinery", "other"];
export default function AssetFormScreen() {
  const { assetId } = useLocalSearchParams<{ assetId?: string }>(); const { user, activeAccountId } = useAuth(); const { records } = useFarmRecords<FarmAsset>("assets"); const { records: transactions } = useFarmRecords<FinancialTransaction>("transactions"); const old = records.find((x) => x.id === assetId);
  const [name, setName] = useState(""); const [category, setCategory] = useState<AssetCategory>("other"); const [cost, setCost] = useState(""); const [value, setValue] = useState(""); const [quantity, setQuantity] = useState("1"); const [location, setLocation] = useState(""); const [description, setDescription] = useState(""); const [status, setStatus] = useState<NonNullable<FarmAsset["status"]>>("not_in_use"); const [disposalDate, setDisposalDate] = useState(localDate()); const [disposalProceeds, setDisposalProceeds] = useState(""); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const border = useThemeColor("border"); const surface = useThemeColor("backgroundLight"); const accent = useThemeColor("accent"); const danger = useThemeColor("bad");
  useEffect(() => { if (old) { setName(old.name); setCategory(old.category); setCost(String(old.originalCost)); setValue(String(old.estimatedValue)); setQuantity(String(old.quantity)); setLocation(old.location ?? ""); setDescription(old.description ?? ""); setStatus(old.status ?? "not_in_use"); setDisposalDate(old.disposalDate ?? localDate()); setDisposalProceeds(old.disposalProceeds == null ? "" : String(old.disposalProceeds)); } }, [old?.id]);
  const save = async () => {
    const originalCost = Number(cost); const estimatedValue = Number(value); const count = Number(quantity);
    if (!user?.uid || !activeAccountId) { setError("Select an account before saving an asset."); return; }
    if (!name.trim() || !Number.isFinite(originalCost) || originalCost < 0 || !Number.isFinite(estimatedValue) || estimatedValue < 0 || !Number.isInteger(count) || count <= 0) { setError("Enter a name, valid costs, and a quantity greater than zero."); return; }
    setSaving(true); setError("");
    const proceeds = disposalProceeds.trim() ? Number(disposalProceeds) : undefined;
    if (status === "sold" && proceeds !== undefined && (!Number.isFinite(proceeds) || proceeds < 0)) { setError("Enter a valid amount received for the sale."); return; }
    const payload = { name: name.trim(), category, originalCost, estimatedValue, quantity: count, location: location.trim() || undefined, description: description.trim() || undefined, status, statusChangedAt: localDate(), disposalDate: status === "sold" || status === "removed" ? disposalDate : undefined, disposalProceeds: status === "sold" ? proceeds : undefined };
    try {
      const savedId = old ? old.id : await createFarmRecord(user.uid, activeAccountId, "assets", payload);
      if (old) await updateFarmRecord(user.uid, activeAccountId, "assets", old.id, payload);
      if (status === "sold" && (proceeds ?? 0) > 0) {
        const transactionId = `asset_disposal_${savedId}`;
        const transaction = { date: disposalDate, direction: "inflow" as const, category: "asset_disposal", amount: proceeds!, description: `Asset sale: ${name.trim()}`, reference: savedId };
        if (transactions.some((entry) => entry.id === transactionId)) await updateFarmRecord(user.uid, activeAccountId, "transactions", transactionId, transaction);
        else await createFarmRecord(user.uid, activeAccountId, "transactions", transaction, transactionId);
      }
      router.back();
    }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save the asset."); } finally { setSaving(false); }
  };
  return <BatchPage title={old ? "Edit asset" : "Add asset"}><ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled"><FarmField label="Asset name" value={name} onChangeText={setName} placeholder="e.g. Water tank" /><ThemedText type="defaultSemiBold">Category</ThemedText><View style={styles.options}>{categories.map((item) => <TouchableOpacity key={item} onPress={() => setCategory(item)} style={[styles.option, { backgroundColor: category === item ? `${accent}18` : surface, borderColor: category === item ? accent : border }]}><ThemedText type="tiny" color={category === item ? accent : undefined}>{item.replaceAll("_", " ")}</ThemedText></TouchableOpacity>)}</View><FarmField label="Original cost" value={cost} onChangeText={setCost} keyboardType="decimal-pad" /><FarmField label="Estimated current value" value={value} onChangeText={setValue} keyboardType="decimal-pad" /><ThemedText type="defaultSemiBold">Current asset status</ThemedText><View style={styles.options}>{assetStatuses.map((entry) => <TouchableOpacity key={entry.value} onPress={() => setStatus(entry.value)} style={[styles.option, { backgroundColor: status === entry.value ? `${accent}18` : surface, borderColor: status === entry.value ? accent : border }]}><ThemedText type="tiny" color={status === entry.value ? accent : undefined}>{entry.label}</ThemedText></TouchableOpacity>)}</View>{(status === "sold" || status === "removed") ? <><FarmDatePicker label={status === "sold" ? "Date sold" : "Date removed"} value={disposalDate} onChange={setDisposalDate} />{status === "sold" ? <FarmField label="Sale proceeds received (optional)" value={disposalProceeds} onChangeText={setDisposalProceeds} keyboardType="decimal-pad" /> : null}</> : null}<FarmField label="Quantity" value={quantity} onChangeText={setQuantity} keyboardType="number-pad" /><FarmField label="Location (optional)" value={location} onChangeText={setLocation} /><FarmField label="Description (optional)" value={description} onChangeText={setDescription} multiline />{error ? <ThemedText type="tiny" color={danger}>{error}</ThemedText> : null}<FarmButton label={old ? "Save changes" : "Save asset"} onPress={() => void save()} disabled={saving} /></ScrollView></BatchPage>;
}
const assetStatuses = [{ value: "in_use", label: "In use" }, { value: "not_in_use", label: "Not in use" }, { value: "sold", label: "Sold" }, { value: "removed", label: "Removed" }] as const;
function localDate() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
const styles = StyleSheet.create({ body: { padding: 18, gap: 14, paddingBottom: 34 }, options: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, option: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 11, paddingVertical: 8 } });
