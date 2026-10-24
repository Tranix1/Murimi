import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { initializeApp } from "firebase-admin/app";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { createHash, randomBytes } from "node:crypto";

initializeApp();

const REQUIRED_PROJECT_ID = "murimi-9a3e7";
const MAX_AUTH_AGE_SECONDS = 5 * 60;
const INTEGRATION_REGION = "us-central1";
const isMurimiProject = () => (process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT) === REQUIRED_PROJECT_ID;
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const safeId = (value: unknown): value is string => typeof value === "string" && /^(?:[1-9][0-9]*|acc[1-9][0-9]*)$/.test(value);
const cleanNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;

async function purgeFinanceIntegrationCredentials(uid: string, accountId?: string) {
  const db = getFirestore();
  const writer = db.bulkWriter();
  for (const collectionName of ["financeAccessTokens", "financePairingCodes"]) {
    const snapshot = await db.collection(collectionName).where("ownerId", "==", uid).get();
    for (const document of snapshot.docs) {
      if (!accountId || document.get("accountId") === accountId) writer.delete(document.ref);
    }
  }
  await writer.close();
}

/** Creates a short-lived one-time code for a user-approved external finance app connection. */
export const createMurimiFinancePairingCode = onCall({ region: INTEGRATION_REGION }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in to connect a finance app.");
  if (!isMurimiProject()) throw new HttpsError("failed-precondition", "Finance connections are available only in the Murimi production project.");
  const accountId = request.data?.accountId;
  const clientName = typeof request.data?.clientName === "string" ? request.data.clientName.trim().slice(0, 60) : "Finance app";
  if (!safeId(accountId) || !clientName) throw new HttpsError("invalid-argument", "Choose a valid farm account and app name.");
  const account = await getFirestore().doc(`users/${uid}/farmAccounts/${accountId}`).get();
  if (!account.exists || account.data()?.ownerId !== uid || account.data()?.accountId !== accountId) throw new HttpsError("permission-denied", "This farm account is not available to your user.");
  const pairingCode = randomBytes(24).toString("base64url");
  const codeHash = sha256(pairingCode);
  const nowMs = Date.now();
  await getFirestore().doc(`financePairingCodes/${codeHash}`).create({
    ownerId: uid, accountId, clientName, createdAt: new Date(nowMs).toISOString(), expiresAt: new Date(nowMs + 10 * 60_000).toISOString(), consumed: false,
  });
  return { pairingCode, expiresAt: new Date(nowMs + 10 * 60_000).toISOString(), clientName };
});

/** Lists app connections. Only the farm owner can see their connection metadata. */
export const listMurimiFinanceConnections = onCall({ region: INTEGRATION_REGION }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in to manage app connections.");
  if (!isMurimiProject()) throw new HttpsError("failed-precondition", "Finance connections are available only in the Murimi production project.");
  const accountId = request.data?.accountId;
  if (!safeId(accountId)) throw new HttpsError("invalid-argument", "A valid farm account is required.");
  const account = await getFirestore().doc(`users/${uid}/farmAccounts/${accountId}`).get();
  if (!account.exists || account.data()?.ownerId !== uid) throw new HttpsError("permission-denied", "This farm account is not available to your user.");
  const snapshot = await getFirestore().collection(`users/${uid}/farmAccounts/${accountId}/integrationPrivate/connections`).get();
  return { connections: snapshot.docs.map((doc) => { const revoked = doc.get("revoked") === true; const expiresAt = doc.get("expiresAt"); return { id: doc.id, clientName: doc.get("clientName"), createdAt: doc.get("createdAt"), lastUsedAt: doc.get("lastUsedAt"), expiresAt, revoked, active: !revoked && typeof expiresAt === "string" && Date.parse(expiresAt) > Date.now() }; }) };
});

/** Revokes an external finance app's bearer token immediately. */
export const revokeMurimiFinanceConnection = onCall({ region: INTEGRATION_REGION }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in to revoke an app connection.");
  if (!isMurimiProject()) throw new HttpsError("failed-precondition", "Finance connections are available only in the Murimi production project.");
  const { accountId, connectionId } = request.data ?? {};
  if (!safeId(accountId) || typeof connectionId !== "string" || !/^[a-f0-9]{64}$/.test(connectionId)) throw new HttpsError("invalid-argument", "The connection reference is invalid.");
  const ref = getFirestore().doc(`users/${uid}/farmAccounts/${accountId}/integrationPrivate/connections/${connectionId}`);
  const connection = await ref.get();
  if (!connection.exists || connection.data()?.ownerId !== uid || connection.data()?.accountId !== accountId) throw new HttpsError("not-found", "Connection not found.");
  await getFirestore().runTransaction(async (tx) => {
    tx.update(ref, { revoked: true, revokedAt: new Date().toISOString() });
    tx.update(getFirestore().doc(`financeAccessTokens/${connectionId}`), { revoked: true, revokedAt: new Date().toISOString() });
  });
  return { revoked: true };
});

/** Exchanges a single-use pairing code for a revocable, read-only finance token. */
export const exchangeMurimiFinancePairingCode = onRequest({ region: INTEGRATION_REGION, cors: true, maxInstances: 20 }, async (req, res) => {
  res.set("Cache-Control", "no-store");
  if (!isMurimiProject()) { res.status(503).json({ error: "Finance connections are unavailable in this project." }); return; }
  if (req.method !== "POST") { res.set("Allow", "POST").status(405).json({ error: "Use POST." }); return; }
  const pairingCode = req.body?.pairingCode;
  if (typeof pairingCode !== "string" || pairingCode.length < 30 || pairingCode.length > 80) { res.status(400).json({ error: "Invalid or expired pairing code." }); return; }
  const firestore = getFirestore();
  const pairingRef = firestore.doc(`financePairingCodes/${sha256(pairingCode)}`);
  const connectionToken = randomBytes(32).toString("base64url");
  const connectionId = sha256(connectionToken);
  const nowDate = new Date();
  try {
    const connection = await firestore.runTransaction(async (tx) => {
      const pairing = await tx.get(pairingRef);
      const data = pairing.data();
      if (!data || data.consumed || typeof data.expiresAt !== "string" || Date.parse(data.expiresAt) <= nowDate.getTime()) throw new Error("PAIRING_INVALID");
      const uid = data.ownerId;
      const accountId = data.accountId;
      if (typeof uid !== "string" || !safeId(accountId)) throw new Error("PAIRING_INVALID");
      const connectionRef = firestore.doc(`users/${uid}/farmAccounts/${accountId}/integrationPrivate/connections/${connectionId}`);
      const accessRef = firestore.doc(`financeAccessTokens/${connectionId}`);
      tx.update(pairingRef, { consumed: true, consumedAt: nowDate.toISOString() });
      tx.create(connectionRef, { ownerId: uid, accountId, tokenHash: connectionId, clientName: data.clientName, createdAt: nowDate.toISOString(), lastUsedAt: null, expiresAt: new Date(nowDate.getTime() + 90 * 24 * 60 * 60_000).toISOString(), revoked: false });
      tx.create(accessRef, { ownerId: uid, accountId, connectionId, expiresAt: new Date(nowDate.getTime() + 90 * 24 * 60 * 60_000).toISOString(), revoked: false });
      return { accountId, clientName: data.clientName };
    });
    res.status(200).json({ accessToken: connectionToken, tokenType: "Bearer", expiresIn: 90 * 24 * 60 * 60, accountId: connection.accountId, clientName: connection.clientName, dataUrl: `https://${INTEGRATION_REGION}-${REQUIRED_PROJECT_ID}.cloudfunctions.net/getMurimiFinancialData` });
  } catch {
    res.status(401).json({ error: "Invalid, expired, or already used pairing code." });
  }
});

/** Returns a minimized, read-only finance snapshot to a paired app. */
export const getMurimiFinancialData = onRequest({ region: INTEGRATION_REGION, cors: true, maxInstances: 30 }, async (req, res) => {
  res.set("Cache-Control", "no-store");
  if (!isMurimiProject()) { res.status(503).json({ error: "Finance connections are unavailable in this project." }); return; }
  if (req.method !== "GET") { res.set("Allow", "GET").status(405).json({ error: "Use GET." }); return; }
  const token = req.header("Authorization")?.match(/^Bearer ([A-Za-z0-9_-]{40,100})$/)?.[1];
  if (!token) { res.status(401).json({ error: "A valid bearer token is required." }); return; }
  const db = getFirestore();
  const connectionId = sha256(token);
  const accessRef = db.doc(`financeAccessTokens/${connectionId}`);
  const accessSnapshot = await accessRef.get();
  const access = accessSnapshot.data();
  if (!accessSnapshot.exists || !access || access.revoked || typeof access.ownerId !== "string" || !safeId(access.accountId) || typeof access.expiresAt !== "string" || Date.parse(access.expiresAt) <= Date.now()) { res.status(401).json({ error: "This finance connection is invalid, expired, or revoked." }); return; }
  const uid = access.ownerId;
  const accountId = access.accountId;
  const grantRef = db.doc(`users/${uid}/farmAccounts/${accountId}/integrationPrivate/connections/${connectionId}`);
  const grantSnapshot = await grantRef.get();
  const grant = grantSnapshot.data();
  if (!grantSnapshot.exists || !grant || grant.revoked || grant.ownerId !== uid || grant.accountId !== accountId) { res.status(401).json({ error: "This finance connection is invalid or revoked." }); return; }
  const accountRef = db.doc(`users/${uid}/farmAccounts/${accountId}`);
  const account = await accountRef.get();
  if (!account.exists || account.data()?.ownerId !== uid) { res.status(401).json({ error: "The farm account is no longer available." }); return; }
  const requestedCollections = ["sales", "purchases", "expenses", "transactions", "assets", "batches", "stock", "stockMovements", "payments"];
  const snapshots = await Promise.all(requestedCollections.map((name) => accountRef.collection(name).get()));
  const dataByCollection = Object.fromEntries(requestedCollections.map((name, index) => [name, snapshots[index].docs.map((doc) => ({ id: doc.id, ...doc.data() }))]));
  const sales = dataByCollection.sales as Record<string, unknown>[];
  const purchases = dataByCollection.purchases as Record<string, unknown>[];
  const expenses = dataByCollection.expenses as Record<string, unknown>[];
  const transactions = dataByCollection.transactions as Record<string, unknown>[];
  const cashInflows = transactions.filter((row) => row.direction === "inflow").reduce((sum, row) => sum + cleanNumber(row.amount), 0);
  const cashOutflows = transactions.filter((row) => row.direction === "outflow").reduce((sum, row) => sum + cleanNumber(row.amount), 0);
  const revenue = sales.reduce((sum, row) => sum + cleanNumber(row.totalValue), 0);
  const receivables = sales.reduce((sum, row) => sum + cleanNumber(row.outstanding), 0);
  const operatingExpenses = expenses.reduce((sum, row) => sum + cleanNumber(row.amount), 0);
  const outstandingPurchases = purchases.reduce((sum, row) => sum + cleanNumber(row.outstanding), 0);
  await grantRef.update({ lastUsedAt: new Date().toISOString() }).catch(() => undefined);
  const selectedSales = sales.map((row) => ({ id: row.id, date: row.date, batchId: row.batchId, customerId: row.customerId, customer: row.customerNameSnapshot ?? row.customer, totalValue: cleanNumber(row.totalValue), amountPaid: cleanNumber(row.paymentReceived), outstanding: cleanNumber(row.outstanding), badDebt: cleanNumber(row.badDebtAmount), status: row.paymentStatus ?? "unpaid" }));
  const selectedPurchases = purchases.map((row) => ({ id: row.id, date: row.date, supplierId: row.supplierId, supplier: row.supplierNameSnapshot ?? row.supplier, category: row.categoryNameSnapshot ?? row.category, item: row.itemName, totalCost: cleanNumber(row.totalCost), amountPaid: cleanNumber(row.amountPaid), outstanding: cleanNumber(row.outstanding), currency: row.currency, originalTotalCost: cleanNumber(row.originalTotalCost), originalAmountPaid: cleanNumber(row.originalAmountPaid), originalOutstanding: cleanNumber(row.originalOutstanding), exchangeRate: cleanNumber(row.exchangeRate), status: row.paymentStatus }));
  const selectedExpenses = expenses.map((row) => ({ id: row.id, date: row.date, batchId: row.batchId, category: row.category, description: row.description, amount: cleanNumber(row.amount), amountPaid: cleanNumber(row.amountPaid), status: row.paymentStatus }));
  const selectedBatches = (dataByCollection.batches as Record<string, unknown>[]).map((row) => ({ id: row.id, name: row.name, batchNumber: row.batchNumber, status: row.status, startedOn: row.dateStarted, closedAt: row.closedAt, initialQuantity: cleanNumber(row.initialQuantity) }));
  const selectedTransactions = transactions.map((row) => ({ id: row.id, date: row.date, direction: row.direction, category: row.category, amount: cleanNumber(row.amount), description: row.description, paymentMethod: row.paymentMethod }));
  const selectedAssets = (dataByCollection.assets as Record<string, unknown>[]).map((row) => ({ id: row.id, name: row.name, category: row.category, purchaseDate: row.purchaseDate, originalCost: cleanNumber(row.originalCost), estimatedValue: cleanNumber(row.estimatedValue), quantity: cleanNumber(row.quantity), status: row.status, disposalDate: row.disposalDate, disposalProceeds: cleanNumber(row.disposalProceeds) }));
  const selectedInventory = (dataByCollection.stock as Record<string, unknown>[]).map((row) => ({ id: row.id, name: row.name, category: row.category, baseUnit: row.baseUnit, active: row.active }));
  const selectedMovements = (dataByCollection.stockMovements as Record<string, unknown>[]).map((row) => ({ id: row.id, itemId: row.itemId, date: row.date, type: row.type, quantity: cleanNumber(row.quantity), unit: row.unit, batchId: row.batchId, totalCost: cleanNumber(row.totalCost), unitCost: cleanNumber(row.unitCost) }));
  const selectedPayments = (dataByCollection.payments as Record<string, unknown>[]).map((row) => ({ id: row.id, saleId: row.saleId, batchId: row.batchId, date: row.date, amount: cleanNumber(row.amount), method: row.method }));
  res.status(200).json({ schemaVersion: 1, generatedAt: new Date().toISOString(), business: { id: accountId, name: account.data()?.name ?? `Farm ${accountId}`, currency: "USD" }, balances: { cashNetMovement: Math.round((cashInflows - cashOutflows) * 100) / 100, customerReceivables: Math.round(receivables * 100) / 100, supplierPayables: Math.round(outstandingPurchases * 100) / 100 }, performance: { revenue: Math.round(revenue * 100) / 100, operatingExpenses: Math.round(operatingExpenses * 100) / 100, profitBeforeInventoryAndAssets: Math.round((revenue - operatingExpenses) * 100) / 100, cashInflows: Math.round(cashInflows * 100) / 100, cashOutflows: Math.round(cashOutflows * 100) / 100 }, sales: selectedSales, purchases: selectedPurchases, expenses: selectedExpenses, transactions: selectedTransactions, assets: selectedAssets, batches: selectedBatches, inventory: selectedInventory, stockMovements: selectedMovements, customerPayments: selectedPayments });
});

/** Removes the authenticated Murimi user and all nested Firestore account data. */
export const deleteMurimiAccount = onCall({ region: "us-central1" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in again before deleting your Murimi account.");

  const authTime = Number(request.auth?.token.auth_time);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(authTime) || nowSeconds - authTime > MAX_AUTH_AGE_SECONDS || authTime > nowSeconds) {
    throw new HttpsError("failed-precondition", "Verify your phone number again before deleting your account.");
  }

  const projectId = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT;
  if (projectId !== REQUIRED_PROJECT_ID) {
    throw new HttpsError("failed-precondition", `Account deletion is configured for ${REQUIRED_PROJECT_ID}, not ${projectId ?? "an unknown project"}.`);
  }

  try {
    await purgeFinanceIntegrationCredentials(uid);
    const firestore = getFirestore();
    await firestore.recursiveDelete(firestore.doc(`users/${uid}`));
    await getAuth().deleteUser(uid);
    return { deleted: true };
  } catch (error) {
    console.error("Murimi account deletion failed", { uid, error });
    throw new HttpsError("internal", "Murimi account deletion did not complete. Your device data has been kept; contact support before retrying if you were signed out.");
  }
});

/** Deletes one farm account and its nested collections while leaving the user's other accounts intact. */
export const deleteMurimiFarmAccount = onCall({ region: "us-central1" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in before deleting a farm account.");

  const accountId = request.data?.accountId;
  if (typeof accountId !== "string" || !/^(?:[1-9][0-9]*|acc[1-9][0-9]*)$/.test(accountId)) {
    throw new HttpsError("invalid-argument", "A valid farm account ID is required.");
  }

  const projectId = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT;
  if (projectId !== REQUIRED_PROJECT_ID) {
    throw new HttpsError("failed-precondition", `Farm account deletion is configured for ${REQUIRED_PROJECT_ID}, not ${projectId ?? "an unknown project"}.`);
  }

  try {
    await purgeFinanceIntegrationCredentials(uid, accountId);
    await getFirestore().recursiveDelete(getFirestore().doc(`users/${uid}/farmAccounts/${accountId}`));
    return { deleted: true, accountId };
  } catch (error) {
    console.error("Murimi farm account deletion failed", { uid, accountId, error });
    throw new HttpsError("internal", "Farm account deletion failed. Its local data has been kept.");
  }
});

/** Creates a private server-side audit entry for a generated export trace code. */
export const recordMurimiExportTrace = onCall({ region: "us-central1" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in to register this export trace.");

  const { accountId, traceCode, format, totalRecords, categories } = request.data ?? {};
  if (typeof accountId !== "string" || !/^(?:[1-9][0-9]*|acc[1-9][0-9]*)$/.test(accountId)
    || typeof traceCode !== "string" || !/^MRM-[A-Z0-9]+-[A-Z0-9]{6}$/.test(traceCode)
    || !["xlsx", "zip"].includes(format)
    || !Number.isInteger(totalRecords) || totalRecords < 1
    || !Array.isArray(categories) || categories.length > 24 || categories.some((category: unknown) => typeof category !== "string" || category.length > 48)) {
    throw new HttpsError("invalid-argument", "The export trace details are invalid.");
  }

  const projectId = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT;
  if (projectId !== REQUIRED_PROJECT_ID) {
    throw new HttpsError("failed-precondition", `Export tracing is configured for ${REQUIRED_PROJECT_ID}, not ${projectId ?? "an unknown project"}.`);
  }

  try {
    await getFirestore().doc(`users/${uid}/farmAccounts/${accountId}/exportAudits/${traceCode}`).create({
      ownerId: uid,
      accountId,
      traceCode,
      format,
      totalRecords,
      categories,
      createdAt: new Date().toISOString(),
    });
    return { recorded: true };
  } catch (error) {
    console.error("Murimi export trace registration failed", { uid, accountId, traceCode, error });
    throw new HttpsError("internal", "The export was created, but its trace could not be registered.");
  }
});
