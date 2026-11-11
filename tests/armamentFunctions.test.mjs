import test from "node:test";
import assert from "node:assert/strict";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc } from "firebase/firestore";

const projectId = process.env.GCLOUD_PROJECT || "demo-armament-functions";
const authUrl = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key";
const functionsBase = `http://127.0.0.1:5001/${projectId}/us-central1/`;
let env;

async function createUser(email, phoneNumber) {
  const response = await fetch(authUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "test-password-123", returnSecureToken: true }) });
  const text = await response.text();
  assert.equal(response.ok, true, text);
  const user = JSON.parse(text);
  return { ...user, phoneNumber };
}

async function call(name, token, data = {}) {
  const response = await fetch(functionsBase + name, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ data }),
  });
  const body = await response.json();
  return { response, body };
}

test("trusted Armament callables enforce business roles, invitations, entitlements and referrals", async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: "rules_version = '2'; service cloud.firestore { match /databases/{database}/documents { match /{document=**} { allow read, write: if false; } } }" },
  });
  try {
    const owner = await createUser("owner@example.test", "+263771111111");
    const employee = await createUser("employee@example.test", "+263772222222");
    const investor = await createUser("investor@example.test", "+263773333333");
    const stranger = await createUser("stranger@example.test", "+263774444444");
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await Promise.all([
        setDoc(doc(db, `users/${owner.localId}`), { uid: owner.localId, phoneNumber: owner.phoneNumber }),
        setDoc(doc(db, `users/${employee.localId}`), { uid: employee.localId, phoneNumber: employee.phoneNumber, displayName: "Employee User" }),
        setDoc(doc(db, `users/${investor.localId}`), { uid: investor.localId, phoneNumber: investor.phoneNumber }),
        setDoc(doc(db, `users/${stranger.localId}`), { uid: stranger.localId, phoneNumber: stranger.phoneNumber }),
        setDoc(doc(db, `users/${owner.localId}/farmAccounts/farm-a`), { ownerId: owner.localId, accountId: "farm-a", name: "Test farm", number: 1, currentRole: {} }),
        setDoc(doc(db, `users/${owner.localId}/tengesa/store-a`), { id: "store-a", ownerId: owner.localId, name: "Store A", currency: "USD" }),
        setDoc(doc(db, `users/${owner.localId}/tengesa/store-a/products/product-a`), { id: "product-a", ownerId: owner.localId, businessId: "store-a", name: "Product A", sku: "A", unit: "each", priceMinor: 250, costMinor: 100, quantityOnHand: 5, active: true }),
        setDoc(doc(db, `users/${owner.localId}/tengesa/store-a/customers/customer-a`), { id: "customer-a", ownerId: owner.localId, businessId: "store-a", name: "Customer A", phone: "+263770000001", active: true }),
        setDoc(doc(db, `users/${owner.localId}/tengesa/store-b`), { id: "store-b", ownerId: owner.localId, name: "Store B", currency: "USD" }),
        setDoc(doc(db, `users/${owner.localId}/tengesa/store-b/products/product-a`), { id: "product-a", ownerId: owner.localId, businessId: "store-b", name: "Product A", sku: "A", unit: "each", priceMinor: 900, costMinor: 500, quantityOnHand: 5, active: true }),
      ]);
    });

    const unauth = await call("registerArmamentBusiness", null, { sourceApp: "murimi", sourceId: "farm-a" });
    assert.equal(unauth.body.error?.status, "UNAUTHENTICATED");
    const unauthPayment = await fetch(functionsBase + "createArmamentSubscriptionPayment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceApp: "fynage" }) });
    assert.equal(unauthPayment.status, 401, "payment initiation must require a verified Firebase user");
    const plan = await call("getArmamentSubscriptionPlan", owner.idToken);
    assert.equal(plan.response.ok, true, JSON.stringify(plan.body));
    assert.equal(plan.body.result.amountMinor, 100, "shared subscription price is exactly 100 USD cents per month");
    assert.equal(plan.body.result.currency, "USD");
    const paymentStatusId = "11111111-1111-4111-8111-111111111111";
    await env.withSecurityRulesDisabled(async (ctx) => setDoc(doc(ctx.firestore(), `subscriptionPayments/${paymentStatusId}`), {
      id: paymentStatusId, ownerId: owner.localId, status: "pending", amountMinor: 100, currency: "USD",
    }));
    const foreignPaymentStatus = await call("checkArmamentSubscriptionPayment", stranger.idToken, { paymentId: paymentStatusId });
    assert.equal(foreignPaymentStatus.response.ok, false, "payment status is private to its initiating account");

    const registered = await call("registerArmamentBusiness", owner.idToken, { sourceApp: "murimi", sourceId: "farm-a" });
    assert.equal(registered.response.ok, true, JSON.stringify(registered.body));
    const businessId = registered.body.result.businessId;
    assert.equal((await call("registerArmamentBusiness", owner.idToken, { sourceApp: "murimi", sourceId: "farm-a" })).body.result.businessId, businessId);
    const retailRegistration = await call("registerArmamentBusiness", owner.idToken, { sourceApp: "tengesa", sourceId: "store-a" });
    assert.equal(retailRegistration.response.ok, true, JSON.stringify(retailRegistration.body));

    const inviteEmployee = await call("inviteArmamentMember", owner.idToken, { businessId, phoneNumber: employee.phoneNumber, role: "employee" });
    assert.equal(inviteEmployee.response.ok, true, JSON.stringify(inviteEmployee.body));
    await env.withSecurityRulesDisabled(async (ctx) => setDoc(doc(ctx.firestore(), `businesses/${businessId}`), { status: "inactive" }, { merge: true }));
    assert.equal((await call("respondArmamentInvitation", employee.idToken, { invitationId: inviteEmployee.body.result.invitationId, response: "accepted" })).response.ok, false, "disabled businesses must not grant memberships");
    await env.withSecurityRulesDisabled(async (ctx) => setDoc(doc(ctx.firestore(), `businesses/${businessId}`), { status: "active" }, { merge: true }));
    const searched = await call("searchArmamentUsers", owner.idToken, { businessId, term: employee.phoneNumber });
    assert.equal(searched.response.ok, true);
    assert.equal(searched.body.result.users[0].uid, employee.localId);
    assert.equal(searched.body.result.users[0].phoneHint.endsWith("2222"), true);
    const wrongAccept = await call("respondArmamentInvitation", stranger.idToken, { invitationId: inviteEmployee.body.result.invitationId, response: "accepted" });
    assert.equal(wrongAccept.response.ok, false);
    assert.equal((await call("respondArmamentInvitation", employee.idToken, { invitationId: inviteEmployee.body.result.invitationId, response: "accepted" })).response.ok, true);

    const inviteInvestor = await call("inviteArmamentMember", owner.idToken, { businessId, phoneNumber: investor.phoneNumber, role: "investor" });
    assert.equal(inviteInvestor.response.ok, true, JSON.stringify(inviteInvestor.body));
    assert.equal((await call("respondArmamentInvitation", investor.idToken, { invitationId: inviteInvestor.body.result.invitationId, response: "accepted" })).response.ok, true);
    const rejectedInvite = await call("inviteArmamentMember", owner.idToken, { businessId, phoneNumber: stranger.phoneNumber, role: "employee" });
    assert.equal(rejectedInvite.response.ok, true);
    assert.equal((await call("respondArmamentInvitation", stranger.idToken, { invitationId: rejectedInvite.body.result.invitationId, response: "rejected" })).response.ok, true);
    assert.equal((await call("getArmamentEntitlement", stranger.idToken, { businessId })).response.ok, false);
    const revokedInvite = await call("inviteArmamentMember", owner.idToken, { businessId, phoneNumber: stranger.phoneNumber, role: "employee" });
    assert.equal(revokedInvite.response.ok, true);
    assert.equal((await call("revokeArmamentInvitation", owner.idToken, { invitationId: revokedInvite.body.result.invitationId })).response.ok, true);
    assert.equal((await call("respondArmamentInvitation", stranger.idToken, { invitationId: revokedInvite.body.result.invitationId, response: "accepted" })).response.ok, false);
    const retailInvite = await call("inviteArmamentMember", owner.idToken, { businessId: retailRegistration.body.result.businessId, phoneNumber: employee.phoneNumber, role: "employee" });
    assert.equal(retailInvite.response.ok, true, JSON.stringify(retailInvite.body));
    assert.equal((await call("respondArmamentInvitation", employee.idToken, { invitationId: retailInvite.body.result.invitationId, response: "accepted" })).response.ok, true);

    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `subscriptions/${owner.localId}`), { ownerId: owner.localId, status: "active", expiresAt: new Date(Date.now() + 86400000) });
      await setDoc(doc(db, "moneyLedger/entry-operations"), { id: "entry-operations", ownerId: owner.localId, accountId: "farm-a", sourceApp: "murimi", sourceCollection: "transactions", amountMinor: 100, direction: "out", transactionAt: new Date().toISOString(), status: "posted" });
      await setDoc(doc(db, "moneyLedger/entry-investment"), { id: "entry-investment", ownerId: owner.localId, accountId: "farm-a", sourceApp: "murimi", sourceCollection: "investments", kind: "investment", amountMinor: 500, direction: "out", transactionAt: new Date().toISOString(), status: "posted" });
      await setDoc(doc(db, `users/${owner.localId}/farmAccounts/farm-a/transactions/purchase-1`), { id: "purchase-1", ownerId: owner.localId, accountId: "farm-a", category: "purchase_feed", direction: "outflow", amount: 32.5, currency: "USD", date: new Date().toISOString(), createdAt: new Date().toISOString() });
      await setDoc(doc(db, `users/${owner.localId}/farmAccounts/farm-a/transactions/sale-1`), { id: "sale-1", ownerId: owner.localId, accountId: "farm-a", category: "sale_payment", direction: "inflow", amount: 80, currency: "USD", date: new Date().toISOString(), createdAt: new Date().toISOString() });
      await setDoc(doc(db, "moneyLedger/fynage-personal"), { id: "fynage-personal", ownerId: owner.localId, businessId: null, accountId: "personal", sourceApp: "fynage", sourceModule: "personal", sourceCollection: "transactions", sourceDocumentId: "personal-1", transactionType: "income", direction: "in", amountMinor: 9000, currency: "USD", transactionAt: new Date().toISOString(), status: "posted" });
    });
    for (const sourceDocumentId of ["purchase-1", "sale-1"]) {
      const synced = await call("syncArmamentMoneyLedger", owner.idToken, { sourceApp: "murimi", sourceId: "farm-a", sourceCollection: "transactions", sourceDocumentId });
      assert.equal(synced.response.ok, true, JSON.stringify(synced.body));
    }
    const employeeEntitlement = await call("getArmamentEntitlement", employee.idToken, { businessId });
    assert.equal(employeeEntitlement.body.result.active, true);
    assert.equal(employeeEntitlement.body.result.role, "employee");
    assert.equal((await call("readArmamentBusinessLedger", employee.idToken, { businessId })).response.ok, false);
    const investorLedger = await call("readArmamentBusinessLedger", investor.idToken, { businessId });
    assert.equal(investorLedger.response.ok, true, JSON.stringify(investorLedger.body));
    assert.deepEqual(investorLedger.body.result.entries.map((entry) => entry.id), ["entry-investment"], JSON.stringify(investorLedger.body));
    const ownerFarmLedger = await call("readArmamentBusinessLedger", owner.idToken, { businessId });
    const purchase = ownerFarmLedger.body.result.entries.find((entry) => entry.sourceDocumentId === "purchase-1");
    const sale = ownerFarmLedger.body.result.entries.find((entry) => entry.sourceDocumentId === "sale-1");
    assert.equal(purchase?.transactionType, "purchase");
    assert.equal(purchase?.direction, "out");
    assert.equal(purchase?.amountMinor, 3250);
    assert.equal(purchase?.businessId, businessId);
    assert.equal(sale?.transactionType, "sale");
    assert.equal(sale?.direction, "in");
    assert.equal(sale?.amountMinor, 8000);
    assert.equal(sale?.businessId, businessId);
    assert.deepEqual(new Set(ownerFarmLedger.body.result.entries.map((entry) => entry.id)), new Set(["entry-operations", "entry-investment", purchase?.id, sale?.id]));
    assert.equal(ownerFarmLedger.body.result.entries.some((entry) => entry.id === "fynage-personal"), false, "personal Fynage finances stay outside the farm ledger");
    const salePayload = { id: "sale-emulator-1", receiptNumber: "SALE-1", paymentMethod: "cash", customerId: "customer-a", lines: [{ productId: "product-a", quantity: 2 }] };
    const committedSale = await call("recordArmamentTengesaSale", employee.idToken, { businessId: retailRegistration.body.result.businessId, sale: salePayload });
    assert.equal(committedSale.response.ok, true, JSON.stringify(committedSale.body));
    assert.equal(committedSale.body.result.recorded, true);
    const repeatedSale = await call("recordArmamentTengesaSale", employee.idToken, { businessId: retailRegistration.body.result.businessId, sale: salePayload });
    assert.equal(repeatedSale.response.ok, true, JSON.stringify(repeatedSale.body));
    let stockA; let stockB; let retailLedger; let customerEntry;
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      stockA = await getDoc(doc(db, `users/${owner.localId}/tengesa/store-a/products/product-a`));
      stockB = await getDoc(doc(db, `users/${owner.localId}/tengesa/store-b/products/product-a`));
      retailLedger = await getDoc(doc(db, "moneyLedger/ledger_" + encodeURIComponent(JSON.stringify([owner.localId, "tengesa", retailRegistration.body.result.businessId, "store-a", "sales", "sale-emulator-1:revenue"]))));
      const customers = await db.collection("customerLedger").get();
      customerEntry = customers.docs.find((item) => item.get("sourceDocumentId") === "customer-a");
    });
    assert.equal(stockA.get("quantityOnHand"), 3);
    assert.equal(stockB.get("quantityOnHand"), 5);
    assert.equal(retailLedger.get("amountMinor"), 500);
    assert.equal(retailLedger.get("businessId"), retailRegistration.body.result.businessId);
    assert.equal(retailLedger.get("accountId"), "store-a");
    assert.equal(retailLedger.get("customerId"), "customer-a");
    assert.equal((await call("readArmamentBusinessLedger", employee.idToken, { businessId: retailRegistration.body.result.businessId })).response.ok, false);
    assert.equal(customerEntry?.get("ownerId"), owner.localId);
    assert.equal(customerEntry?.get("businessId"), retailRegistration.body.result.businessId);
    assert.equal(customerEntry?.get("accountId"), "store-a");

    const expensePayload = { id: "expense-emulator-1", amountMinor: 725, currency: "USD", category: "rent", description: "Monthly rent", expenseDate: new Date().toISOString() };
    const committedExpense = await call("recordArmamentTengesaExpense", employee.idToken, { businessId: retailRegistration.body.result.businessId, expense: expensePayload });
    assert.equal(committedExpense.response.ok, true, JSON.stringify(committedExpense.body));
    assert.equal((await call("recordArmamentTengesaExpense", employee.idToken, { businessId: retailRegistration.body.result.businessId, expense: expensePayload })).response.ok, true);
    let expenseRecord; let expenseLedger;
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      expenseRecord = await getDoc(doc(db, `users/${owner.localId}/tengesa/store-a/expenses/${expensePayload.id}`));
      const expenseId = "ledger_" + encodeURIComponent(JSON.stringify([owner.localId, "tengesa", retailRegistration.body.result.businessId, "store-a", "expenses", expensePayload.id]));
      expenseLedger = await getDoc(doc(db, `moneyLedger/${expenseId}`));
    });
    assert.equal(expenseRecord.get("recordedByUid"), employee.localId);
    assert.equal(expenseLedger.get("amountMinor"), expensePayload.amountMinor);
    assert.equal(expenseLedger.get("businessId"), retailRegistration.body.result.businessId);
    assert.equal(expenseLedger.get("accountId"), "store-a");

    const ownerCode = await call("assignArmamentReferralCode", owner.idToken);
    assert.equal(ownerCode.response.ok, true);
    const selfReferral = await call("attributeArmamentReferral", owner.idToken, { code: ownerCode.body.result.code });
    assert.equal(selfReferral.response.ok, false);
    await env.withSecurityRulesDisabled(async (ctx) => setDoc(doc(ctx.firestore(), `subscriptions/${investor.localId}`), { ownerId: investor.localId, status: "active", expiresAt: new Date(Date.now() + 86400000) }));
    const lateReferral = await call("attributeArmamentReferral", investor.idToken, { code: ownerCode.body.result.code });
    assert.equal(lateReferral.response.ok, false, "an account with an activated subscription cannot retroactively claim a referral");
    const attributed = await call("attributeArmamentReferral", stranger.idToken, { code: ownerCode.body.result.code });
    assert.equal(attributed.response.ok, true, JSON.stringify(attributed.body));
    assert.equal((await call("attributeArmamentReferral", stranger.idToken, { code: ownerCode.body.result.code })).response.ok, false);

    await env.withSecurityRulesDisabled(async (ctx) => setDoc(doc(ctx.firestore(), "referralCredits/credit-test"), { id: "credit-test", ownerId: stranger.localId, status: "available", creditMonths: 1 }));
    const redeemed = await call("redeemArmamentReferralCredit", stranger.idToken, { creditId: "credit-test" });
    assert.equal(redeemed.response.ok, true, JSON.stringify(redeemed.body));
    let credit;
    await env.withSecurityRulesDisabled(async (ctx) => { credit = await getDoc(doc(ctx.firestore(), "referralCredits/credit-test")); });
    assert.equal(credit.get("status"), "redeemed");

    assert.equal((await call("revokeArmamentMember", owner.idToken, { businessId, memberUid: employee.localId })).response.ok, true);
    assert.equal((await call("getArmamentEntitlement", employee.idToken, { businessId })).response.ok, false);
  } finally {
    await env.cleanup();
  }
});
