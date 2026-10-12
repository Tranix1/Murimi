import React, { useMemo, useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { BatchPage } from "./_components";
import { FarmButton, FarmDatePicker, FarmField } from "@/components/farm/FarmComponents";
import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";
import { useFarmRecords } from "@/hooks/useFarmRecords";
import { useThemeColor } from "@/hooks/useThemeColor";
import { saveMortalityRecord } from "@/services/farmRepository";
import type { Batch } from "@/types/farm";

const causes = [
  ["cold_stress", "Low temperature / cold stress"], ["heat_stress", "High temperature / heat stress"], ["ammonia", "Ammonia"], ["poor_ventilation", "Poor ventilation"], ["disease_suspected", "Disease / suspected infection"], ["water_shortage", "Water shortage"], ["feed_shortage", "Feed shortage or feeding problem"], ["injury_trampling", "Injury or trampling"], ["predation", "Predation"], ["poisoning_suspected", "Suspected poisoning / contaminated feed or water"], ["unknown", "Unknown cause"], ["other", "Other"],
] as const;
const diseases = ["Newcastle disease", "Infectious bronchitis", "Infectious bursal disease (Gumboro)", "Coccidiosis", "Fowl cholera", "Colibacillosis / suspected E. coli infection", "Chronic respiratory disease / suspected Mycoplasma infection", "Other suspected disease", "Unknown disease"];
const symptomOptions = ["Gasping / difficulty breathing", "Coughing or sneezing", "Gurgling / rattling breathing", "Nasal discharge", "Eye discharge / swollen eyes", "Diarrhoea", "Bloody droppings", "Green droppings", "White droppings", "Loss of appetite", "Reduced drinking", "Weakness / lethargy", "Huddling", "Drooping wings", "Difficulty walking", "Twisted neck / neurological signs", "Sudden unexplained deaths", "Poor growth / weight loss", "Other symptoms"];
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export default function MortalityScreen() {
  const { batchId } = useLocalSearchParams<{ batchId?: string }>(); const { user, activeAccountId } = useAuth(); const { records: batches } = useFarmRecords<Batch>("batches"); const batch = batches.find((item) => item.id === batchId);
  const [date, setDate] = useState(today()); const [quantity, setQuantity] = useState(""); const [causeCode, setCauseCode] = useState<string>("unknown"); const [customCause, setCustomCause] = useState(""); const [disease, setDisease] = useState("Unknown disease"); const [customDisease, setCustomDisease] = useState(""); const [diseaseStatus, setDiseaseStatus] = useState<"suspected" | "confirmed" | "unknown">("unknown"); const [symptoms, setSymptoms] = useState<string[]>([]); const [otherSymptoms, setOtherSymptoms] = useState(""); const [observed, setObserved] = useState(""); const [confirmationSource, setConfirmationSource] = useState(""); const [action, setAction] = useState(""); const [treatment, setTreatment] = useState(""); const [start, setStart] = useState(""); const [end, setEnd] = useState(""); const [treatmentCost, setTreatmentCost] = useState(""); const [outcome, setOutcome] = useState(""); const [temperature, setTemperature] = useState(""); const [humidity, setHumidity] = useState(""); const [ammonia, setAmmonia] = useState(""); const [ventilation, setVentilation] = useState(""); const [water, setWater] = useState(""); const [feed, setFeed] = useState(""); const [bedding, setBedding] = useState(""); const [notes, setNotes] = useState(""); const [saving, setSaving] = useState(false); const [error, setError] = useState(""); const savingRef = useRef(false);
  const accent = useThemeColor("accent"); const surface = useThemeColor("backgroundLight"); const border = useThemeColor("border"); const muted = useThemeColor("textlight"); const bad = useThemeColor("bad");
  const age = useMemo(() => { if (!batch?.dateStarted || !date) return null; const startDate = new Date(`${batch.dateStarted}T00:00:00`); const eventDate = new Date(`${date}T00:00:00`); if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(eventDate.getTime()) || eventDate < startDate) return null; return Math.floor((eventDate.getTime() - startDate.getTime()) / 86400000) + 1; }, [batch?.dateStarted, date]);
  const numeric = (v: string) => v.trim() ? Number(v) : undefined;
  const save = async () => {
    if (savingRef.current) return;
    if (!user?.uid || !activeAccountId || !batch) return setError("Choose a batch before saving.");
    if (!Number.isInteger(Number(quantity)) || Number(quantity) <= 0) return setError("Enter a whole number of birds greater than zero.");
    const readings = [temperature, humidity, ammonia, treatmentCost].map(numeric).filter((v): v is number => v !== undefined);
    if (readings.some((v) => !Number.isFinite(v) || v < 0) || (numeric(humidity) != null && numeric(humidity)! > 100)) return setError("Enter valid non-negative environmental readings; humidity cannot exceed 100%.");
    if (start && end && end < start) return setError("Treatment end date cannot be earlier than its start date.");
    savingRef.current = true; setSaving(true); setError("");
    const selectedCause = causes.find(([code]) => code === causeCode)!;
    try {
      await saveMortalityRecord(user.uid, activeAccountId, batch, { date, quantity: Number(quantity), birdAgeDays: age ?? undefined, causeCode, causeLabel: selectedCause[1], customCause: customCause.trim() || undefined, symptoms, otherSymptoms: otherSymptoms.trim() || undefined, suspectedDisease: causeCode === "disease_suspected" ? disease === "Other suspected disease" ? customDisease.trim() || disease : disease : undefined, diseaseStatus: causeCode === "disease_suspected" ? diseaseStatus : "unknown", diagnosisNotes: observed.trim() || undefined, confirmationSource: confirmationSource.trim() || undefined, actionTaken: action.trim() || undefined, treatment: treatment.trim() || undefined, treatmentStartDate: start || undefined, treatmentEndDate: end || undefined, treatmentCost: numeric(treatmentCost), outcome: outcome.trim() || undefined, temperatureC: numeric(temperature), humidityPercent: numeric(humidity), ammoniaReading: numeric(ammonia), ventilationObservation: ventilation.trim() || undefined, waterAvailability: water.trim() || undefined, feedAvailability: feed.trim() || undefined, beddingCondition: bedding.trim() || undefined, notes: notes.trim() || undefined });
      Alert.alert("Mortality saved", `${quantity} birds recorded${age ? ` at age ${age} days` : ""}.`); router.back();
    } catch (causeError) { setError(causeError instanceof Error ? causeError.message : "Could not save mortality record."); }
    finally { savingRef.current = false; setSaving(false); }
  };
  const toggle = (value: string) => setSymptoms((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  const options = (items: readonly (readonly [string, string])[] | string[], selected: string | string[], onSelect: (value: string) => void) => <View style={styles.chips}>{items.map((item) => { const value = typeof item === "string" ? item : item[0]; const label = typeof item === "string" ? item : item[1]; const active = Array.isArray(selected) ? selected.includes(value) : selected === value; return <TouchableOpacity key={value} onPress={() => onSelect(value)} style={[styles.chip, { backgroundColor: active ? accent : surface, borderColor: active ? accent : border }]}><ThemedText type="tiny" color={active ? "#fff" : muted}>{label}</ThemedText></TouchableOpacity>; })}</View>;
  return <BatchPage title="Record mortality"><ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
    <ThemedText type="tiny" color={muted}>{batch?.name ?? "Batch unavailable"}{age ? ` · Bird age ${age} days (week ${Math.ceil(age / 7)})` : " · Age unavailable"}</ThemedText>
    <FarmDatePicker label="Date of death" value={date} onChange={setDate} /><FarmField label="Birds died in this event" value={quantity} onChangeText={setQuantity} keyboardType="number-pad" placeholder="Grouped count" />
    <ThemedText type="defaultSemiBold">Suspected cause</ThemedText>{options(causes, causeCode, setCauseCode)}{causeCode === "other" && <FarmField label="Other cause" value={customCause} onChangeText={setCustomCause} />}
    {causeCode === "disease_suspected" ? <>
      <ThemedText type="defaultSemiBold">Disease (may remain unknown)</ThemedText>{options(diseases, disease, setDisease)}{disease === "Other suspected disease" && <FarmField label="Suspected disease name" value={customDisease} onChangeText={setCustomDisease} />}
      <ThemedText type="defaultSemiBold">Diagnosis status</ThemedText>{options(["suspected", "confirmed", "unknown"], diseaseStatus, (v) => setDiseaseStatus(v as typeof diseaseStatus))}
      {diseaseStatus === "confirmed" && <FarmField label="Confirmation source" value={confirmationSource} onChangeText={setConfirmationSource} placeholder="Diagnostic source / notes" />}
      <FarmField label="Diagnostic notes (optional)" value={observed} onChangeText={setObserved} multiline />
    </> : null}
    <ThemedText type="defaultSemiBold">Observed symptoms (select any)</ThemedText>{options(symptomOptions, symptoms, toggle)}<FarmField label="Other symptoms or observations" value={otherSymptoms} onChangeText={setOtherSymptoms} multiline />
    <FarmField label="Action taken" value={action} onChangeText={setAction} multiline /><FarmField label="Medicine or treatment" value={treatment} onChangeText={setTreatment} />
    <FarmDatePicker label="Treatment start date (optional)" value={start} onChange={setStart} /><FarmDatePicker label="Treatment end date (optional)" value={end} onChange={setEnd} />
    <FarmField label="Treatment cost" value={treatmentCost} onChangeText={setTreatmentCost} keyboardType="decimal-pad" /><FarmField label="Outcome / follow-up" value={outcome} onChangeText={setOutcome} multiline />
    <ThemedText type="defaultSemiBold">Optional environmental readings</ThemedText><FarmField label="Temperature °C" value={temperature} onChangeText={setTemperature} keyboardType="decimal-pad" /><FarmField label="Humidity %" value={humidity} onChangeText={setHumidity} keyboardType="decimal-pad" /><FarmField label="Ammonia reading" value={ammonia} onChangeText={setAmmonia} keyboardType="decimal-pad" /><FarmField label="Ventilation observations" value={ventilation} onChangeText={setVentilation} /><FarmField label="Water availability" value={water} onChangeText={setWater} /><FarmField label="Feed availability" value={feed} onChangeText={setFeed} /><FarmField label="Bedding condition" value={bedding} onChangeText={setBedding} /><FarmField label="Notes" value={notes} onChangeText={setNotes} multiline />
    {error ? <ThemedText color={bad}>{error}</ThemedText> : null}<FarmButton label="Save mortality event" onPress={() => void save()} disabled={saving || !batch} />
  </ScrollView></BatchPage>;
}
const styles = StyleSheet.create({ form: { padding: 18, paddingBottom: 34, gap: 13 }, chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, chip: { borderWidth: 1, borderRadius: 18, paddingVertical: 8, paddingHorizontal: 10 } });
