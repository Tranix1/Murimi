/** Return the configured USD-cent amount, or null so payment creation fails closed. */
export function parseMonthlyAmountMinor(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

export function normalizeVerifiedPaynowStatus(value: string): string {
  const status = value.trim().toLowerCase();
  if (status === "paid") return "paid";
  if (["failed", "cancelled", "error", "rejected", "expired"].includes(status)) return status;
  return "pending";
}
