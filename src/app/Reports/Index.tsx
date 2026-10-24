import CustomHeader from "@/components/CustomHeader";
import { FarmButton, FarmField } from "@/components/farm/FarmComponents";
import ScreenWrapper from "@/components/ScreenWrapper";
import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";
import { useThemeColor } from "@/hooks/useThemeColor";
import { buildFarmExportFiles, calculateFarmReportAnalytics, createFarmExportWorkbook, createFarmExportZip, filterFarmReportDataset, FINANCIAL_COLLECTIONS, loadFarmReportDataset, REPORT_CATEGORY_LABELS, reportDateForRecord, type ReportLoadResult } from "@/services/farmReporting";
import { FARM_COLLECTIONS, recordMurimiExportTrace, refreshFarmAccountFromCloud, syncFarmAccount, type FarmCollection } from "@/services/farmRepository";
import { recordsToCsv } from "@/services/reportingUtils";
import { getFarmSyncSummary } from "@/services/farmLocalDatabase";
import { broilerFeedStageForAge } from "@/Utilities/farmCalculations";
import NetInfo from "@react-native-community/netinfo";
import { getAuth, getIdToken } from "@react-native-firebase/auth";
import { Ionicons } from "@expo/vector-icons";
import { File, Paths } from "expo-file-system";
import { useCallback, useState } from "react";
import { Alert, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { router, useFocusEffect } from "expo-router";

type ReportMode = "analytics" | "export";
type ExportFormat = "xlsx" | "csv";
type DrillState = { collection: FarmCollection; title: string; field?: string; value?: string; month?: string } | null;
const money = (value: number) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export default function ReportsScreen() {
    const { user, activeAccountId, activeAccountName } = useAuth();
    const [loaded, setLoaded] = useState<ReportLoadResult>({ data: {}, failures: {} });
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [mode, setMode] = useState<ReportMode>("analytics");
    const [exportFormat, setExportFormat] = useState<ExportFormat>("xlsx");
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");
    const [batchId, setBatchId] = useState("");
    const [category, setCategory] = useState("");
    const [paymentMethodId, setPaymentMethodId] = useState("");
    const [selectedCategories, setSelectedCategories] = useState<Set<FarmCollection>>(() => new Set(FARM_COLLECTIONS));
    const [drill, setDrill] = useState<DrillState>(null);
    const [showPeopleAnalytics, setShowPeopleAnalytics] = useState(false);
    const accent = useThemeColor("accent"); const border = useThemeColor("border"); const surface = useThemeColor("backgroundLight"); const muted = useThemeColor("textlight"); const text = useThemeColor("text"); const bad = useThemeColor("bad");

    const reload = useCallback(async () => {
        if (!user?.uid || !activeAccountId) { setLoaded({ data: {}, failures: {} }); setLoading(false); return; }
        setLoading(true);
        try { setLoaded(await loadFarmReportDataset(user.uid, activeAccountId)); }
        catch (error) { setLoaded({ data: {}, failures: { batches: error instanceof Error ? error.message : "Could not load local farm reports." } }); }
        finally { setLoading(false); }
    }, [user?.uid, activeAccountId]);

    /* eslint react-hooks/set-state-in-effect: "off" -- refresh the offline report snapshot when the signed-in account changes. */
    useFocusEffect(useCallback(() => { void reload(); }, [reload]));

    const filters = { fromDate: fromDate.trim() || undefined, toDate: toDate.trim() || undefined, batchId: batchId || undefined, category: category || undefined, paymentMethodId: paymentMethodId || undefined };
    const analytics = calculateFarmReportAnalytics(loaded.data, filters);
    const filteredData = filterFarmReportDataset(loaded.data, filters);
    const batchRows = (loaded.data.batches ?? []) as { id: string; name: string; batchNumber?: string; status?: string }[];
    const categoryOptions = [...new Set((["purchases", "expenses"] as const).flatMap((collection) => (loaded.data[collection] ?? []).flatMap((record) => {
        if (collection === "purchases" && record.financialClassification === "fixed_asset") return [];
        return typeof record.category === "string" ? [record.category] : [];
    })))].sort();
    const methods = (loaded.data.paymentMethods ?? []) as { id: string; name: string; active?: boolean }[];
    const selectedInRegistryOrder = FARM_COLLECTIONS.filter((item) => selectedCategories.has(item));
    const loadFailureCount = Object.keys(loaded.failures).length;

    const toggleCategory = (item: FarmCollection) => setSelectedCategories((previous) => {
        const next = new Set(previous);
        if (next.has(item)) next.delete(item); else next.add(item);
        return next;
    });
    const selectCategories = (items: ReadonlySet<FarmCollection>) => setSelectedCategories(new Set(items));

    const validateFilters = () => {
        if ((fromDate && !datePattern.test(fromDate)) || (toDate && !datePattern.test(toDate))) return "Dates must use YYYY-MM-DD.";
        if (fromDate && toDate && fromDate > toDate) return "Start date must be on or before the end date.";
        return null;
    };

    const exportRecords = async () => {
        const validationError = validateFilters();
        if (validationError) { Alert.alert("Check report filters", validationError); return; }
        if (!selectedCategories.size) { Alert.alert("Choose categories", "Select at least one record category to export."); return; }
        if (!user?.uid || !activeAccountId) { Alert.alert("Account unavailable", "Select a farm account before exporting."); return; }
        setExporting(true);
        try {
            let syncStatus = { status: "Saved device records", pendingCount: 0, error: undefined as string | undefined };
            try {
                const beforeSync = await getFarmSyncSummary(user.uid, activeAccountId);
                syncStatus.pendingCount = beforeSync.pendingCount;
                const network = await NetInfo.fetch();
                if (network.isConnected && network.isInternetReachable !== false) {
                    const syncResult = await syncFarmAccount(user.uid, activeAccountId, true);
                    syncStatus.pendingCount = syncResult.pendingCount;
                    if (syncResult.success) {
                        try {
                            await refreshFarmAccountFromCloud(user.uid, activeAccountId);
                            syncStatus.status = "Synced with Murimi cloud before export";
                            syncStatus.pendingCount = 0;
                        } catch (error) {
                            syncStatus.status = "Exported saved records; cloud refresh failed";
                            syncStatus.error = error instanceof Error ? error.message : "Could not refresh farm records from the cloud.";
                        }
                    } else {
                        syncStatus.status = "Exported saved records; some changes are not synced";
                        syncStatus.error = syncResult.error;
                    }
                } else {
                    syncStatus.status = "Offline; exported saved device records";
                    syncStatus.error = beforeSync.lastError ?? undefined;
                }
            } catch (error) {
                syncStatus.status = "Exported saved records; sync status unavailable";
                syncStatus.error = error instanceof Error ? error.message : "Could not check cloud sync status.";
            }
            const fresh = await loadFarmReportDataset(user.uid, activeAccountId);
            setLoaded(fresh);
            const result = buildFarmExportFiles(fresh.data, fresh.failures, selectedCategories, filters, activeAccountName ?? "Selected farm account", syncStatus);
            if (result.totalRecords === 0) {
                const selectedFailures = Object.entries(result.failures).filter(([collection]) => selectedCategories.has(collection as FarmCollection));
                if (selectedFailures.length) throw new Error(`No selected records could be exported. ${selectedFailures.map(([collection, message]) => `${REPORT_CATEGORY_LABELS[collection as FarmCollection]}: ${message}`).join("; ")}`);
                Alert.alert("No records to export", "No records match the selected categories and filters. Clear the date, batch, or category filters and try again.");
                return;
            }
            let traceStatus = "Not registered with Murimi cloud";
            try {
                const currentUser = getAuth().currentUser;
                if (!currentUser || currentUser.uid !== user.uid) throw new Error("The signed-in Murimi account could not be verified.");
                const token = await getIdToken(currentUser, true);
                await recordMurimiExportTrace(activeAccountId, token, {
                    traceCode: result.branding.traceCode,
                    format: exportFormat === "xlsx" ? "xlsx" : "zip",
                    totalRecords: result.totalRecords,
                    categories: Object.entries(result.counts).filter(([, count]) => (count ?? 0) > 0).map(([collection]) => collection),
                });
                traceStatus = "Registered to this signed-in Murimi account";
            } catch (error) {
                traceStatus = error instanceof Error ? `Not registered: ${error.message}` : "Not registered: cloud trace service unavailable.";
            }
            const metadataSheet = result.sheets.find((sheet) => sheet.name === "Export metadata");
            if (metadataSheet) {
                metadataSheet.rows.push({ field: "Trace registration", value: traceStatus });
                const metadataFile = result.files.find((file) => file.fileName === "export_metadata.csv");
                if (metadataFile) metadataFile.content = recordsToCsv(metadataSheet.rows);
            }
            const archiveBytes = exportFormat === "xlsx" ? createFarmExportWorkbook(result) : await createFarmExportZip(result);
            const extension = exportFormat === "xlsx" ? "xlsx" : "zip";
            const fileName = `murimi_export_${result.branding.traceCode}_${new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")}.${extension}`;
            const file = new File(Paths.cache, fileName);
            file.create({ intermediates: true, overwrite: true });
            file.write(archiveBytes);
            if (file.size !== archiveBytes.byteLength) throw new Error(`The export file is incomplete (${file.size} of ${archiveBytes.byteLength} bytes).`);
            const Sharing = await import("expo-sharing");
            if (!(await Sharing.isAvailableAsync())) throw new Error("File sharing is unavailable on this platform. Open Reports & Export on an Android or iOS device to share the ZIP file.");
            const mimeType = exportFormat === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/zip";
            await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: "Share Murimi reports" });
            const countLines = Object.entries(result.counts).map(([collection, count]) => `${REPORT_CATEGORY_LABELS[collection as FarmCollection]}: ${count}`).join("\n");
            const failureLines = Object.entries(result.failures).map(([collection, message]) => `${REPORT_CATEGORY_LABELS[collection as FarmCollection]}: ${message}`).join("\n");
            Alert.alert("Export ready", `${result.totalRecords} records exported.\nTrace code: ${result.branding.traceCode}\n${traceStatus}\n${syncStatus.status}${syncStatus.pendingCount ? ` (${syncStatus.pendingCount} pending)` : ""}${syncStatus.error ? `\n${syncStatus.error}` : ""}\n\n${countLines}${failureLines ? `\n\nFailed categories:\n${failureLines}` : ""}`);
        } catch (error) {
            Alert.alert("Export failed", error instanceof Error ? error.message : "The report could not be created or shared.");
        } finally { setExporting(false); }
    };

    const openDrill = (collection: FarmCollection, title: string) => setDrill({ collection, title });

    return <ScreenWrapper fh={false}>
        <CustomHeader pageTitle="Reports & Export" />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.titleRow}><View style={styles.titleCopy}><ThemedText type="title" color={text}>Farm reports</ThemedText><ThemedText type="tiny" color={muted}>{activeAccountName ?? "Selected account"} · offline saved records</ThemedText></View><TouchableOpacity onPress={() => void reload()} accessibilityLabel="Refresh reports" style={[styles.iconButton, { borderColor: border, backgroundColor: surface }]}><Ionicons name="refresh-outline" size={19} color={accent} /></TouchableOpacity></View>
            <View style={[styles.modeBar, { borderColor: border, backgroundColor: surface }]}>
                <ModeButton label="Analytics & Reports" selected={mode === "analytics"} onPress={() => { setMode("analytics"); setDrill(null); }} />
                <ModeButton label="Export Data" selected={mode === "export"} onPress={() => { setMode("export"); setDrill(null); }} />
            </View>
            <FiltersPanel
                fromDate={fromDate} setFromDate={setFromDate} toDate={toDate} setToDate={setToDate}
                batchId={batchId} setBatchId={setBatchId} batches={batchRows}
                category={category} setCategory={setCategory} categories={categoryOptions}
                paymentMethodId={paymentMethodId} setPaymentMethodId={setPaymentMethodId} methods={methods}
                accent={accent} border={border} surface={surface} muted={muted} text={text}
            />
            {loading ? <View style={styles.loading}><Ionicons name="hourglass-outline" size={19} color={accent} /><ThemedText type="tiny" color={muted}>Reading the local farm database…</ThemedText></View> : null}
            {!loading && loadFailureCount > 0 ? <View style={[styles.warning, { borderColor: bad }]}><ThemedText type="defaultSemiBold" color={bad}>{loadFailureCount} data categories could not be read.</ThemedText>{Object.entries(loaded.failures).slice(0, 4).map(([name, message]) => <ThemedText key={name} type="tiny" color={muted}>{REPORT_CATEGORY_LABELS[name as FarmCollection]}: {message}</ThemedText>)}</View> : null}
            {!loading && mode === "analytics" ? <>
                <ThemedText type="subtitle" color={text} style={styles.sectionTitle}>Farm overview</ThemedText>
                <ThemedText type="tiny" color={muted} style={styles.sectionCaption}>Current flock, stock and asset values are snapshots. Sales, purchases, expenses, cash and feed follow the selected dates.</ThemedText>
                <View style={styles.metrics}>
                    <Metric label="Active batches" value={analytics.activeBatchCount.toLocaleString()} detail="Growing or selling" onPress={() => openDrill("batches", "Active batches")} />
                    <Metric label="Birds currently held" value={analytics.currentBirdsHeld.toLocaleString()} detail="Open batch snapshot" onPress={() => openDrill("batches", "Current flock batches")} />
                    <Metric label="Birds placed" value={`${analytics.birdsPlaced.toLocaleString()}${analytics.birdsPlacedUnknownCount ? "*" : ""}`} detail={analytics.birdsPlacedUnknownCount ? `${analytics.birdsPlacedUnknownCount} historical counts unknown` : "Recorded batch placements"} onPress={() => openDrill("batches", "Batch placements")} />
                    <Metric label="Birds sold" value={analytics.birdsSold.toLocaleString()} detail="All time, or sales in date range" onPress={() => openDrill("sales", "Sales records")} />
                    <Metric label="Mortality" value={`${analytics.mortalityTotal.toLocaleString()}${analytics.mortalityPercent == null ? "" : ` · ${analytics.mortalityPercent.toFixed(1)}%`}`} detail="Daily deaths / known birds placed" onPress={() => openDrill("dailyRecords", "Daily mortality records")} />
                    <Metric label="Feed consumed" value={`${analytics.feedConsumedKg.toLocaleString()} kg`} detail="Daily records and historical summaries" onPress={() => openDrill("dailyRecords", "Feed and daily records")} />
                    <Metric label="Sales revenue" value={money(analytics.salesRevenue)} detail="Recorded sales only; tap for customer performance" onPress={() => setShowPeopleAnalytics(true)} />
                    <Metric label="Purchases" value={money(analytics.purchasesTotal)} detail="Purchase records, separate from sales revenue" onPress={() => openDrill("purchases", "Purchase records")} />
                    <Metric label="Operating expenses" value={money(analytics.operatingExpenses)} detail="Expense and bad-debt records; purchases excluded" onPress={() => openDrill("expenses", "Operating expenses")} />
                    <Metric label="Cash flow" value={`${money(analytics.cashIn)} in · ${money(analytics.cashOut)} out`} detail="Recorded cash movements" onPress={() => openDrill("transactions", "Cash movements")} />
                    <Metric label="Consumable inventory" value={money(analytics.inventory.totalValue)} detail={analytics.inventory.valuationReliable ? "Current recorded-cost value" : "Known value only; incomplete"} onPress={() => openDrill("stock", "Inventory items")} />
                    <Metric label="Fixed assets" value={money(analytics.finance.fixedAssets)} detail="Current recorded estimated values" onPress={() => openDrill("assets", "Fixed asset register")} />
                </View>
                <ThemedText type="subtitle" color={text} style={styles.sectionTitle}>Analytics & Reports</ThemedText>
                <ThemedText type="tiny" color={muted} style={styles.sectionCaption}>Tap a row to inspect the saved records behind it.</ThemedText>
                <BarGroup title="Sales by batch" rows={analytics.revenueByBatch} format={money} onPress={(row) => { const batch = batchRows.find((item) => (item.batchNumber ?? item.name) === row.label); setDrill({ collection: "sales", title: `Sales · ${row.label}`, field: "batchId", value: batch?.id }); }} accent={accent} muted={muted} />
                <BarGroup title="Expenses by category" rows={analytics.expensesByCategory} format={money} onPress={(row) => setDrill({ collection: "expenses", title: `Expenses · ${row.label}`, field: "category", value: row.label })} accent={accent} muted={muted} />
                <BarGroup title="Purchases by category" rows={analytics.purchasesByCategory} format={money} onPress={(row) => setDrill({ collection: "purchases", title: `Purchases · ${row.label}`, field: "categoryNameSnapshot", value: row.label })} accent={accent} muted={muted} />
                <BarGroup title="Purchases over time" rows={analytics.purchasesByMonth} format={money} onPress={(row) => setDrill({ collection: "purchases", title: `Purchases · ${row.label}`, month: row.label })} accent={accent} muted={muted} />
                <BarGroup title={`Completed batch duration${analytics.averageCycleDays == null ? "" : ` · average ${analytics.averageCycleDays} days`}`} rows={analytics.cycleDurations} format={(value) => `${value} days`} onPress={() => openDrill("batches", "Completed batch durations")} accent={accent} muted={muted} />
                <BarGroup title="Mortality events by recorded cause" rows={analytics.mortalityByCause} format={(value) => `${value} birds`} onPress={(row) => setDrill({ collection: "mortalityRecords", title: `Mortality · ${row.label}`, field: "customCause", value: row.label })} accent={accent} muted={muted} />
                <CashChart rows={analytics.cashByMonth} accent={accent} muted={muted} onPress={(month) => setDrill({ collection: "transactions", title: `Cash movements · ${month}`, month })} />
                <View style={[styles.note, { borderColor: border, backgroundColor: surface }]}><ThemedText type="defaultSemiBold" color={text}>Interpretation notes</ThemedText>{analytics.warnings.map((warning) => <ThemedText key={warning} type="tiny" color={muted}>• {warning}</ThemedText>)}<ThemedText type="tiny" color={muted}>Recorded expenses, stock consumed and cash outflows are separate measures. No profitability estimate is shown because complete batch cost allocation cannot be verified.</ThemedText></View>
                <BatchPerformance rows={analytics.batchPerformance} onSelect={(id) => { setBatchId(id); openDrill("batches", "Batch performance"); }} accent={accent} border={border} surface={surface} text={text} muted={muted} />
            </> : null}
            {!loading && mode === "export" ? <>
                <ThemedText type="subtitle" color={text} style={styles.sectionTitle}>Export Data</ThemedText>
                <ThemedText type="tiny" color={muted} style={styles.sectionCaption}>Choose a workbook or CSV archive. Each selected category gets its own sheet or file; original records are unchanged.</ThemedText>
                <View style={[styles.formatToggle, { borderColor: border, backgroundColor: surface }]}>
                    {([{ key: "xlsx", label: "Excel workbook (.xlsx)" }, { key: "csv", label: "CSV archive (.zip)" }] as const).map((option) => <TouchableOpacity key={option.key} onPress={() => setExportFormat(option.key)} accessibilityRole="radio" accessibilityState={{ checked: exportFormat === option.key }} style={[styles.formatOption, exportFormat === option.key && { backgroundColor: accent }]}><ThemedText type="tiny" color={exportFormat === option.key ? "#FFFFFF" : muted}>{option.label}</ThemedText></TouchableOpacity>)}
                </View>
                <View style={styles.selectionActions}>
                    <SmallAction title={selectedCategories.size === FARM_COLLECTIONS.length ? "Deselect all" : "Select all"} onPress={() => selectCategories(selectedCategories.size === FARM_COLLECTIONS.length ? new Set() : new Set(FARM_COLLECTIONS))} accent={accent} border={border} surface={surface} text={text} />
                    <SmallAction title="Financial categories" onPress={() => selectCategories(FINANCIAL_COLLECTIONS)} accent={accent} border={border} surface={surface} text={text} />
                </View>
                <View style={styles.categoryList}>{FARM_COLLECTIONS.map((item) => <TouchableOpacity key={item} onPress={() => toggleCategory(item)} accessibilityRole="checkbox" accessibilityState={{ checked: selectedCategories.has(item) }} style={[styles.categoryRow, { borderBottomColor: border }]}><Ionicons name={selectedCategories.has(item) ? "checkbox" : "square-outline"} size={20} color={selectedCategories.has(item) ? accent : muted} /><ThemedText type="tiny" color={text} style={styles.categoryName}>{REPORT_CATEGORY_LABELS[item]}</ThemedText><ThemedText type="tiny" color={muted}>{(loaded.data[item] ?? []).length}</ThemedText></TouchableOpacity>)}</View>
                <ThemedText type="tiny" color={muted}>{selectedInRegistryOrder.length} categories selected · exports read from offline SQLite, including closed and historical records</ThemedText>
                {exporting ? <View style={styles.loading}><Ionicons name="sync-outline" size={18} color={accent} /><ThemedText type="tiny" color={muted}>Preparing CSV files and opening the share sheet…</ThemedText></View> : null}
                <FarmButton label={exporting ? "Preparing export" : exportFormat === "xlsx" ? "Create and share Excel workbook" : "Create and share CSV archive"} onPress={() => void exportRecords()} disabled={exporting || loading} />
                <ThemedText type="tiny" color={muted} style={styles.exportFootnote}>Includes export metadata, category record counts, and a financial summary. Excel exports use numeric money cells and date columns; currency is not stored on individual records.</ThemedText>
            </> : null}
        </ScrollView>
        <Modal visible={!!drill} transparent animationType="slide" onRequestClose={() => setDrill(null)}>
            <View style={styles.modalBackdrop}><View style={[styles.modalSheet, { backgroundColor: surface }]}><ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">{drill ? <DrillDown drill={drill} records={filteredData[drill.collection] ?? []} onClose={() => setDrill(null)} border={border} surface={surface} text={text} muted={muted} accent={accent} /> : null}</ScrollView></View></View>
        </Modal>
        <Modal visible={showPeopleAnalytics} transparent animationType="slide" onRequestClose={() => setShowPeopleAnalytics(false)}>
            <View style={styles.modalBackdrop}><View style={[styles.modalSheet, { backgroundColor: surface }]}><ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled"><PeopleAnalytics customers={analytics.customerPerformance} suppliers={analytics.supplierPerformance} onClose={() => setShowPeopleAnalytics(false)} /></ScrollView></View></View>
        </Modal>
    </ScreenWrapper>;
}

function ModeButton({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
    const accent = useThemeColor("accent"); const muted = useThemeColor("textlight");
    return <TouchableOpacity onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected }} style={[styles.modeButton, selected && { backgroundColor: accent }]}><ThemedText type="tiny" color={selected ? "#FFFFFF" : muted}>{label}</ThemedText></TouchableOpacity>;
}

type CustomerPerformanceRow = { id: string; label: string; purchased: number; paid: number; outstanding: number; badDebt: number; salesCount: number; lastDate: string; collectionRate: number | null };
type SupplierPerformanceRow = { id: string; label: string; purchased: number; paid: number; outstanding: number; count: number; lastDate: string };
function PeopleAnalytics({ customers, suppliers, onClose }: { customers: CustomerPerformanceRow[]; suppliers: SupplierPerformanceRow[]; onClose: () => void }) {
    const [customerRank, setCustomerRank] = useState<"paid" | "purchased" | "outstanding" | "collection">("paid");
    const [supplierRank, setSupplierRank] = useState<"paid" | "purchased" | "outstanding">("paid");
    const border = useThemeColor("border"); const surface = useThemeColor("backgroundLight"); const text = useThemeColor("text"); const muted = useThemeColor("textlight"); const accent = useThemeColor("accent");
    const sortedCustomers = [...customers].sort((a, b) => customerRank === "collection" ? (b.collectionRate ?? -1) - (a.collectionRate ?? -1) : b[customerRank] - a[customerRank]);
    const sortedSuppliers = [...suppliers].sort((a, b) => b[supplierRank] - a[supplierRank]);
    const customerSorts = [{ id: "paid", label: "Most paid" }, { id: "purchased", label: "Purchases" }, { id: "outstanding", label: "Owing" }, { id: "collection", label: "Payment rate" }] as const;
    const supplierSorts = [{ id: "paid", label: "Most paid" }, { id: "purchased", label: "Purchase value" }, { id: "outstanding", label: "Owing" }] as const;
    return <View style={[styles.chart, { borderColor: accent, backgroundColor: surface }]}>
        <View style={styles.drillHeader}><View style={styles.titleCopy}><ThemedText type="subtitle" color={text}>Customers and suppliers</ThemedText><ThemedText type="tiny" color={muted}>Amounts use the current report date filters.</ThemedText></View><TouchableOpacity onPress={onClose} style={[styles.iconButton, { borderColor: border }]}><Ionicons name="close" size={18} color={accent} /></TouchableOpacity></View>
        <ThemedText type="defaultSemiBold" color={text}>Customer credit performance</ThemedText><View style={styles.chips}>{customerSorts.map((sort) => <FilterChip key={sort.id} label={sort.label} selected={customerRank === sort.id} onPress={() => setCustomerRank(sort.id)} accent={accent} border={border} surface={surface} muted={muted} />)}</View>
        <TouchableOpacity onPress={() => router.push("/Farm/SalesSettings" as never)}><ThemedText type="tiny" color={accent}>Manage customer balances and write off confirmed bad debts</ThemedText></TouchableOpacity>
        {sortedCustomers.length ? sortedCustomers.map((row) => <View key={row.id} style={[styles.performanceRow, { backgroundColor: surface, borderColor: border }]}><ThemedText type="defaultSemiBold" color={text}>{row.label}</ThemedText><ThemedText type="tiny" color={muted}>Sales {money(row.purchased)} · collected {money(row.paid)} · owed {money(row.outstanding)}{row.badDebt ? ` · bad debt ${money(row.badDebt)}` : ""}</ThemedText><ThemedText type="tiny" color={muted}>{row.collectionRate == null ? "Payment rate unavailable" : `${row.collectionRate.toFixed(1)}% of recorded sales collected`} · {row.salesCount} sale(s) · last {row.lastDate || "unknown"}</ThemedText></View>) : <ThemedText type="tiny" color={muted}>No customer sales in this period.</ThemedText>}
        <ThemedText type="defaultSemiBold" color={text}>Supplier purchase and payment ranking</ThemedText><View style={styles.chips}>{supplierSorts.map((sort) => <FilterChip key={sort.id} label={sort.label} selected={supplierRank === sort.id} onPress={() => setSupplierRank(sort.id)} accent={accent} border={border} surface={surface} muted={muted} />)}</View>
        {sortedSuppliers.length ? sortedSuppliers.map((row) => <View key={row.id} style={[styles.performanceRow, { backgroundColor: surface, borderColor: border }]}><ThemedText type="defaultSemiBold" color={text}>{row.label}</ThemedText><ThemedText type="tiny" color={muted}>Purchases {money(row.purchased)} · paid {money(row.paid)} · payable {money(row.outstanding)}</ThemedText><ThemedText type="tiny" color={muted}>{row.count} purchase(s) · last {row.lastDate || "unknown"}</ThemedText></View>) : <ThemedText type="tiny" color={muted}>No supplier purchases in this period.</ThemedText>}
    </View>;
}

function FiltersPanel({ fromDate, setFromDate, toDate, setToDate, batchId, setBatchId, batches, category, setCategory, categories, paymentMethodId, setPaymentMethodId, methods, accent, border, surface, muted, text }: {
    fromDate: string; setFromDate: (value: string) => void; toDate: string; setToDate: (value: string) => void;
    batchId: string; setBatchId: (value: string) => void; batches: { id: string; name: string; batchNumber?: string }[];
    category: string; setCategory: (value: string) => void; categories: string[];
    paymentMethodId: string; setPaymentMethodId: (value: string) => void; methods: { id: string; name: string; active?: boolean }[];
    accent: string; border: string; surface: string; muted: string; text: string;
}) {
    return <View style={[styles.filterPanel, { borderColor: border, backgroundColor: surface }]}>
        <ThemedText type="defaultSemiBold" color={text}>Report filters</ThemedText>
        <View style={styles.dateRow}><View style={styles.dateField}><FarmField label="Start date" value={fromDate} onChangeText={setFromDate} placeholder="YYYY-MM-DD" /><ThemedText type="tiny" color={muted}>Blank means any date</ThemedText></View><View style={styles.dateField}><FarmField label="End date" value={toDate} onChangeText={setToDate} placeholder="YYYY-MM-DD" /><ThemedText type="tiny" color={muted}>Blank means any date</ThemedText></View></View>
        <ThemedText type="tiny" color={muted}>Batch</ThemedText><View style={styles.chips}><FilterChip label="All batches" selected={!batchId} onPress={() => setBatchId("")} accent={accent} border={border} surface={surface} muted={muted} />{batches.map((batch) => <FilterChip key={batch.id} label={batch.batchNumber ? `Batch ${batch.batchNumber}` : batch.name} selected={batchId === batch.id} onPress={() => setBatchId(batch.id)} accent={accent} border={border} surface={surface} muted={muted} />)}</View>
        {categories.length > 0 ? <><ThemedText type="tiny" color={muted}>Purchase or expense category</ThemedText><View style={styles.chips}><FilterChip label="All categories" selected={!category} onPress={() => setCategory("")} accent={accent} border={border} surface={surface} muted={muted} />{categories.slice(0, 18).map((item) => <FilterChip key={item} label={item.replaceAll("_", " ")} selected={category === item} onPress={() => setCategory(category === item ? "" : item)} accent={accent} border={border} surface={surface} muted={muted} />)}</View></> : null}
        {methods.length > 0 ? <><ThemedText type="tiny" color={muted}>Payment method</ThemedText><View style={styles.chips}><FilterChip label="All methods" selected={!paymentMethodId} onPress={() => setPaymentMethodId("")} accent={accent} border={border} surface={surface} muted={muted} />{methods.filter((item) => item.active !== false).map((item) => <FilterChip key={item.id} label={item.name} selected={paymentMethodId === item.id} onPress={() => setPaymentMethodId(paymentMethodId === item.id ? "" : item.id)} accent={accent} border={border} surface={surface} muted={muted} />)}</View></> : null}
    </View>;
}

function FilterChip({ label, selected, onPress, accent, border, surface, muted }: { label: string; selected: boolean; onPress: () => void; accent: string; border: string; surface: string; muted: string }) {
    return <TouchableOpacity onPress={onPress} style={[styles.chip, { backgroundColor: selected ? accent : surface, borderColor: selected ? accent : border }]}><ThemedText type="tiny" color={selected ? "#FFFFFF" : muted}>{label}</ThemedText></TouchableOpacity>;
}

function Metric({ label, value, detail, onPress }: { label: string; value: string; detail: string; onPress: () => void }) {
    const surface = useThemeColor("backgroundLight"); const border = useThemeColor("border"); const accent = useThemeColor("accent"); const muted = useThemeColor("textlight"); const text = useThemeColor("text");
    return <TouchableOpacity onPress={onPress} style={[styles.metric, { borderColor: border, backgroundColor: surface }]}><ThemedText type="tiny" color={muted}>{label}</ThemedText><ThemedText type="defaultSemiBold" color={text} style={styles.metricValue}>{value}</ThemedText><ThemedText type="tiny" color={accent}>{detail}</ThemedText></TouchableOpacity>;
}

function BarGroup({ title, rows, format, onPress, accent, muted }: { title: string; rows: { label: string; value: number }[]; format: (value: number) => string; onPress: (row: { label: string; value: number }) => void; accent: string; muted: string }) {
    const border = useThemeColor("border"); const surface = useThemeColor("backgroundLight"); const max = Math.max(1, ...rows.slice(0, 6).map((row) => row.value));
    return <View style={[styles.chart, { borderColor: border, backgroundColor: surface }]}><ThemedText type="defaultSemiBold">{title}</ThemedText>{rows.length ? rows.slice(0, 6).map((row) => <TouchableOpacity key={row.label} onPress={() => onPress(row)} style={styles.barRow}><View style={styles.barLabels}><ThemedText type="tiny" color={muted} numberOfLines={1} style={styles.barLabel}>{row.label}</ThemedText><ThemedText type="tiny">{format(row.value)}</ThemedText></View><View style={[styles.barTrack, { backgroundColor: `${accent}20` }]}><View style={[styles.bar, { width: `${Math.max(4, (row.value / max) * 100)}%`, backgroundColor: accent }]} /></View></TouchableOpacity>) : <ThemedText type="tiny" color={muted}>No records in this period.</ThemedText>}</View>;
}

function CashChart({ rows, accent, muted, onPress }: { rows: { month: string; inflow: number; outflow: number }[]; accent: string; muted: string; onPress: (month: string) => void }) {
    const border = useThemeColor("border"); const surface = useThemeColor("backgroundLight"); const max = Math.max(1, ...rows.flatMap((item) => [item.inflow, item.outflow]));
    return <View style={[styles.chart, { borderColor: border, backgroundColor: surface }]}><ThemedText type="defaultSemiBold">Monthly cash movement</ThemedText><ThemedText type="tiny" color={muted}>Inflows and outflows are cash records, not sales or purchase totals.</ThemedText>{rows.length ? rows.map((row) => <TouchableOpacity key={row.month} onPress={() => onPress(row.month)} style={styles.cashMonth}><ThemedText type="tiny" color={muted} style={styles.monthLabel}>{row.month}</ThemedText><View style={styles.cashBars}><View style={[styles.cashBar, { width: `${Math.max(2, (row.inflow / max) * 100)}%`, backgroundColor: accent }]} /><View style={[styles.cashBar, { width: `${Math.max(2, (row.outflow / max) * 100)}%`, backgroundColor: "#D8734E" }]} /></View><ThemedText type="tiny" color={muted}>{money(row.inflow)} / {money(row.outflow)}</ThemedText></TouchableOpacity>) : <ThemedText type="tiny" color={muted}>No cash movement records in this period.</ThemedText>}</View>;
}
function localDate() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }

function BatchPerformance({ rows, onSelect, accent, border, surface, text, muted }: { rows: { batch: { id: string; name: string; batchNumber?: string; status: string; enterprise?: string; dateStarted?: string; closedAt?: string; historicalData?: { actualCompletionDate?: string } }; summary: { birdsAlive: number; birdsSold: number; deaths: number; feedKg: number; mortalityPercent: number | null; revenue: number } }[]; onSelect: (id: string) => void; accent: string; border: string; surface: string; text: string; muted: string }) {
    return <View style={styles.performance}><ThemedText type="subtitle" color={text}>Batch performance</ThemedText><ThemedText type="tiny" color={muted}>Includes closed batches. Broiler stage is a day-age guide; actual feed use is recorded in daily records.</ThemedText>{rows.length ? rows.map(({ batch, summary }) => {
        const today = localDate(); const endDate = batch.status === "completed" ? batch.closedAt ?? batch.historicalData?.actualCompletionDate : today;
        const rawAgeDays = batch.dateStarted && endDate ? Math.floor((new Date(`${endDate}T00:00:00`).getTime() - new Date(`${batch.dateStarted}T00:00:00`).getTime()) / 86400000) + 1 : null;
        const ageDays = rawAgeDays != null && Number.isFinite(rawAgeDays) && rawAgeDays > 0 ? rawAgeDays : null;
        const stage = batch.enterprise === "broiler" && ageDays != null ? broilerFeedStageForAge(ageDays) : null;
        return <TouchableOpacity key={batch.id} onPress={() => onSelect(batch.id)} style={[styles.performanceRow, { borderColor: border, backgroundColor: surface }]}><View style={styles.performanceHeader}><ThemedText type="defaultSemiBold" color={text}>{batch.batchNumber ? `Batch ${batch.batchNumber}` : batch.name}</ThemedText><ThemedText type="tiny" color={accent}>{batch.status.replaceAll("_", " ")}</ThemedText></View><ThemedText type="tiny" color={muted}>{ageDays == null ? "Age unavailable" : `${batch.status === "completed" ? "Cycle" : "Age"}: ${ageDays} days`}{stage ? ` · ${stage} stage` : ""}</ThemedText><ThemedText type="tiny" color={muted}>{summary.birdsAlive} alive · {summary.birdsSold} sold · {summary.deaths} deaths{summary.mortalityPercent == null ? "" : ` (${summary.mortalityPercent.toFixed(1)}%)`}</ThemedText><ThemedText type="tiny" color={muted}>{summary.feedKg.toFixed(1)} kg feed · revenue {money(summary.revenue)}</ThemedText></TouchableOpacity>;
    }) : <ThemedText type="tiny" color={muted}>No batch records available.</ThemedText>}</View>;
}

function DrillDown({ drill, records, onClose, border, surface, text, muted, accent }: { drill: NonNullable<DrillState>; records: Record<string, unknown>[]; onClose: () => void; border: string; surface: string; text: string; muted: string; accent: string }) {
    const visibleRecords = records.filter((record) => {
        if (drill.field && drill.value !== undefined && record[drill.field] !== drill.value) {
            if (drill.field === "categoryNameSnapshot" && record.categoryNameSnapshot !== drill.value && record.category !== drill.value && record.categoryId !== drill.value) return false;
            else if (drill.field !== "categoryNameSnapshot") return false;
        }
        if (drill.month && reportDateForRecord(drill.collection, record)?.slice(0, 7) !== drill.month) return false;
        if (drill.field === "customCause" && drill.value !== undefined && record.customCause !== drill.value && record.causeLabel !== drill.value && record.causeCode !== drill.value) return false;
        return true;
    });
    const recordTitle = (record: Record<string, unknown>) => String(record.description ?? record.itemName ?? record.name ?? record.customCause ?? record.causeLabel ?? record.category ?? record.direction ?? record.id ?? "Farm record");
    const recordDate = (record: Record<string, unknown>) => reportDateForRecord(drill.collection, record) ?? "Date not recorded";
    return <View style={[styles.drill, { borderColor: border }]}><View style={styles.drillHeader}><View style={styles.titleCopy}><ThemedText type="subtitle" color={text}>{drill.title}</ThemedText><ThemedText type="tiny" color={muted}>{visibleRecords.length} source records</ThemedText></View><TouchableOpacity onPress={onClose} accessibilityLabel="Close detail" style={[styles.iconButton, { borderColor: border, backgroundColor: surface }]}><Ionicons name="close" size={19} color={accent} /></TouchableOpacity></View>{visibleRecords.length ? visibleRecords.slice(0, 100).map((record, index) => <View key={String(record.id ?? index)} style={[styles.drillRecord, { borderBottomColor: border }]}><ThemedText type="defaultSemiBold" color={text}>{recordTitle(record)}</ThemedText><ThemedText type="tiny" color={muted}>{recordDate(record)} · ID {String(record.id ?? "unavailable")}</ThemedText><ThemedText type="tiny" color={muted}>{Object.entries(record).filter(([key, value]) => !["id", "ownerId", "accountId", "createdAt", "updatedAt", "description", "itemName", "name", "date", "batchId"].includes(key) && ["string", "number", "boolean"].includes(typeof value)).slice(0, 4).map(([key, value]) => `${key}: ${value}`).join(" · ")}</ThemedText></View>) : <ThemedText type="tiny" color={muted}>No source records match the current filters.</ThemedText>}{visibleRecords.length > 100 ? <ThemedText type="tiny" color={muted}>Showing the first 100 records. Export the category for the complete filtered data.</ThemedText> : null}</View>;
}

function SmallAction({ title, onPress, accent, border, surface, text }: { title: string; onPress: () => void; accent: string; border: string; surface: string; text: string }) {
    return <TouchableOpacity onPress={onPress} style={[styles.smallAction, { borderColor: border, backgroundColor: surface }]}><Ionicons name="options-outline" size={16} color={accent} /><ThemedText type="tiny" color={text}>{title}</ThemedText></TouchableOpacity>;
}

const styles = StyleSheet.create({
    content: { padding: 18, paddingBottom: 36, gap: 13 }, titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, titleCopy: { flex: 1, gap: 3 }, iconButton: { width: 40, height: 40, borderWidth: 1, borderRadius: 11, alignItems: "center", justifyContent: "center" },
    modeBar: { flexDirection: "row", padding: 4, borderWidth: 1, borderRadius: 13, gap: 5 }, modeButton: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: 9, paddingHorizontal: 5 },
    filterPanel: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 9 }, dateRow: { flexDirection: "row", gap: 8 }, dateField: { flex: 1, gap: 2 }, chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 }, chip: { borderWidth: 1, borderRadius: 16, paddingVertical: 7, paddingHorizontal: 9 },
    sectionTitle: { marginTop: 9 }, sectionCaption: { marginTop: -8, lineHeight: 18 }, metrics: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, metric: { flexBasis: "47%", flexGrow: 1, minWidth: 145, minHeight: 105, borderWidth: 1, borderRadius: 12, padding: 11, gap: 5 }, metricValue: { fontSize: 17 },
    chart: { borderWidth: 1, borderRadius: 12, padding: 13, gap: 10 }, barRow: { gap: 5 }, barLabels: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }, barLabel: { flex: 1 }, barTrack: { height: 7, borderRadius: 4, overflow: "hidden" }, bar: { height: "100%", borderRadius: 4 }, cashMonth: { flexDirection: "row", alignItems: "center", gap: 8 }, monthLabel: { width: 54 }, cashBars: { flex: 1, gap: 3, alignItems: "flex-start" }, cashBar: { height: 6, minWidth: 3, borderRadius: 3 },
    note: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 7 }, performance: { gap: 8, marginTop: 4 }, performanceRow: { borderWidth: 1, borderRadius: 11, padding: 11, gap: 4 }, performanceHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
    selectionActions: { flexDirection: "row", gap: 8 }, formatToggle: { flexDirection: "row", borderWidth: 1, borderRadius: 11, padding: 4, gap: 4 }, formatOption: { flex: 1, minHeight: 39, paddingHorizontal: 8, borderRadius: 8, alignItems: "center", justifyContent: "center" }, smallAction: { borderWidth: 1, borderRadius: 10, minHeight: 38, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 6 }, categoryList: { borderTopWidth: StyleSheet.hairlineWidth }, categoryRow: { minHeight: 43, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", gap: 9 }, categoryName: { flex: 1 }, exportFootnote: { lineHeight: 18 }, loading: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 10 }, warning: { borderWidth: 1, borderRadius: 11, padding: 10, gap: 5 },
    drill: { borderWidth: 1, borderRadius: 13, padding: 12, gap: 8 }, drillHeader: { flexDirection: "row", alignItems: "center", gap: 8 }, drillRecord: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 8, gap: 3 },
    modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "#0008" }, modalSheet: { maxHeight: "88%", borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: "hidden" }, modalContent: { padding: 16, paddingBottom: 30 },
});
