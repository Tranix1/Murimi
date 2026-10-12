import React, { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { BatchPage } from "./_components";
import { FarmButton, FarmDatePicker, FarmField } from "@/components/farm/FarmComponents";
import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";
import { useFarmRecords } from "@/hooks/useFarmRecords";
import { useThemeColor } from "@/hooks/useThemeColor";
import { saveBatchRecord } from "@/services/farmRepository";
import type { Batch, CustomerCategory, FarmCustomer, FarmPaymentMethod, HistoricalExpenseRecord, HistoricalFeedRecord, HistoricalSaleRecord } from "@/types/farm";

const num = (value: string) => value.trim() ? Number(value) : undefined;
const dateNow = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
type FeedDraft = { date: string; dateEstimated: boolean; description: string; purchased: string; consumed: string; remaining: string; cost: string; notes: string };
type ExpenseDraft = { date: string; dateEstimated: boolean; category: string; description: string; amount: string; quantity: string; unit: string; notes: string };
type SaleDraft = { date: string; dateEstimated: boolean; categoryId: string; customerId: string; buyer: string; quantity: string; unit: "birds" | "kg"; price: string; total: string; methodId: string; paid: string; notes: string };
const blankFeed = (): FeedDraft => ({ date: "", dateEstimated: false, description: "", purchased: "", consumed: "", remaining: "", cost: "", notes: "" });
const blankExpense = (): ExpenseDraft => ({ date: "", dateEstimated: false, category: "other", description: "", amount: "", quantity: "", unit: "", notes: "" });
const blankSale = (): SaleDraft => ({ date: dateNow(), dateEstimated: false, categoryId: "", customerId: "", buyer: "", quantity: "", unit: "birds", price: "", total: "", methodId: "", paid: "", notes: "" });

export default function HistoricalBatchScreen() {
  const { user, activeAccountId } = useAuth(); const { records: batches, isLoading: batchesLoading } = useFarmRecords<Batch>("batches"); const { records: customerCategories } = useFarmRecords<CustomerCategory>("customerCategories"); const { records: customers } = useFarmRecords<FarmCustomer>("customers"); const { records: paymentMethods } = useFarmRecords<FarmPaymentMethod>("paymentMethods");
  const [number, setNumber] = useState(""); const [breed, setBreed] = useState("Cobb"); const [customBreed, setCustomBreed] = useState("");
  const [arrival, setArrival] = useState(""); const [arrivalUnknown, setArrivalUnknown] = useState(true); const [arrivalEstimated, setArrivalEstimated] = useState(false); const [expectedSlaughter, setExpectedSlaughter] = useState(""); const [completed, setCompleted] = useState(""); const [completionUnknown, setCompletionUnknown] = useState(true); const [completionEstimated, setCompletionEstimated] = useState(false);
  const [initial, setInitial] = useState(""); const [deaths, setDeaths] = useState(""); const [losses, setLosses] = useState(""); const [sold, setSold] = useState(""); const [slaughtered, setSlaughtered] = useState(""); const [remaining, setRemaining] = useState("");
  const [supplier, setSupplier] = useState(""); const [chicksCost, setChicksCost] = useState(""); const [feedKg, setFeedKg] = useState(""); const [feedCost, setFeedCost] = useState(""); const [otherCost, setOtherCost] = useState(""); const [meatKg, setMeatKg] = useState(""); const [liveKg, setLiveKg] = useState(""); const [averageWeight, setAverageWeight] = useState(""); const [revenue, setRevenue] = useState(""); const [paid, setPaid] = useState(""); const [lossReason, setLossReason] = useState(""); const [discrepancy, setDiscrepancy] = useState(""); const [location, setLocation] = useState(""); const [notes, setNotes] = useState(""); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const [feedRows, setFeedRows] = useState<FeedDraft[]>([]); const [expenseRows, setExpenseRows] = useState<ExpenseDraft[]>([]); const [saleRows, setSaleRows] = useState<SaleDraft[]>([]);
  const accent = useThemeColor("accent"); const border = useThemeColor("border"); const surface = useThemeColor("backgroundLight"); const muted = useThemeColor("textlight"); const bad = useThemeColor("bad");
  const countInputs = [num(initial), num(deaths), num(losses), num(sold), num(slaughtered), num(remaining)];
  const allCountsKnown = countInputs.every((value) => value !== undefined);
  const reconciled = !allCountsKnown || countInputs[0] === countInputs[1]! + countInputs[2]! + countInputs[3]! + countInputs[4]! + countInputs[5]!;
  useEffect(() => { if (number || batchesLoading) return; const values = batches.map((batch) => (batch.batchNumber ?? batch.name).match(/(?:batch\s*)?(\d+)\s*$/i)?.[1]).filter((v): v is string => !!v).map(Number).filter(Number.isSafeInteger); setNumber(String(Math.max(0, ...values) + 1)); }, [batches, batchesLoading, number]);
  const toggle = (selected: boolean, fn: (next: boolean) => void, text: string) => <TouchableOpacity onPress={() => fn(!selected)} style={styles.check}><ThemedText color={accent}>{selected ? "☑" : "☐"}</ThemedText><ThemedText type="tiny" color={muted}>{text}</ThemedText></TouchableOpacity>;
  const save = async () => {
    if (!user?.uid || !activeAccountId) return setError("Select a farm account first.");
    const [startCount, deathCount, lossCount, soldCount, slaughterCount, remainingCount] = countInputs;
    const counts = [startCount, deathCount, lossCount, soldCount, slaughterCount, remainingCount].filter((v): v is number => v !== undefined);
    if (!number.trim() || counts.some((v) => !Number.isInteger(v) || v < 0)) return setError("Enter a batch number and whole, non-negative bird counts.");
    if (!reconciled && !discrepancy.trim()) return setError("Bird counts do not reconcile. Correct them or explain the discrepancy.");
    const moneyFields = [chicksCost, feedCost, otherCost, revenue, paid].map(num).filter((v): v is number => v !== undefined);
    const quantityFields = [feedKg, meatKg, liveKg, averageWeight].map(num).filter((v): v is number => v !== undefined);
    if ([...moneyFields, ...quantityFields].some((v) => !Number.isFinite(v) || v < 0)) return setError("Costs, revenue, weights, and feed quantities must be non-negative numbers.");
    if (num(paid) !== undefined && num(revenue) !== undefined && num(paid)! > num(revenue)!) return setError("Amount paid cannot exceed historical revenue.");
    setSaving(true); setError("");
    const initialQty = startCount ?? 0; const totalRevenue = num(revenue); const amountReceived = num(paid) ?? 0; const unknownFields = [startCount === undefined && "initialQuantity", deathCount === undefined && "deaths", lossCount === undefined && "otherLosses", soldCount === undefined && "birdsSold", slaughterCount === undefined && "birdsSlaughtered", remainingCount === undefined && "birdsRemaining", !arrival && "dateStarted", !completed && "actualCompletionDate", num(chicksCost) === undefined && "chicksCost", num(feedKg) === undefined && "feedConsumedKg", num(feedCost) === undefined && "feedCost", num(otherCost) === undefined && "otherOperatingCosts", totalRevenue === undefined && "revenue", num(paid) === undefined && "amountPaid", num(meatKg) === undefined && "meatKgSold"].filter((v): v is string => typeof v === "string");
    const closedDate = completed || undefined;
    const record: Omit<Batch, "id" | "ownerId" | "accountId" | "createdAt" | "updatedAt"> = {
      name: `Batch ${number.trim()}`, batchNumber: number.trim(), enterprise: "broiler", stockType: breed === "Custom" ? (customBreed.trim() || "Custom") : breed,
      supplier: supplier.trim() || undefined, dateStarted: arrival, dateStartedEstimated: arrivalEstimated || undefined, initialQuantity: initialQty,
      currentBirdsAlive: remainingCount, costPerUnit: initialQty > 0 && num(chicksCost) != null ? num(chicksCost)! / initialQty : undefined, transportCost: 0, setupCost: 0, location: location.trim() || undefined,
      expectedSlaughterDate: expectedSlaughter || undefined, expectedSaleDate: expectedSlaughter || undefined, status: "completed", productionComplete: true, sellingComplete: true,
      closedAt: closedDate, historical: true, notes: notes.trim() || undefined,
      historicalData: { actualCompletionDate: closedDate, completionDateEstimated: completionEstimated || undefined, totalDeaths: deathCount, otherLosses: lossCount, otherLossesReason: lossReason.trim() || undefined, birdsSold: soldCount, birdsSlaughtered: slaughterCount, birdsRemaining: remainingCount, meatKgSold: num(meatKg), liveWeightKgSold: num(liveKg), averageSaleWeightKg: num(averageWeight), feedConsumedKg: num(feedKg), feedCost: num(feedCost), chicksCost: num(chicksCost), otherOperatingCosts: num(otherCost), revenue: totalRevenue, amountPaid: num(paid), outstanding: totalRevenue == null ? undefined : Math.max(0, totalRevenue - amountReceived), discrepancyExplanation: discrepancy.trim() || undefined, unknownFields, source: "historical_summary" },
    };
    try { const id = await saveBatchRecord(user.uid, activeAccountId, record); Alert.alert("Past batch saved", "Historical totals were saved without changing current cash or inventory."); router.replace({ pathname: "/Batches/BatchDetails" as never, params: { batchId: id } }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save this historical batch."); }
    finally { setSaving(false); }
  };
  const choices = (values: string[], value: string, onChange: (s: string) => void) => <View style={styles.row}>{values.map((item) => <TouchableOpacity key={item} onPress={() => onChange(item)} style={[styles.chip, { backgroundColor: value === item ? accent : surface, borderColor: value === item ? accent : border }]}><ThemedText type="tiny" color={value === item ? "#fff" : muted}>{item}</ThemedText></TouchableOpacity>)}</View>;
  return <BatchPage title="Add past batch"><ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
    <ThemedText type="tiny" color={muted}>Enter totals you know. Leave other fields blank; historical entries will not affect current inventory or cash.</ThemedText>
    <FarmField label="Batch number" value={number} onChangeText={setNumber} keyboardType="number-pad" />{choices(["Cobb", "Ross", "Custom"], breed, setBreed)}{breed === "Custom" && <FarmField label="Custom breed" value={customBreed} onChangeText={setCustomBreed} />}
    <FarmField label="Farm location (optional)" value={location} onChangeText={setLocation} />{toggle(arrivalUnknown, (v) => { setArrivalUnknown(v); if (!v) setArrival(dateNow()); }, "Arrival date unknown")}{!arrivalUnknown ? <FarmDatePicker label="Arrival date" value={arrival} onChange={setArrival} /> : null}{!arrivalUnknown ? toggle(arrivalEstimated, setArrivalEstimated, "Arrival date is an estimate") : null}
    <FarmDatePicker label="Expected slaughter date (optional)" value={expectedSlaughter} onChange={setExpectedSlaughter} />
    {toggle(completionUnknown, (v) => { setCompletionUnknown(v); if (!v) setCompleted(dateNow()); }, "Actual completion date unknown")}{!completionUnknown ? <FarmDatePicker label="Actual completion / closure date" value={completed} onChange={setCompleted} /> : null}{!completionUnknown ? toggle(completionEstimated, setCompletionEstimated, "Completion date is an estimate") : null}
    <FarmField label="Chicks received (leave blank if unknown)" value={initial} onChangeText={setInitial} keyboardType="number-pad" /><FarmField label="Chick supplier (optional)" value={supplier} onChangeText={setSupplier} /><FarmField label="Total chick purchase cost (optional)" value={chicksCost} onChangeText={setChicksCost} keyboardType="decimal-pad" />
    <ThemedText type="defaultSemiBold">Production results (leave unknown values blank)</ThemedText><FarmField label="Birds died" value={deaths} onChangeText={setDeaths} keyboardType="number-pad" /><FarmField label="Other losses" value={losses} onChangeText={setLosses} keyboardType="number-pad" /><FarmField label="Reason for other losses" value={lossReason} onChangeText={setLossReason} multiline /><FarmField label="Birds sold" value={sold} onChangeText={setSold} keyboardType="number-pad" /><FarmField label="Birds slaughtered (tracked separately)" value={slaughtered} onChangeText={setSlaughtered} keyboardType="number-pad" /><FarmField label="Birds remaining" value={remaining} onChangeText={setRemaining} keyboardType="number-pad" />
    <FarmField label="Meat sold (kg, optional)" value={meatKg} onChangeText={setMeatKg} keyboardType="decimal-pad" /><FarmField label="Live weight sold (kg, optional)" value={liveKg} onChangeText={setLiveKg} keyboardType="decimal-pad" /><FarmField label="Average sale weight (kg, optional)" value={averageWeight} onChangeText={setAverageWeight} keyboardType="decimal-pad" />
    <ThemedText type="defaultSemiBold">Historical totals (summary only; no cash movements)</ThemedText><FarmField label="Feed consumed (kg)" value={feedKg} onChangeText={setFeedKg} keyboardType="decimal-pad" /><FarmField label="Total feed cost" value={feedCost} onChangeText={setFeedCost} keyboardType="decimal-pad" /><FarmField label="Other operating costs" value={otherCost} onChangeText={setOtherCost} keyboardType="decimal-pad" /><FarmField label="Total sale revenue" value={revenue} onChangeText={setRevenue} keyboardType="decimal-pad" /><FarmField label="Amount collected (optional)" value={paid} onChangeText={setPaid} keyboardType="decimal-pad" />
    <FarmField label="Count discrepancy explanation (required if counts do not reconcile)" value={discrepancy} onChangeText={setDiscrepancy} multiline /><FarmField label="Notes" value={notes} onChangeText={setNotes} multiline />
    {!reconciled && <ThemedText color={bad}>Bird counts currently do not reconcile. Add an explanation before saving.</ThemedText>}{error ? <ThemedText color={bad}>{error}</ThemedText> : null}<FarmButton label="Save historical batch" onPress={() => void save()} disabled={saving} />
  </ScrollView></BatchPage>;
}
const styles = StyleSheet.create({ form: { padding: 18, paddingBottom: 32, gap: 13 }, row: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, chip: { borderWidth: 1, borderRadius: 18, paddingVertical: 8, paddingHorizontal: 11 }, check: { minHeight: 36, flexDirection: "row", alignItems: "center", gap: 8 } });
