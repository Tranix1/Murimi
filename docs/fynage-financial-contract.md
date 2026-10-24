# Murimi to Fynage financial export contract (proposal)

Status: proposal only; no external API or automatic sharing is enabled.

## Boundary

Expose a versioned service DTO, not screen state or raw Firestore documents. Export is business-scoped and must require an explicit authorized user action or a future server-verified consent grant. Do not include Firebase credentials, access tokens, customer phone numbers, or unrelated operational notes in the financial export.

## Envelope

```ts
type MurimiFinancialExportV1 = {
  schemaVersion: 1;
  business: { id: string; name: string; reportingCurrency: string };
  generatedAt: string; // ISO-8601 UTC
  period: { from?: string; to?: string }; // inclusive YYYY-MM-DD farm dates
  balances: {
    cash: number;
    customerReceivables: number;
    supplierPayables: number;
    consumableInventory: number;
    fixedAssetsBookValue: number;
    otherCurrentAssets: number;
    otherLiabilities: number;
    totalAssets: number;
    totalLiabilities: number;
    netWorth: number;
  };
  performance: {
    revenue: number;
    operatingExpenses: number;
    profitOrLoss: number;
    cashInflows: number;
    cashOutflows: number;
    capitalContributions: number;
    ownerWithdrawals: number;
    badDebtWriteOffs: number;
  };
  transactions: Array<{
    id: string;
    date: string;
    kind: string;
    amount: number;
    currency: string;
    sourceCollection: string;
    sourceId: string;
    batchId?: string;
    counterpartyId?: string;
    status?: string;
  }>;
  batches: Array<{
    id: string;
    batchNumber: string;
    status: string;
    startedOn: string;
    completedOn?: string;
    costs: number;
    revenue: number;
    receivables: number;
    profitOrLoss: number;
  }>;
  assets: Array<{
    id: string;
    name: string;
    category: string;
    status: "in_use" | "not_in_use" | "sold" | "removed" | "other";
    acquiredOn?: string;
    originalCost: number;
    bookValue: number;
    disposedOn?: string;
    disposalProceeds?: number;
  }>;
};
```

## Identity and accounting rules

- `business.id`, record IDs, and source references must remain stable across sync and export. Current account-local farm record IDs can be retained during a later business migration.
- Dates use the farm-entered `YYYY-MM-DD`; audit timestamps use UTC ISO-8601. Money is decimal currency rounded to two places at the current application boundary. Do not combine different currencies without an explicit recorded conversion rate.
- Sale value is revenue; only actual receipt is cash inflow. The unpaid portion is a receivable.
- A confirmed bad-debt write-off clears the receivable and is reported as a loss; it does not reduce cash a second time.
- Purchase payment is cash outflow when paid. Consumable purchase value remains inventory until stock is issued. Issuance transfers value from inventory to batch cost once; later consumption does not create another cash flow or expense.
- Fixed asset acquisition is capitalized. Export book value only when acquisition date, cost and depreciation policy are sufficient; otherwise mark the value unavailable rather than inventing depreciation.
- Net worth is total assets minus total liabilities. Profit is period revenue minus period expenses. Cash is not profit, working capital, or net worth.
- Current records do not yet provide a complete, reconstructable period-end balance sheet. A future implementation must either keep immutable dated journal movements or persist verified period-end snapshots before claiming historical balances.

## Readiness requirements before exchange

Implement a pure calculation module and DTO mapper, add a schema compatibility test, and generate the export only from a permission-checked business repository. Require business consent, data minimization, and an audit record for each export. A future API must authenticate server-to-server and enforce business scope; this proposal intentionally creates no endpoint or standing credential.

