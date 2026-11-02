/** Shared Firestore contracts for the Armament applications. */
export const ARMAMENT_FIREBASE_PROJECT_ID = "armament-f5a0b" as const;
export const ARMAMENT_SOURCE_APPS = ["fynage", "murimi", "tengesa"] as const;
export type ArmamentSourceApp = (typeof ARMAMENT_SOURCE_APPS)[number];
export type SharedCollection =
  | "users" | "businesses" | "businessMemberships" | "subscriptions"
  | "subscriptionPayments" | "referrals" | "referralCredits" | "invitations"
  | "moneyLedger" | "customerLedger";
export type MoneyLedgerEntry = {
  id: string; ownerId: string; businessId: string | null; accountId: string;
  sourceApp: ArmamentSourceApp; sourceModule: string; sourceDocumentId: string;
  sourceCollection: string;
  transactionType: "sale" | "purchase" | "expense" | "income" | "loan" | "transfer" | "reversal" | "correction";
  direction: "in" | "out" | "transfer"; amountMinor: number; currency: string;
  transactionAt: string; status: "pending" | "posted" | "void";
  transferGroupId?: string; reversesEntryId?: string; createdAt: unknown; updatedAt: unknown;
};
export function sharedLedgerId(entry: Pick<MoneyLedgerEntry, "sourceApp" | "ownerId" | "businessId" | "accountId" | "sourceCollection" | "sourceDocumentId">): string {
  const identity = [entry.ownerId, entry.sourceApp, entry.businessId ?? "personal", entry.accountId, entry.sourceCollection, entry.sourceDocumentId];
  return `ledger_${encodeURIComponent(JSON.stringify(identity))}`;
}

/** Stable customer identity, scoped to the business that owns the source record. */
export function sharedCustomerId(input: { sourceApp: ArmamentSourceApp; ownerId: string; businessId: string; sourceCollection: string; sourceDocumentId: string }): string {
  return `customer_${encodeURIComponent(JSON.stringify([input.ownerId, input.sourceApp, input.businessId, input.sourceCollection, input.sourceDocumentId]))}`;
}
