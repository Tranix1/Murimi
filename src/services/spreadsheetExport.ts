import * as XLSX from "xlsx";

export type SpreadsheetSheetData = {
    name: string;
    rows: Record<string, string | number | boolean>[];
};

export type SpreadsheetBranding = { traceCode: string; accountName: string; exportedAt: string };

const isoDate = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?$/;
const excelEpoch = Date.UTC(1899, 11, 30);

function reportColumnLabel(column: string): string {
    if (column === "id") return "Record ID";
    return column.split(".").map((part) => part
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replaceAll("_", " ")
        .replace(/\bId\b/gi, "ID")
        .replace(/\s+/g, " ")
        .replace(/^./, (first) => first.toLocaleUpperCase())
    ).join(" › ");
}

function uniqueSheetName(label: string, used: Set<string>) {
    const base = label.replace(/[\\/?*:[\]]/g, " ").trim().slice(0, 31) || "Records";
    let name = base;
    let suffix = 2;
    while (used.has(name.toLocaleLowerCase())) {
        const ending = ` ${suffix++}`;
        name = `${base.slice(0, 31 - ending.length)}${ending}`;
    }
    used.add(name.toLocaleLowerCase());
    return name;
}

function createWorksheet(rows: Record<string, string | number | boolean>[], sheetName: string, branding: SpreadsheetBranding) {
    const columns = [...new Set(rows.flatMap((record) => Object.keys(record)))].sort((left, right) => {
        if (left === "id") return -1;
        if (right === "id") return 1;
        return left.localeCompare(right);
    });
    if (!columns.length) columns.push("id", "createdAt", "updatedAt");

    const values = rows.map((record) => columns.map((column) => {
        const value = record[column];
        if (typeof value === "string" && isoDate.test(value)) {
            const date = new Date(value);
            if (!Number.isNaN(date.getTime())) return (date.getTime() - excelEpoch) / 86_400_000;
        }
        return value ?? "";
    }));
    const worksheet = XLSX.utils.aoa_to_sheet([
        [`MURIMI FARM RECORDS | ${sheetName}`],
        [`Trace code: ${branding.traceCode} | Farm account: ${branding.accountName} | Exported: ${branding.exportedAt}`],
        [],
        columns.map(reportColumnLabel),
        ...values,
    ]);
    const lastColumn = XLSX.utils.encode_col(columns.length - 1);
    worksheet["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: columns.length - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: columns.length - 1 } },
    ];
    worksheet["!rows"] = [{ hpt: 24 }, { hpt: 20 }, { hpt: 8 }];
    worksheet["!autofilter"] = { ref: `A4:${lastColumn}${Math.max(4, values.length + 4)}` };
    worksheet["!cols"] = columns.map((column, index) => {
        const widest = Math.max(column.length, ...values.slice(0, 100).map((row) => String(row[index] ?? "").length));
        return { wch: Math.min(40, Math.max(12, reportColumnLabel(column).length, widest + 2)) };
    });

    const range = XLSX.utils.decode_range(worksheet["!ref"] ?? "A1");
    for (let row = 4; row <= range.e.r; row++) {
        for (let column = 0; column < columns.length; column++) {
            const heading = columns[column];
            const originalValue = rows[row - 4]?.[heading];
            if (typeof originalValue !== "string" || !isoDate.test(originalValue)) continue;
            const address = XLSX.utils.encode_cell({ r: row, c: column });
            const cell = worksheet[address];
            if (cell?.t === "n") cell.z = originalValue.includes("T") ? "yyyy-mm-dd hh:mm" : "yyyy-mm-dd";
        }
    }
    return worksheet;
}

export function createXlsxWorkbook(sheets: SpreadsheetSheetData[], branding: SpreadsheetBranding = { traceCode: "MRM-UNASSIGNED", accountName: "Farm account", exportedAt: new Date().toISOString() }): Uint8Array {
    const workbook = XLSX.utils.book_new();
    workbook.Props = { Title: "Murimi Farm Data Export", Author: "Murimi", Subject: `Export trace ${branding.traceCode}`, Comments: "Generated from the authenticated Murimi farm account." };
    const usedNames = new Set<string>();
    for (const sheet of sheets) {
        const sheetName = uniqueSheetName(sheet.name, usedNames);
        XLSX.utils.book_append_sheet(workbook, createWorksheet(sheet.rows, sheetName, branding), sheetName);
    }
    const output = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    return output instanceof Uint8Array ? new Uint8Array(output) : new Uint8Array(output as ArrayBuffer);
}
