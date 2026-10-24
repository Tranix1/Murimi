export type ReportCollection = string;

export type ReportFilters = {
    fromDate?: string;
    toDate?: string;
    batchId?: string;
    category?: string;
    paymentMethodId?: string;
    relatedBatchRecordIds?: ReadonlySet<string>;
};

const privateExportFields = new Set(["ownerId", "uid", "userId", "accountId", "idToken", "refreshToken"]);

export function reportColumnLabel(column: string): string {
    if (column === "id") return "Record ID";
    return column.split(".").map((part) => part
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replaceAll("_", " ")
        .replace(/\bId\b/gi, "ID")
        .replace(/\s+/g, " ")
        .replace(/^./, (first) => first.toLocaleUpperCase())
    ).join(" › ");
}

const batchScopedCollections = new Set([
    "batches", "dailyRecords", "mortalityRecords", "batchProblems", "weights", "expenses",
    "purchases", "sales", "slaughter", "stockMovements", "payments", "transactions",
]);

export function selectReportCategories<T extends string>(allCategories: readonly T[], selected: ReadonlySet<T>): T[] {
    return allCategories.filter((category) => selected.has(category));
}

export function getReportRecordDate(collection: ReportCollection, record: Record<string, unknown>): string | undefined {
    const dateFields: Record<string, string[]> = {
        batches: ["dateStarted", "closedAt"],
        assets: ["purchaseDate", "inServiceDate"],
        plans: ["plannedDate"],
        treatments: ["date", "treatmentStartDate"],
    };
    const fields = dateFields[collection] ?? ["date"];
    for (const field of fields) {
        const value = record[field];
        if (typeof value === "string" && value.length >= 10) return value.slice(0, 10);
    }
    const createdAt = record.createdAt;
    return typeof createdAt === "string" && createdAt.length >= 10 ? createdAt.slice(0, 10) : undefined;
}

function matchesBatch(collection: ReportCollection, record: Record<string, unknown>, batchId: string, relatedIds?: ReadonlySet<string>): boolean {
    if (!batchScopedCollections.has(collection)) return true;
    if (collection === "batches") return record.id === batchId;
    if (record.batchId === batchId || record.relatedBatchId === batchId) return true;
    if (Array.isArray(record.allocations) && record.allocations.some((item) => item && typeof item === "object" && "batchId" in item && item.batchId === batchId)) return true;
    if (relatedIds && [record.sourceId, record.saleId, record.purchaseId, record.paymentId].some((id) => typeof id === "string" && relatedIds.has(id))) return true;
    return false;
}

export function filterReportRecords<T extends Record<string, unknown>>(
    collection: ReportCollection,
    records: T[],
    filters: ReportFilters,
): T[] {
    return records.filter((record) => {
        if (filters.fromDate || filters.toDate) {
            const date = getReportRecordDate(collection, record);
            if (!date || (filters.fromDate && date < filters.fromDate) || (filters.toDate && date > filters.toDate)) return false;
        }
        if (filters.batchId && !matchesBatch(collection, record, filters.batchId, filters.relatedBatchRecordIds)) return false;
        if (filters.category && (collection === "purchases" || collection === "expenses") && record.category !== filters.category) return false;
        if (filters.paymentMethodId) {
            const hasMethod = "paymentMethodId" in record || "methodId" in record;
            if (hasMethod && record.paymentMethodId !== filters.paymentMethodId && record.methodId !== filters.paymentMethodId) return false;
        }
        return true;
    });
}

export function flattenReportRecord(record: Record<string, unknown>, prefix = "", output: Record<string, string | number | boolean> = {}): Record<string, string | number | boolean> {
    for (const [key, value] of Object.entries(record)) {
        if (privateExportFields.has(key)) continue;
        const column = prefix ? `${prefix}.${key}` : key;
        if (value == null) continue;
        if (Array.isArray(value)) {
            output[column] = JSON.stringify(value);
        } else if (typeof value === "object") {
            flattenReportRecord(value as Record<string, unknown>, column, output);
        } else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
            output[column] = value;
        }
    }
    return output;
}

function csvCell(value: string | number | boolean): string {
    let text = String(value);
    if (typeof value === "string" && /^[=+@\t\r]/.test(text)) text = `'${text}`;
    if (/[",\r\n]/.test(text)) text = `"${text.replaceAll('"', '""')}"`;
    return text;
}

export function recordsToCsv(records: Record<string, unknown>[]): string {
    const rows = records.map((record) => flattenReportRecord(record));
    const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))].sort((a, b) => {
        if (a === "id") return -1;
        if (b === "id") return 1;
        return a.localeCompare(b);
    });
    if (!columns.length) columns.push("id", "createdAt", "updatedAt");
    const lines = [columns.map((column) => csvCell(reportColumnLabel(column))).join(","), ...rows.map((row) => columns.map((column) => row[column] === undefined ? "" : csvCell(row[column])).join(","))];
    return `\uFEFF${lines.join("\r\n")}`;
}

export function buildCategoryCsvFiles<T extends string>(
    data: Partial<Record<T, Record<string, unknown>[]>>,
    loadFailures: Partial<Record<T, string>>,
    selected: ReadonlySet<T>,
    allCategories: readonly T[],
    labels: Record<T, string>,
    filters: ReportFilters,
) {
    const categories = selectReportCategories(allCategories, selected);
    const files: { fileName: string; content: string }[] = [];
    const counts: Partial<Record<T, number>> = {};
    const failures: Partial<Record<T, string>> = {};
    for (const category of categories) {
        if (loadFailures[category]) {
            failures[category] = loadFailures[category];
            continue;
        }
        const filtered = filterReportRecords(category, data[category] ?? [], filters);
        counts[category] = filtered.length;
        const fileSlug = labels[category].toLocaleLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
        files.push({
            fileName: `${fileSlug}.csv`,
            content: recordsToCsv(filtered),
        });
    }
    let totalRecords = 0;
    for (const count of Object.values(counts) as (number | undefined)[]) totalRecords += count ?? 0;
    return { categories, files, counts, failures, totalRecords };
}
