import { getLocalFarmRecords, queryLocalFarmRecords } from "@/services/farmLocalDatabase";
import type { FarmRecordFilter } from "@/services/farmLocalDatabase";
import type { Sale, SalePayment } from "@/types/farm";

export type SalesAnalytics = {
  saleCount: number;
  quantityByUnit: { unit: string; quantity: number }[];
  revenueByCustomerCategory: { id?: string; name: string; amount: number }[];
  revenueByCustomer: { id?: string; name: string; amount: number }[];
  receiptsByPaymentMethod: { id?: string; name: string; amount: number }[];
};

/** Aggregates only saved farm records; revenue and cash receipts remain separate measures. */
export async function getSalesAnalytics(uid: string, accountId: string, filter: Pick<FarmRecordFilter, "fromDate" | "toDate" | "batchId" | "customerId" | "customerCategoryId" | "paymentMethodId"> = {}): Promise<SalesAnalytics> {
  const salesFilter = { ...filter, paymentMethodId: undefined };
  const sales = await queryLocalFarmRecords<Sale>(uid, accountId, "sales", salesFilter);
  const allSales = await getLocalFarmRecords<Sale>(uid, accountId, "sales");
  const salesById = new Map(allSales.map((sale) => [sale.id, sale]));
  const allPayments = await getLocalFarmRecords<SalePayment>(uid, accountId, "payments");
  const relatedSaleMatches = (sale: Sale | undefined) => !!sale
    && (!filter.batchId || sale.batchId === filter.batchId)
    && (!filter.customerId || sale.customerId === filter.customerId)
    && (!filter.customerCategoryId || sale.customerCategoryId === filter.customerCategoryId);
  const payments = allPayments.filter((payment) => inDateRange(payment.date, filter) && relatedSaleMatches(salesById.get(payment.saleId)) && (!filter.paymentMethodId || payment.paymentMethodId === filter.paymentMethodId));
  const quantityByUnit = group(sales, (sale) => sale.unit, (sale) => sale.quantity);
  const revenueByCustomerCategory = groupRecords(sales, (sale) => sale.customerCategoryId, (sale) => sale.customerCategoryName ?? "Uncategorized", (sale) => sale.totalValue);
  const revenueByCustomer = groupRecords(sales, (sale) => sale.customerId, (sale) => sale.customerNameSnapshot ?? sale.customer ?? "Walk-in customer", (sale) => sale.totalValue);
  const receipts = new Map<string, { id?: string; name: string; amount: number }>();
  const separatePaymentBySale = new Map<string, number>();
  for (const payment of allPayments) separatePaymentBySale.set(payment.saleId, (separatePaymentBySale.get(payment.saleId) ?? 0) + Math.max(0, payment.amount));
  for (const sale of allSales.filter(relatedSaleMatches)) {
    const initialPaid = Math.max(0, sale.paymentReceived - (separatePaymentBySale.get(sale.id) ?? 0));
    if (initialPaid && inDateRange(sale.paymentDate ?? sale.date, filter) && (!filter.paymentMethodId || sale.paymentMethodId === filter.paymentMethodId)) add(receipts, sale.paymentMethodId, sale.paymentMethodName ?? sale.paymentMethod ?? "Unspecified", initialPaid);
  }
  for (const payment of payments) add(receipts, payment.paymentMethodId, payment.paymentMethodName ?? payment.method ?? "Unspecified", Math.max(0, payment.amount));
  return { saleCount: sales.length, quantityByUnit, revenueByCustomerCategory, revenueByCustomer, receiptsByPaymentMethod: [...receipts.values()] };
}

function inDateRange(date: string, filter: Pick<FarmRecordFilter, "fromDate" | "toDate">) { return (!filter.fromDate || date >= filter.fromDate) && (!filter.toDate || date <= filter.toDate); }
function group<T>(records: T[], key: (record: T) => string, value: (record: T) => number) {
  const values = new Map<string, number>();
  for (const record of records) values.set(key(record), round((values.get(key(record)) ?? 0) + Math.max(0, value(record))));
  return [...values].map(([unit, quantity]) => ({ unit, quantity }));
}
function groupRecords<T>(records: T[], id: (record: T) => string | undefined, name: (record: T) => string, value: (record: T) => number) {
  const values = new Map<string, { id?: string; name: string; amount: number }>();
  for (const record of records) { const recordId = id(record); const recordName = name(record); const key = recordId ?? recordName; const current = values.get(key) ?? { id: recordId, name: recordName, amount: 0 }; current.amount = round(current.amount + Math.max(0, value(record))); values.set(key, current); }
  return [...values.values()];
}
function add(values: Map<string, { id?: string; name: string; amount: number }>, id: string | undefined, name: string, amount: number) { const key = id ?? name; const current = values.get(key) ?? { id, name, amount: 0 }; current.amount = round(current.amount + amount); values.set(key, current); }
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
