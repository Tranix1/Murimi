import { createHash, randomBytes } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { CallableRequest, HttpsError, onCall } from "firebase-functions/v2/https";

const PROJECT = "armament-f5a0b";
if (!getApps().length) initializeApp();
const db = getFirestore();
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const projectOk = () => {
  const id = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT;
  return id === PROJECT || (process.env.FUNCTIONS_EMULATOR === "true" && typeof id === "string" && id.startsWith("demo-"));
};
const requireUid = (request: CallableRequest<unknown>) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in to continue.");
  if (!projectOk()) throw new HttpsError("failed-precondition", "Armament operations are only available in the shared Armament project.");
  return uid;
};
const str = (value: unknown, max = 160): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= max;
const businessKey = (uid: string, appId: string, sourceId: string) => hash(`${uid}:${appId}:${sourceId}`).slice(0, 40);
const memberKey = (businessId: string, uid: string) => `${businessId}_${uid}`;
const addUtcMonth = (from: number) => {
  const date = new Date(from); const day = date.getUTCDate();
  date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay)); return date.getTime();
};
const sourceMapId = (ownerId: string, appId: string, sourceId: string) => `${ownerId}_${appId}_${sourceId}`;
const activeRole = async (businessId: string, uid: string) => {
  const snapshot = await db.doc(`businessMemberships/${memberKey(businessId, uid)}`).get();
  const data = snapshot.data();
  return snapshot.exists && data?.businessId === businessId && data?.userId === uid && data?.status === "active" ? data.role as string : null;
};

/** Projects an owner's source record into the canonical ledger after validating it in its owning app path. */
export const syncArmamentMoneyLedger = onCall({ region: "us-central1" }, async (request) => {
  const uid = requireUid(request);
  const { sourceApp, sourceId, sourceCollection, sourceDocumentId, sourceRecord, deleted: deletionRequested = false } = request.data ?? {};
  if (!["fynage", "murimi", "tengesa"].includes(sourceApp) || !str(sourceId, 100) || !str(sourceCollection, 60) || !str(sourceDocumentId, 140) || sourceId.includes("/") || sourceDocumentId.includes("/")) {
    throw new HttpsError("invalid-argument", "A supported source and document identity are required.");
  }
  let sourcePath: string;
  let businessId: string | null = null;
  let accountId = "default";
  if (sourceApp === "fynage") {
    if (sourceId !== "personal" || sourceCollection !== "financial_ledger") throw new HttpsError("invalid-argument", "Fynage can only mirror personal ledger records.");
    sourcePath = `users/${uid}/financial_ledger/${sourceDocumentId}`;
  } else {
    if (!(sourceApp === "murimi" && sourceCollection === "transactions") && !(sourceApp === "tengesa" && sourceCollection === "expenses")) {
      throw new HttpsError("invalid-argument", "This source collection is not enabled for ledger sync.");
    }
    const mappingRef = db.doc(`sourceBusinessMappings/${sourceMapId(uid, sourceApp, sourceId)}`);
    const mapping = await mappingRef.get();
    if (!mapping.exists || mapping.get("ownerId") !== uid || mapping.get("sourceId") !== sourceId || mapping.get("sourceApp") !== sourceApp) {
      throw new HttpsError("failed-precondition", "Register this business before syncing its ledger.");
    }
    businessId = String(mapping.get("businessId"));
    accountId = sourceId;
    sourcePath = sourceApp === "murimi"
      ? `users/${uid}/farmAccounts/${sourceId}/${sourceCollection}/${sourceDocumentId}`
      : `users/${uid}/tengesa/${sourceId}/${sourceCollection}/${sourceDocumentId}`;
  }
  const source = await db.doc(sourcePath).get();
  const row = source.data() ?? (deletionRequested === true && sourceApp !== "fynage" && sourceRecord && typeof sourceRecord === "object" ? sourceRecord as Record<string, unknown> : undefined);
  if ((!source.exists && (deletionRequested !== true || !row)) || row?.ownerId !== uid || (sourceApp !== "fynage" && row.accountId !== sourceId && row.businessId !== sourceId)) {
    throw new HttpsError("permission-denied", "The source record is not owned by this account.");
  }
  const rawAmount = sourceApp === "murimi" ? Number(row.amount) : Number(row.amountMinor);
  const amountMinor = sourceApp === "murimi" ? Math.round(rawAmount * 100) : rawAmount;
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new HttpsError("failed-precondition", "The source record has no valid positive amount.");
  const rawDirection = String(row.direction ?? "").toLowerCase();
  const direction = sourceApp === "murimi" ? rawDirection === "inflow" ? "in" : rawDirection === "outflow" ? "out" : "" : sourceApp === "tengesa" ? "out" : rawDirection;
  if (!["in", "out", "transfer"].includes(direction)) throw new HttpsError("failed-precondition", "The source record has no valid direction.");
  const transactionType = sourceApp === "fynage"
    ? row.type === "transfer" ? "transfer" : row.type === "income" ? "income" : row.type === "loan_received" || row.type === "loan_repayment" ? "loan" : row.type === "adjustment" ? "correction" : "expense"
    : sourceApp === "murimi" ? row.category === "sale_payment" ? "sale" : String(row.category ?? "").startsWith("purchase_") ? "purchase" : direction === "in" ? "income" : "expense"
    : "expense";
  const ledgerIdentity = [uid, sourceApp, businessId ?? "personal", accountId === "default" ? String(row.accountId ?? "") : accountId, sourceCollection, sourceDocumentId];
  const id = `ledger_${encodeURIComponent(JSON.stringify(ledgerIdentity))}`;
  const sourceDeleted = typeof row.deletedAt === "string" && row.deletedAt.length > 0;
  const normalized = {
    id, ownerId: uid, businessId, accountId: accountId === "default" ? String(row.accountId ?? "default") : accountId,
    sourceApp, sourceModule: sourceApp === "fynage" ? "personal" : sourceApp === "murimi" ? "farm" : "store",
    sourceCollection, sourceDocumentId, transactionType, direction, amountMinor,
    currency: String(row.currency ?? "USD").slice(0, 8),
    category: String(row.category ?? "").slice(0, 100), description: String(row.description ?? "").slice(0, 240),
    transactionAt: String(row.occurredAt ?? row.transactionAt ?? row.expenseDate ?? row.date ?? row.updatedAt ?? new Date().toISOString()),
    status: deletionRequested === true || sourceDeleted || !source.exists ? "void" : "posted", createdAt: String(row.createdAt ?? new Date().toISOString()), updatedAt: String(row.updatedAt ?? new Date().toISOString()),
    ...(direction === "transfer" ? { transferGroupId: `transfer_${sourceDocumentId}` } : {}),
  };
  await db.doc(`moneyLedger/${id}`).set(normalized, { merge: true });
  return { id, status: normalized.status };
});

/** Creates the minimal, business-scoped customer reference from its owner-owned source record. */
export const syncArmamentCustomer = onCall({ region: "us-central1" }, async (request) => {
  const uid = requireUid(request);
  const { sourceApp, sourceId, sourceDocumentId } = request.data ?? {};
  if (!["murimi", "tengesa"].includes(sourceApp) || !str(sourceId, 100) || !str(sourceDocumentId, 140) || sourceId.includes("/") || sourceDocumentId.includes("/")) {
    throw new HttpsError("invalid-argument", "A supported business customer identity is required.");
  }
  const mapping = await db.doc(`sourceBusinessMappings/${sourceMapId(uid, sourceApp, sourceId)}`).get();
  if (!mapping.exists || mapping.get("ownerId") !== uid || mapping.get("sourceApp") !== sourceApp || mapping.get("sourceId") !== sourceId) throw new HttpsError("failed-precondition", "Register this business before syncing its customers.");
  const businessId = String(mapping.get("businessId"));
  const sourcePath = sourceApp === "murimi" ? `users/${uid}/farmAccounts/${sourceId}/customers/${sourceDocumentId}` : `users/${uid}/tengesa/${sourceId}/customers/${sourceDocumentId}`;
  const source = await db.doc(sourcePath).get();
  const customer = source.data();
  if (!source.exists || customer?.ownerId !== uid || (customer.accountId !== sourceId && customer.businessId !== sourceId)) throw new HttpsError("permission-denied", "The customer is not owned by this business.");
  const id = `customer_${encodeURIComponent(JSON.stringify([uid, sourceApp, businessId, "customers", sourceDocumentId]))}`;
  await db.doc(`customerLedger/${id}`).set({
    id, ownerId: uid, businessId, accountId: sourceId, sourceApp, sourceCollection: "customers", sourceDocumentId,
    name: String(customer.name ?? "").slice(0, 120), phone: String(customer.phone ?? "").slice(0, 40) || null,
    location: String(customer.location ?? "").slice(0, 160) || null, active: customer.active !== false,
    createdAt: String(customer.createdAt ?? new Date().toISOString()), updatedAt: String(customer.updatedAt ?? new Date().toISOString()),
  }, { merge: true });
  return { id, synced: true };
});
/** Creates or updates a business customer only for an active authorized member. */
export const createArmamentBusinessCustomer = onCall({ region: "us-central1" }, async (request) => {
  const uid = requireUid(request);
  const { businessId, customer } = request.data ?? {};
  if (!str(businessId, 64) || !customer || !str(customer.id, 100) || !/^[A-Za-z0-9_-]+$/.test(customer.id)
    || !str(customer.name, 120) || (customer.phone != null && !str(customer.phone, 40))) {
    throw new HttpsError("invalid-argument", "Business and valid customer details are required.");
  }
  const businessRef = db.doc(`businesses/${businessId}`);
  const business = await businessRef.get();
  if (!business.exists || business.get("status") !== "active" || !["murimi", "tengesa"].includes(String(business.get("sourceApp")))) throw new HttpsError("not-found", "Business is unavailable.");
  const role = await activeRole(businessId, uid);
  const member = await db.doc(`businessMemberships/${memberKey(businessId, uid)}`).get();
  const permissions = member.data()?.permissions;
  if (!role || (!(role === "owner" || role === "admin") && !(Array.isArray(permissions) && permissions.includes("customers.write")))) throw new HttpsError("permission-denied", "This role cannot manage business customers.");
  const ownerId = String(business.get("ownerId"));
  const sourceApp = String(business.get("sourceApp"));
  const sourceId = String(business.get("sourceId"));
  const subscription = await db.doc(`subscriptions/${ownerId}`).get();
  if (!subscription.exists || subscription.get("status") !== "active" || !(subscription.get("expiresAt") instanceof Timestamp) || subscription.get("expiresAt").toMillis() <= Date.now()) throw new HttpsError("permission-denied", "The business subscription is inactive.");
  const sourcePath = sourceApp === "murimi"
    ? `users/${ownerId}/farmAccounts/${sourceId}/customers/${customer.id}`
    : `users/${ownerId}/tengesa/${sourceId}/customers/${customer.id}`;
  const sourceRef = db.doc(sourcePath);
  const ledgerId = `customer_${encodeURIComponent(JSON.stringify([ownerId, sourceApp, businessId, "customers", customer.id]))}`;
  const ledgerRef = db.doc(`customerLedger/${ledgerId}`);
  const now = new Date().toISOString();
  await db.runTransaction(async (tx) => {
    const [existing, existingLedger] = await Promise.all([tx.get(sourceRef), tx.get(ledgerRef)]);
    if (existing.exists && (existing.get("ownerId") !== ownerId || (existing.get("accountId") ?? existing.get("businessId")) !== sourceId)) throw new HttpsError("already-exists", "Customer identity belongs to another business.");
    if (existingLedger.exists && (existingLedger.get("ownerId") !== ownerId || existingLedger.get("businessId") !== businessId || existingLedger.get("accountId") !== sourceId)) throw new HttpsError("already-exists", "Customer reference identity conflicts with another business.");
    const sourceRecord = { id: customer.id, ownerId, accountId: sourceId, businessId: sourceId, name: customer.name.trim(), phone: typeof customer.phone === "string" ? customer.phone.trim() : null, location: typeof customer.location === "string" ? customer.location.trim().slice(0, 160) : null, active: customer.active !== false, createdAt: existing.get("createdAt") ?? now, updatedAt: now, recordedByUid: uid };
    tx.set(sourceRef, sourceRecord, { merge: true });
    tx.set(ledgerRef, { id: ledgerId, ownerId, businessId, accountId: sourceId, sourceApp, sourceCollection: "customers", sourceDocumentId: customer.id, name: sourceRecord.name, phone: sourceRecord.phone, active: sourceRecord.active, createdAt: sourceRecord.createdAt, updatedAt: now }, { merge: true });
  });
  return { id: ledgerId, customerId: customer.id, businessId, created: true };
});
/** Registers a newly-created operational account in the shared business directory. */
export const registerArmamentBusiness = onCall({ region: "us-central1" }, async (request) => {
  const uid = requireUid(request);
  const { sourceApp, sourceId } = request.data ?? {};
  if (!["murimi", "tengesa"].includes(sourceApp) || !str(sourceId, 100) || sourceId.includes("/")) throw new HttpsError("invalid-argument", "A supported source app and account ID are required.");
  const sourcePath = sourceApp === "murimi" ? `users/${uid}/farmAccounts/${sourceId}` : `users/${uid}/tengesa/${sourceId}`;
  const source = await db.doc(sourcePath).get();
  if (!source.exists || source.get("ownerId") !== uid) throw new HttpsError("permission-denied", "The operational account is not owned by this user.");
  const id = businessKey(uid, sourceApp, sourceId);
  const name = String(source.get("name") ?? (sourceApp === "murimi" ? `Farm ${sourceId}` : "Store")).slice(0, 100);
  const businessRef = db.doc(`businesses/${id}`);
  const sourceMapRef = db.doc(`sourceBusinessMappings/${sourceMapId(uid, sourceApp, sourceId)}`);
  const membershipRef = db.doc(`businessMemberships/${memberKey(id, uid)}`);
  await db.runTransaction(async (tx) => {
    const [business, membership, sourceMap] = await Promise.all([tx.get(businessRef), tx.get(membershipRef), tx.get(sourceMapRef)]);
    if (business.exists && business.get("ownerId") !== uid) throw new HttpsError("already-exists", "Business identity collision.");
    if (sourceMap.exists && sourceMap.get("businessId") !== id) throw new HttpsError("already-exists", "Operational account is already mapped to another business.");
    tx.set(businessRef, { id, ownerId: uid, name, sourceApp, sourceId, status: "active", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.set(sourceMapRef, { ownerId: uid, sourceApp, sourceId, businessId: id, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    if (!membership.exists) tx.create(membershipRef, { id: membershipRef.id, businessId: id, userId: uid, ownerId: uid, role: "owner", status: "active", permissions: ["*"], createdAt: FieldValue.serverTimestamp() });
  });
  return { businessId: id, name, sourceApp, sourceId };
});

/** Owner/admin invitation creation. Target identity is resolved server-side by exact verified phone. */
export const inviteArmamentMember = onCall({ region: "us-central1" }, async (request) => {
  const uid = requireUid(request);
  const { businessId, phoneNumber, targetUid, role } = request.data ?? {};
  const hasTarget = str(targetUid, 128) && !targetUid.includes("/");
  const hasPhone = /^\+[1-9]\d{7,14}$/.test(String(phoneNumber ?? ""));
  if (!str(businessId, 64) || !["admin", "employee", "investor"].includes(role) || (!hasTarget && !hasPhone)) {
    throw new HttpsError("invalid-argument", "Business, selected user and supported role are required.");
  }
  const callerRole = await activeRole(businessId, uid);
  if (!["owner", "admin"].includes(callerRole ?? "")) throw new HttpsError("permission-denied", "Only an owner or admin can invite members.");
  if (callerRole === "admin" && role === "admin") throw new HttpsError("permission-denied", "Only the owner can appoint another admin.");
  let selectedUid = typeof targetUid === "string" ? targetUid : "";
  if (!selectedUid) {
    if (request.auth?.token.phone_number === phoneNumber) throw new HttpsError("invalid-argument", "You cannot invite yourself.");
    const targetQuery = await db.collection("users").where("phoneNumber", "==", phoneNumber).limit(2).get();
    if (targetQuery.size !== 1) throw new HttpsError("not-found", "No unique registered account matches that phone number.");
    selectedUid = targetQuery.docs[0].id;
  }
  if (selectedUid === uid || !(await db.doc(`users/${selectedUid}`).get()).exists) throw new HttpsError("invalid-argument", "Choose another registered user.");
  if (await activeRole(businessId, selectedUid)) throw new HttpsError("already-exists", "This user is already an active business member.");
  const business = await db.doc(`businesses/${businessId}`).get();
  if (!business.exists || business.get("status") !== "active") throw new HttpsError("not-found", "Business is unavailable.");
  const id = randomBytes(20).toString("hex");
  const ref = db.doc(`invitations/${id}`);
  const duplicate = await db.collection("invitations").where("businessId", "==", businessId).where("targetUid", "==", selectedUid).where("status", "==", "pending").limit(1).get();
  if (!duplicate.empty) return { invitationId: duplicate.docs[0].id, status: "pending", alreadyPending: true };
  await ref.create({ id, businessId, ownerId: business.get("ownerId"), invitedByUid: uid, targetUid: selectedUid, role, status: "pending", expiresAt: Timestamp.fromMillis(Date.now() + 14 * 86400000), createdAt: FieldValue.serverTimestamp() });
  return { invitationId: id, status: "pending" };
});

export const searchArmamentUsers = onCall({ region: "us-central1" }, async (request) => {
  const uid = requireUid(request);
  const { businessId, term } = request.data ?? {};
  if (!str(businessId, 64) || !str(term, 120)) throw new HttpsError("invalid-argument", "Business and phone number or name are required.");
  if (!["owner", "admin"].includes((await activeRole(businessId, uid)) ?? "")) throw new HttpsError("permission-denied", "Only an owner or admin can search invitees.");
  const normalized = term.trim();
  const matches = normalized.startsWith("+")
    ? await db.collection("users").where("phoneNumber", "==", normalized).limit(10).get()
    : await db.collection("users").where("displayName", "==", normalized).limit(10).get();
  return { users: matches.docs.filter((doc) => doc.id !== uid).map((doc) => {
    const phone = String(doc.get("phoneNumber") ?? "");
    return { uid: doc.id, name: String(doc.get("displayName") ?? "Armament user"), phoneHint: phone.length > 4 ? "••••" + phone.slice(-4) : "" };
  }) };
});

export const respondArmamentInvitation = onCall({ region: "us-central1" }, async (request) => {
  const uid = requireUid(request);
  const { invitationId, response } = request.data ?? {};
  if (!str(invitationId, 64) || !["accepted", "rejected"].includes(response)) throw new HttpsError("invalid-argument", "Invitation and response are required.");
  const invitationRef = db.doc(`invitations/${invitationId}`);
  await db.runTransaction(async (tx) => {
    const invitation = await tx.get(invitationRef);
    const data = invitation.data();
    if (!data || data.targetUid !== uid || data.status !== "pending" || !(data.expiresAt instanceof Timestamp) || data.expiresAt.toMillis() <= Date.now()) throw new HttpsError("permission-denied", "This invitation is unavailable or expired.");
    const businessRef = db.doc(`businesses/${data.businessId}`);
    const membershipRef = db.doc(`businessMemberships/${memberKey(data.businessId, uid)}`);
    const [business, membership] = await Promise.all([tx.get(businessRef), tx.get(membershipRef)]);
    if (!business.exists || business.get("status") !== "active" || business.get("ownerId") !== data.ownerId) throw new HttpsError("failed-precondition", "This business is unavailable.");
    if (membership.exists && membership.get("status") === "active") throw new HttpsError("already-exists", "You already have active access to this business.");
    tx.update(invitationRef, { status: response, respondedAt: FieldValue.serverTimestamp() });
    if (response === "accepted") {
      tx.set(membershipRef, { id: membershipRef.id, businessId: data.businessId, userId: uid, ownerId: data.ownerId, role: data.role, status: "active", permissions: data.role === "investor" ? ["investment.read"] : data.role === "employee" ? ["operations.read", "operations.write", "customers.read", "customers.write"] : ["operations.read", "operations.write", "finance.read"], invitationId, createdAt: FieldValue.serverTimestamp() });
    }
  });
  return { status: response };
});

export const revokeArmamentMember = onCall({ region: "us-central1" }, async (request) => {
  const uid = requireUid(request);
  const { businessId, memberUid } = request.data ?? {};
  if (!str(businessId, 64) || !str(memberUid, 128) || uid === memberUid) throw new HttpsError("invalid-argument", "Business and another member are required.");
  const callerRole = await activeRole(businessId, uid);
  if (callerRole !== "owner") throw new HttpsError("permission-denied", "Only the business owner can revoke a member.");
  const ref = db.doc(`businessMemberships/${memberKey(businessId, memberUid)}`);
  const member = await ref.get();
  if (!member.exists || member.get("role") === "owner") throw new HttpsError("not-found", "Revocable member not found.");
  const pendingInvitations = await db.collection("invitations").where("businessId", "==", businessId).where("targetUid", "==", memberUid).where("status", "==", "pending").get();
  const batch = db.batch();
  batch.update(ref, { status: "revoked", revokedAt: FieldValue.serverTimestamp(), revokedBy: uid });
  for (const invitation of pendingInvitations.docs) batch.update(invitation.ref, { status: "revoked", revokedAt: FieldValue.serverTimestamp(), revokedBy: uid });
  await batch.commit();
  return { revoked: true };
});

export const revokeArmamentInvitation = onCall({ region: "us-central1" }, async (request) => {
  const uid = requireUid(request);
  const invitationId = request.data?.invitationId;
  if (!str(invitationId, 64)) throw new HttpsError("invalid-argument", "Invitation is required.");
  const invitationRef = db.doc(`invitations/${invitationId}`);
  const invitation = await invitationRef.get();
  if (!invitation.exists || invitation.get("status") !== "pending") throw new HttpsError("not-found", "Pending invitation not found.");
  const businessId = String(invitation.get("businessId"));
  if (!["owner", "admin"].includes((await activeRole(businessId, uid)) ?? "")) throw new HttpsError("permission-denied", "Only an owner or admin can revoke an invitation.");
  await invitationRef.update({ status: "revoked", revokedAt: FieldValue.serverTimestamp(), revokedBy: uid });
  return { revoked: true };
});

export const getArmamentEntitlement = onCall({ region: "us-central1" }, async (request) => {
  const uid = requireUid(request);
  const businessId = request.data?.businessId;
  if (!str(businessId, 64)) throw new HttpsError("invalid-argument", "Business is required.");
  const role = await activeRole(businessId, uid);
  if (!role) throw new HttpsError("permission-denied", "Active business membership is required.");
  const business = await db.doc(`businesses/${businessId}`).get();
  if (!business.exists || business.get("status") !== "active") throw new HttpsError("not-found", "Business is unavailable.");
  const ownerId = business.get("ownerId");
  const subscription = await db.doc(`subscriptions/${ownerId}`).get();
  const data = subscription.data();
  const active = subscription.exists && data?.status === "active" && data.expiresAt instanceof Timestamp && data.expiresAt.toMillis() > Date.now();
  return { active, role, ownerId, expiresAt: active ? data?.expiresAt.toDate().toISOString() : null };
});

/** Returns only business ledger entries permitted for the caller's active role. */
export const readArmamentBusinessLedger = onCall({ region: "us-central1" }, async (request) => {
  const uid = requireUid(request);
  const businessId = request.data?.businessId;
  if (!str(businessId, 64)) throw new HttpsError("invalid-argument", "Business is required.");
  const role = await activeRole(businessId, uid);
  if (!role) throw new HttpsError("permission-denied", "Active business membership is required.");
  const business = await db.doc(`businesses/${businessId}`).get();
  if (!business.exists || business.get("status") !== "active") throw new HttpsError("not-found", "Business is unavailable.");
  const ownerId = business.get("ownerId");
  const sourceId = business.get("sourceId");
  const sourceApp = business.get("sourceApp");
  const subscription = await db.doc(`subscriptions/${ownerId}`).get();
  const subData = subscription.data();
  if (!subscription.exists || subData?.status !== "active" || !(subData.expiresAt instanceof Timestamp) || subData.expiresAt.toMillis() <= Date.now()) {
    throw new HttpsError("permission-denied", "The business subscription is inactive.");
  }
  if (role === "employee") throw new HttpsError("permission-denied", "This role cannot access financial records.");
  let query = db.collection("moneyLedger").where("ownerId", "==", ownerId).where("accountId", "==", sourceId).where("sourceApp", "==", sourceApp).orderBy("transactionAt", "desc").limit(100);
  const snapshot = await query.get();
  let rows: Record<string, unknown>[] = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  if (role === "investor") rows = rows.filter((row) => row.sourceCollection === "investments" || row.kind === "investment" || row.transactionType === "investment");
  return { businessId, businessName: business.get("name"), role, entries: rows };
});

export const listArmamentBusinesses = onCall({ region: "us-central1" }, async (request) => {
  const uid = requireUid(request);
  const memberships = await db.collection("businessMemberships").where("userId", "==", uid).where("status", "==", "active").limit(100).get();
  const output = [];
  for (const member of memberships.docs) {
    const business = await db.doc(`businesses/${member.get("businessId")}`).get();
    if (business.exists && business.get("status") === "active") output.push({
      id: business.id,
      ownerId: business.get("ownerId"),
      name: business.get("name"),
      sourceApp: business.get("sourceApp"),
      sourceId: business.get("sourceId"),
      role: member.get("role"),
    });
  }
  return { businesses: output };
});

export const setArmamentBusinessConnection = onCall({ region: "us-central1" }, async (request) => {
  const uid = requireUid(request);
  const { businessId, connected } = request.data ?? {};
  if (!str(businessId, 64) || typeof connected !== "boolean") throw new HttpsError("invalid-argument", "Business and connection state are required.");
  const role = await activeRole(businessId, uid);
  if (!role) throw new HttpsError("permission-denied", "Active business membership is required.");
  const connectionRef = db.doc(`users/${uid}/connectedApps/armament_${businessId}`);
  if (!connected) {
    await connectionRef.delete();
    return { connected: false };
  }
  const business = await db.doc(`businesses/${businessId}`).get();
  await connectionRef.set({
    id: `armament_${businessId}`,
    ownerId: uid,
    businessId,
    businessOwnerId: business.get("ownerId"),
    appId: business.get("sourceApp"),
    sourceId: business.get("sourceId"),
    status: "connected",
    connectedAt: FieldValue.serverTimestamp(),
  });
  return { connected: true };
});

/** Server-owned expense commit for Tengesa stores, including its canonical ledger projection. */
export const recordArmamentTengesaExpense = onCall({ region: "us-central1" }, async (request) => {
  const uid = requireUid(request);
  const { businessId, expense } = request.data ?? {};
  if (!str(businessId, 64) || !expense || !str(expense.id, 100) || !/^[A-Za-z0-9_-]+$/.test(expense.id)
    || !Number.isSafeInteger(expense.amountMinor) || expense.amountMinor <= 0
    || !str(expense.category, 100) || !str(expense.currency, 8)) throw new HttpsError("invalid-argument", "The store expense details are invalid.");
  const role = await activeRole(businessId, uid);
  if (!["owner", "admin", "employee"].includes(role ?? "")) throw new HttpsError("permission-denied", "This role cannot record a store expense.");
  const businessRef = db.doc(`businesses/${businessId}`);
  const business = await businessRef.get();
  if (!business.exists || business.get("sourceApp") !== "tengesa" || business.get("status") !== "active") throw new HttpsError("not-found", "Tengesa store is unavailable.");
  const ownerId = String(business.get("ownerId"));
  const storeId = String(business.get("sourceId"));
  const sub = await db.doc(`subscriptions/${ownerId}`).get();
  if (!sub.exists || sub.get("status") !== "active" || !(sub.get("expiresAt") instanceof Timestamp) || sub.get("expiresAt").toMillis() <= Date.now()) throw new HttpsError("permission-denied", "The store subscription is inactive.");
  const stamp = typeof expense.expenseDate === "string" && !Number.isNaN(Date.parse(expense.expenseDate)) ? expense.expenseDate : new Date().toISOString();
  const ref = db.doc(`users/${ownerId}/tengesa/${storeId}/expenses/${expense.id}`);
  const ledgerId = `ledger_${encodeURIComponent(JSON.stringify([ownerId, "tengesa", businessId, storeId, "expenses", expense.id]))}`;
  const ledgerRef = db.doc(`moneyLedger/${ledgerId}`);
  await db.runTransaction(async (tx) => {
    const [existing, store] = await Promise.all([tx.get(ref), tx.get(db.doc(`users/${ownerId}/tengesa/${storeId}`))]);
    if (existing.exists && (existing.get("ownerId") !== ownerId || existing.get("businessId") !== storeId || existing.get("amountMinor") !== expense.amountMinor || String(existing.get("currency")).toUpperCase() !== String(expense.currency).toUpperCase())) throw new HttpsError("already-exists", "Expense identity belongs to another store or has different values.");
    if (!store.exists || store.get("ownerId") !== ownerId || store.get("id") !== storeId) throw new HttpsError("permission-denied", "Store ownership could not be verified.");
    const record = { id: expense.id, ownerId, businessId: storeId, amountMinor: expense.amountMinor, currency: String(expense.currency).toUpperCase(), category: String(expense.category).trim().slice(0, 100), description: String(expense.description ?? "").slice(0, 240), paymentMethod: String(expense.paymentMethod ?? "cash").slice(0, 40), expenseDate: stamp, createdAt: stamp, updatedAt: new Date().toISOString(), recordedByUid: uid };
    if (existing.exists) tx.set(ref, { ...record, createdAt: existing.get("createdAt") ?? record.createdAt }, { merge: true });
    else tx.create(ref, record);
    tx.set(ledgerRef, { id: ledgerId, ownerId, businessId, accountId: storeId, sourceApp: "tengesa", sourceModule: "store", sourceCollection: "expenses", sourceDocumentId: expense.id, transactionType: "expense", direction: "out", amountMinor: expense.amountMinor, currency: record.currency, category: record.category, description: record.description, transactionAt: stamp, status: "posted", createdAt: record.createdAt, updatedAt: record.updatedAt }, { merge: true });
  });
  return { expenseId: expense.id, businessId, recorded: true };
});
/** Server-side POS commit: stock, sale, movements and shared money rows are atomic and retry-safe. */
export const recordArmamentTengesaSale = onCall({ region: "us-central1" }, async (request) => {
  const uid = requireUid(request);
  const { businessId, sale } = request.data ?? {};
  if (!str(businessId, 64) || !sale || !str(sale.id, 100) || !/^[A-Za-z0-9_-]+$/.test(sale.id)
    || !Array.isArray(sale.lines) || sale.lines.length < 1 || sale.lines.length > 40
    || !str(sale.paymentMethod, 40)) throw new HttpsError("invalid-argument", "The POS sale details are invalid.");
  const role = await activeRole(businessId, uid);
  if (!["owner", "admin", "employee"].includes(role ?? "")) throw new HttpsError("permission-denied", "This role cannot record a store sale.");
  const businessRef = db.doc(`businesses/${businessId}`);
  const business = await businessRef.get();
  if (!business.exists || business.get("sourceApp") !== "tengesa" || business.get("status") !== "active") throw new HttpsError("not-found", "Tengesa store is unavailable.");
  const ownerId = String(business.get("ownerId"));
  const storeId = String(business.get("sourceId"));
  const subscription = await db.doc(`subscriptions/${ownerId}`).get();
  if (!subscription.exists || subscription.get("status") !== "active" || !(subscription.get("expiresAt") instanceof Timestamp) || subscription.get("expiresAt").toMillis() <= Date.now()) {
    throw new HttpsError("permission-denied", "The store subscription is inactive.");
  }
  const storeRef = db.doc(`users/${ownerId}/tengesa/${storeId}`);
  const saleRef = db.doc(`users/${ownerId}/tengesa/${storeId}/sales/${sale.id}`);
  const customerId = typeof sale.customerId === "string" && sale.customerId ? sale.customerId : null;
  const customerRef = customerId ? db.doc(`users/${ownerId}/tengesa/${storeId}/customers/${customerId}`) : null;
  const cleanLines: { productId: string; quantity: number }[] = sale.lines.map((line: Record<string, unknown>) => {
    if (!str(line.productId, 100) || !Number.isInteger(line.quantity) || Number(line.quantity) < 1) throw new HttpsError("invalid-argument", "A product or quantity is invalid.");
    return { productId: line.productId, quantity: Number(line.quantity) };
  });
  if (new Set(cleanLines.map((line) => line.productId)).size !== cleanLines.length) throw new HttpsError("invalid-argument", "A product may appear only once in a sale.");
  const productRefs = cleanLines.map((line) => db.doc(`users/${ownerId}/tengesa/${storeId}/products/${line.productId}`));
  const saleTime = new Date().toISOString();
  await db.runTransaction(async (tx) => {
    const [prior, store, customer, ...products] = await Promise.all([
      tx.get(saleRef),
      tx.get(storeRef),
      customerRef ? tx.get(customerRef) : Promise.resolve(null),
      ...productRefs.map((ref) => tx.get(ref)),
    ]);
    if (prior.exists) return;
    if (!store.exists || store.get("ownerId") !== ownerId || store.get("id") !== storeId) throw new HttpsError("permission-denied", "Store ownership could not be verified.");
    if (customerRef && (!customer?.exists || customer.get("ownerId") !== ownerId || customer.get("businessId") !== storeId || customer.get("active") === false)) {
      throw new HttpsError("failed-precondition", "The selected customer is not active in this store.");
    }
    let revenueMinor = 0;
    let costMinor = 0;
    const lines = cleanLines.map((line, index) => {
      const product = products[index];
      if (!product?.exists || product.get("ownerId") !== ownerId || product.get("businessId") !== storeId || product.get("active") === false) throw new HttpsError("failed-precondition", "A product is unavailable in this store.");
      const priceMinor = Number(product.get("priceMinor"));
      const unitCostMinor = Number(product.get("costMinor"));
      const stock = Number(product.get("quantityOnHand"));
      if (!Number.isSafeInteger(priceMinor) || priceMinor < 0 || !Number.isSafeInteger(unitCostMinor) || unitCostMinor < 0 || !Number.isInteger(stock) || stock < line.quantity) {
        throw new HttpsError("failed-precondition", "The stock or price changed; refresh the sale before retrying.");
      }
      revenueMinor += priceMinor * line.quantity;
      costMinor += unitCostMinor * line.quantity;
      return { productId: line.productId, name: String(product.get("name") ?? "Product"), sku: String(product.get("sku") ?? ""), unit: String(product.get("unit") ?? "each"), quantity: line.quantity, unitPriceMinor: priceMinor, unitCostMinor, lineTotalMinor: priceMinor * line.quantity, lineCostMinor: unitCostMinor * line.quantity };
    });
    if (!Number.isSafeInteger(revenueMinor) || revenueMinor <= 0 || !Number.isSafeInteger(costMinor)) throw new HttpsError("invalid-argument", "The calculated sale total is invalid.");
    const currency = String(store.get("currency") ?? "USD");
    const saleRecord = { id: sale.id, ownerId, businessId: storeId, currency, receiptNumber: String(sale.receiptNumber ?? sale.id.slice(-8)).slice(0, 32), lines, subtotalMinor: revenueMinor, discountMinor: 0, totalMinor: revenueMinor, costOfGoodsMinor: costMinor, paymentMethod: sale.paymentMethod, customerId, customerNameSnapshot: customer ? String(customer.get("name") ?? "") : null, amountReceivedMinor: revenueMinor, changeMinor: 0, status: "completed", soldAt: saleTime, createdAt: saleTime, updatedAt: saleTime, recordedByUid: uid };
    tx.create(saleRef, saleRecord);
    for (let i = 0; i < lines.length; i++) {
      const productRef = productRefs[i];
      const nextStock = Number(products[i].get("quantityOnHand")) - lines[i].quantity;
      tx.update(productRef, { quantityOnHand: nextStock, updatedAt: saleTime });
      const movementId = `${sale.id}:${lines[i].productId}:sale`;
      tx.set(db.doc(`users/${ownerId}/tengesa/${storeId}/movements/${movementId}`), { id: movementId, ownerId, businessId: storeId, productId: lines[i].productId, type: "sale", quantityDelta: -lines[i].quantity, sourceRecordId: sale.id, occurredAt: saleTime, createdAt: saleTime });
    }
    const identity = (sourceDocumentId: string) => `ledger_${encodeURIComponent(JSON.stringify([ownerId, "tengesa", businessId, storeId, "sales", sourceDocumentId]))}`;
    const baseLedger = { ownerId, businessId, accountId: storeId, sourceApp: "tengesa", sourceModule: "store", sourceCollection: "sales", sourceTransactionId: sale.id, customerId, customerNameSnapshot: saleRecord.customerNameSnapshot, currency, transactionAt: saleTime, status: "posted", createdAt: saleTime, updatedAt: saleTime };
    if (customerRef && customer?.exists) {
      const customerLedgerId = `customer_${encodeURIComponent(JSON.stringify([ownerId, "tengesa", businessId, "customers", customerId]))}`;
      tx.set(db.doc(`customerLedger/${customerLedgerId}`), {
        id: customerLedgerId,
        ownerId,
        businessId,
        accountId: storeId,
        sourceApp: "tengesa",
        sourceCollection: "customers",
        sourceDocumentId: customerId,
        name: String(customer.get("name") ?? ""),
        phone: customer.get("phone") ?? null,
        active: true,
        createdAt: saleTime,
        updatedAt: saleTime,
      }, { merge: true });
    }
    const revenueId = identity(`${sale.id}:revenue`);
    tx.create(db.doc(`moneyLedger/${revenueId}`), { ...baseLedger, id: revenueId, sourceDocumentId: `${sale.id}:revenue`, transactionType: "sale", direction: "in", amountMinor: revenueMinor, category: "retail_sale", description: `Tengesa sale ${saleRecord.receiptNumber}` });
    if (costMinor > 0) {
      const costId = identity(`${sale.id}:cogs`);
      tx.create(db.doc(`moneyLedger/${costId}`), { ...baseLedger, id: costId, sourceDocumentId: `${sale.id}:cogs`, transactionType: "expense", direction: "out", amountMinor: costMinor, category: "cost_of_goods_sold", description: `Tengesa COGS ${saleRecord.receiptNumber}` });
    }
  });
  return { saleId: sale.id, businessId, recorded: true, idempotent: true };
});

export const assignArmamentReferralCode = onCall({ region: "us-central1" }, async (request) => {
  const uid = requireUid(request);
  const profile = await db.doc(`users/${uid}`).get();
  if (!profile.exists) await db.doc(`users/${uid}`).set({
    uid,
    phoneNumber: request.auth?.token.phone_number ?? null,
    displayName: request.auth?.token.name ?? null,
    email: request.auth?.token.email ?? null,
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  const existing = await db.doc(`referralOwners/${uid}`).get();
  if (existing.exists) return { code: existing.get("code") as string };
  const code = randomBytes(6).toString("base64url").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  const codeRef = db.doc(`referralCodes/${code}`);
  const ownerRef = db.doc(`referralOwners/${uid}`);
  await db.runTransaction(async (tx) => {
    if ((await tx.get(ownerRef)).exists) return;
    tx.create(codeRef, { code, ownerId: uid, createdAt: FieldValue.serverTimestamp(), status: "active" });
    tx.create(ownerRef, { uid, code, createdAt: FieldValue.serverTimestamp() });
  });
  const saved = await ownerRef.get();
  return { code: saved.get("code") as string };
});

export const attributeArmamentReferral = onCall({ region: "us-central1" }, async (request) => {
  const uid = requireUid(request);
  const code = request.data?.code;
  if (!str(code, 16)) throw new HttpsError("invalid-argument", "Referral code is required.");
  const codeRef = db.doc(`referralCodes/${code.toUpperCase()}`);
  const attributionRef = db.doc(`referralAttributions/${uid}`);
  const subscriptionRef = db.doc(`subscriptions/${uid}`);
  await db.runTransaction(async (tx) => {
    const [referral, existing, subscription] = await Promise.all([tx.get(codeRef), tx.get(attributionRef), tx.get(subscriptionRef)]);
    if (!referral.exists || referral.get("status") !== "active") throw new HttpsError("not-found", "Referral code is invalid.");
    if (referral.get("ownerId") === uid) throw new HttpsError("invalid-argument", "Self-referrals are not allowed.");
    if (existing.exists) throw new HttpsError("already-exists", "A referral is already attributed to this account.");
    if (subscription.exists) throw new HttpsError("failed-precondition", "Referral attribution must be applied before a subscription or credit is activated.");
    tx.create(attributionRef, { referredUid: uid, referrerUid: referral.get("ownerId"), code: code.toUpperCase(), status: "attributed", createdAt: FieldValue.serverTimestamp() });
  });
  return { attributed: true };
});

/** Called only by a payment verifier after it has verified the provider callback. */
export async function rewardArmamentReferralAfterVerifiedPayment(uid: string, paymentId: string, sourceApp: string) {
  const attributionRef = db.doc(`referralAttributions/${uid}`);
  const rewardId = hash(`referral:${uid}:${paymentId}`);
  await db.runTransaction(async (tx) => {
    const attribution = await tx.get(attributionRef);
    const data = attribution.data();
    const rewardRef = db.doc(`referralCredits/${rewardId}`);
    const reward = await tx.get(rewardRef);
    if (!data || data.status !== "attributed" || data.referrerUid === uid || reward.exists) return;
    tx.create(rewardRef, { id: rewardId, ownerId: data.referrerUid, referredUid: uid, sourceApp, sourcePaymentId: paymentId, creditMonths: 1, status: "available", createdAt: FieldValue.serverTimestamp() });
    tx.update(attributionRef, { status: "rewarded", qualifyingPaymentId: paymentId, rewardedAt: FieldValue.serverTimestamp() });
  });
}

export const redeemArmamentReferralCredit = onCall({ region: "us-central1" }, async (request) => {
  const uid = requireUid(request);
  const creditId = request.data?.creditId;
  if (!str(creditId, 64)) throw new HttpsError("invalid-argument", "Credit is required.");
  const creditRef = db.doc(`referralCredits/${creditId}`);
  const subscriptionRef = db.doc(`subscriptions/${uid}`);
  await db.runTransaction(async (tx) => {
    const [credit, subscription] = await Promise.all([tx.get(creditRef), tx.get(subscriptionRef)]);
    if (!credit.exists || credit.get("ownerId") !== uid || credit.get("status") !== "available") throw new HttpsError("permission-denied", "Credit is unavailable.");
    const current = subscription.data();
    const base = current?.status === "active" && current.expiresAt instanceof Timestamp && current.expiresAt.toMillis() > Date.now() ? current.expiresAt.toMillis() : Date.now();
    tx.update(creditRef, { status: "redeemed", redeemedBy: uid, redeemedAt: FieldValue.serverTimestamp() });
    tx.set(subscriptionRef, { ownerId: uid, status: "active", plan: "monthly", source: "referral_credit", expiresAt: Timestamp.fromMillis(addUtcMonth(base)), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  return { redeemed: true };
});
