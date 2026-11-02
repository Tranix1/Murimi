import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";

let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-armament-rules",
    firestore: { rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8") },
  });
});
after(async () => { await env?.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await setDoc(doc(firestore, "users/owner/farmAccounts/farm-a"), { id: "farm-a", ownerId: "owner", accountId: "farm-a", name: "Farm A", number: 1, currentRole: {} });
    await setDoc(doc(firestore, "users/owner/tengesa/store-a"), { id: "store-a", ownerId: "owner", name: "Store A" });
    await setDoc(doc(firestore, "users/owner/farmAccounts/farm-a/batches/batch-a"), { id: "batch-a", ownerId: "owner", accountId: "farm-a", name: "Batch A" });
    await setDoc(doc(firestore, "users/owner/farmAccounts/farm-a/transactions/transaction-a"), { id: "transaction-a", ownerId: "owner", accountId: "farm-a", amount: 20 });
    await setDoc(doc(firestore, "users/owner/tengesa/store-a/products/product-a"), { id: "product-a", ownerId: "owner", businessId: "store-a", quantityOnHand: 5 });
    await setDoc(doc(firestore, "users/owner/tengesa/store-a/sales/sale-a"), { id: "sale-a", ownerId: "owner", businessId: "store-a", totalMinor: 500 });
    await setDoc(doc(firestore, "businesses/farm-a"), { id: "farm-a", ownerId: "owner", status: "active" });
    await setDoc(doc(firestore, "businesses/store-a"), { id: "store-a", ownerId: "owner", status: "active" });
    await setDoc(doc(firestore, "subscriptions/owner"), { ownerId: "owner", status: "active", expiresAt: new Date(Date.now() + 86400000) });
    await setDoc(doc(firestore, "sourceBusinessMappings/owner_murimi_farm-a"), { ownerId: "owner", sourceApp: "murimi", sourceId: "farm-a", businessId: "farm-a" });
    await setDoc(doc(firestore, "sourceBusinessMappings/owner_tengesa_store-a"), { ownerId: "owner", sourceApp: "tengesa", sourceId: "store-a", businessId: "store-a" });
    await setDoc(doc(firestore, "businessMemberships/farm-a_owner"), { id: "farm-a_owner", businessId: "farm-a", userId: "owner", ownerId: "owner", role: "owner", status: "active", permissions: ["*"] });
    await setDoc(doc(firestore, "businessMemberships/farm-a_employee"), { id: "farm-a_employee", businessId: "farm-a", userId: "employee", ownerId: "owner", role: "employee", status: "active", permissions: ["operations.read", "operations.write"] });
    await setDoc(doc(firestore, "businessMemberships/farm-a_investor"), { id: "farm-a_investor", businessId: "farm-a", userId: "investor", ownerId: "owner", role: "investor", status: "active", permissions: ["investment.read"] });
    await setDoc(doc(firestore, "businessMemberships/store-a_employee"), { id: "store-a_employee", businessId: "store-a", userId: "employee", ownerId: "owner", role: "employee", status: "active", permissions: ["operations.read", "operations.write"] });
    await setDoc(doc(firestore, "moneyLedger/investment-a"), ledger({ id: "investment-a", businessId: "farm-a", sourceCollection: "investments", kind: "investment" }));
    await setDoc(doc(firestore, "invitations/invite-a"), { id: "invite-a", businessId: "farm-a", invitedByUid: "owner", targetUid: "recipient", status: "pending" });
  });
});

const ledger = (overrides = {}) => ({
  id: "murimi-entry-1", ownerId: "owner", businessId: "farm-a", accountId: "farm-a",
  sourceApp: "murimi", sourceModule: "farm", sourceCollection: "transactions", sourceDocumentId: "transaction-1",
  transactionType: "sale", direction: "in", amountMinor: 2500, currency: "USD",
  transactionAt: "2026-11-01T10:00:00.000Z", createdAt: "2026-11-01T10:00:00.000Z", updatedAt: "2026-11-01T10:00:00.000Z", status: "posted", ...overrides,
});

test("owner can create an idempotent shared ledger entry for their own source account", async () => {
  const db = env.authenticatedContext("owner").firestore();
  await assertSucceeds(setDoc(doc(db, "moneyLedger/murimi-entry-1"), ledger()));
  await assertSucceeds(getDoc(doc(db, "moneyLedger/murimi-entry-1")));
});

test("unauthenticated and different users cannot read or forge another owner's ledger", async () => {
  const ownerDb = env.authenticatedContext("owner").firestore();
  await setDoc(doc(ownerDb, "moneyLedger/murimi-entry-1"), ledger());
  const strangerDb = env.authenticatedContext("stranger").firestore();
  await assertFails(getDoc(doc(strangerDb, "moneyLedger/murimi-entry-1")));
  await assertFails(setDoc(doc(strangerDb, "moneyLedger/forged"), ledger({ id: "forged" })));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "moneyLedger/murimi-entry-1")));
});

test("ledger source cannot claim a store or farm belonging to a different account", async () => {
  const db = env.authenticatedContext("owner").firestore();
  await assertFails(setDoc(doc(db, "moneyLedger/wrong-account"), ledger({ id: "wrong-account", businessId: "farm-b", accountId: "farm-b" })));
  await assertFails(setDoc(doc(db, "moneyLedger/wrong-store"), ledger({ id: "wrong-store", sourceApp: "tengesa", sourceModule: "store", sourceCollection: "sales", businessId: "store-b", accountId: "store-b" })));
});

test("Tengesa sales are constrained to a store path and hidden from another owner", async () => {
  const ownerDb = env.authenticatedContext("owner").firestore();
  const sale = { id: "sale-a", ownerId: "owner", businessId: "store-a", totalMinor: 500, currency: "USD" };
  await assertSucceeds(setDoc(doc(ownerDb, "users/owner/tengesa/store-a/sales/sale-a"), sale));
  await assertFails(getDoc(doc(env.authenticatedContext("stranger").firestore(), "users/owner/tengesa/store-a/sales/sale-a")));
  await assertFails(setDoc(doc(ownerDb, "users/owner/tengesa/store-a/sales/cross-store"), { ...sale, id: "cross-store", businessId: "store-b" }));
});

test("connected app and customer records remain owner scoped", async () => {
  const ownerDb = env.authenticatedContext("owner").firestore();
  await assertSucceeds(setDoc(doc(ownerDb, "users/owner/connectedApps/tengesa_store-a"), { id: "tengesa_store-a", ownerId: "owner", appId: "tengesa", businessId: "store-a", status: "connected" }));
  await assertSucceeds(setDoc(doc(ownerDb, "customerLedger/customer-a"), { id: "customer-a", ownerId: "owner", businessId: "farm-a", sourceApp: "murimi", sourceCollection: "customers", sourceDocumentId: "customer-a", name: "Synthetic customer" }));
  await assertFails(getDoc(doc(env.authenticatedContext("stranger").firestore(), "customerLedger/customer-a")));
  await assertFails(getDoc(doc(env.authenticatedContext("stranger").firestore(), "users/owner/connectedApps/tengesa_store-a")));
});

test("clients cannot manipulate subscription or referral documents directly", async () => {
  const db = env.authenticatedContext("owner").firestore();
  await assertFails(setDoc(doc(db, "subscriptions/owner"), { ownerId: "owner", status: "active" }));
  await assertFails(setDoc(doc(db, "referralCredits/credit-a"), { ownerId: "owner", remainingMinor: 100 }));
});

test("business membership is server managed and role access is enforced for business finance", async () => {
  const employeeDb = env.authenticatedContext("employee").firestore();
  await assertSucceeds(getDoc(doc(employeeDb, "businesses/farm-a")));
  await assertSucceeds(getDoc(doc(employeeDb, "users/owner/farmAccounts/farm-a/batches/batch-a")));
  await assertFails(getDoc(doc(employeeDb, "users/owner/farmAccounts/farm-a/transactions/transaction-a")));
  await assertFails(setDoc(doc(employeeDb, "users/owner/farmAccounts/farm-a/transactions/employee-transaction"), { id: "employee-transaction", ownerId: "owner", accountId: "farm-a", amount: 100 }));
  await assertSucceeds(getDoc(doc(employeeDb, "users/owner/tengesa/store-a/products/product-a")));
  await assertFails(getDoc(doc(employeeDb, "users/owner/tengesa/store-a/customers/customer-a")));
  await assertFails(setDoc(doc(employeeDb, "users/owner/tengesa/store-a/sales/forged-sale"), { id: "forged-sale", ownerId: "owner", businessId: "store-a", totalMinor: 999999 }));
  await assertFails(getDoc(doc(employeeDb, "moneyLedger/investment-a")));
  await assertFails(setDoc(doc(employeeDb, "businessMemberships/farm-a_stranger"), { businessId: "farm-a", userId: "stranger", role: "owner", status: "active" }));
  const investorDb = env.authenticatedContext("investor").firestore();
  await assertSucceeds(getDoc(doc(investorDb, "moneyLedger/investment-a")));
  await assertFails(getDoc(doc(investorDb, "moneyLedger/murimi-entry-1")));
});

test("invitations cannot be forged or read by the wrong account", async () => {
  const recipientDb = env.authenticatedContext("recipient").firestore();
  await assertSucceeds(getDoc(doc(recipientDb, "invitations/invite-a")));
  await assertFails(getDoc(doc(env.authenticatedContext("stranger").firestore(), "invitations/invite-a")));
  await assertFails(setDoc(doc(recipientDb, "invitations/forged"), { targetUid: "recipient", status: "accepted" }));
});

test("employee permissions stop when the business subscription expires", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "subscriptions/owner"), { ownerId: "owner", status: "active", expiresAt: new Date(Date.now() - 1000) });
  });
  const employeeDb = env.authenticatedContext("employee").firestore();
  await assertFails(getDoc(doc(employeeDb, "users/owner/farmAccounts/farm-a/batches/batch-a")));
  await assertFails(getDoc(doc(employeeDb, "users/owner/tengesa/store-a/products/product-a")));
  await assertFails(getDoc(doc(employeeDb, "moneyLedger/investment-a")));
});
