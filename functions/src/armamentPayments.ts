import { createHash, randomUUID } from "node:crypto";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getApps, initializeApp } from "firebase-admin/app";
import { defineSecret } from "firebase-functions/params";
import { onRequest } from "firebase-functions/v2/https";

const paynowId = defineSecret("PAYNOW_ID");
const paynowKey = defineSecret("PAYNOW_KEY");
if (!getApps().length) initializeApp();
const db = getFirestore();
const sha512 = (values: unknown[], key: string) => createHash("sha512").update(values.map((value) => String(value ?? "")).join("") + key).digest("hex").toUpperCase();
const hashValid = (data: Record<string, unknown>, key: string) => {
  const expected = String(data.hash ?? "").toUpperCase();
  const values = Object.entries(data).filter(([name]) => name.toLowerCase() !== "hash").map(([, value]) => value);
  return Boolean(expected) && sha512(values, key) === expected;
};

export const createArmamentSubscriptionPayment = onRequest({ region: "us-central1", secrets: [paynowId, paynowKey], cors: true }, async (req, res) => {
  if (req.method !== "POST") { res.status(405).json({ error: "POST required." }); return; }
  const header = String(req.headers.authorization ?? "");
  let user;
  try {
    if (!header.startsWith("Bearer ")) throw new Error("missing token");
    user = await (await import("firebase-admin/auth")).getAuth().verifyIdToken(header.slice(7));
  } catch { res.status(401).json({ error: "Sign in required." }); return; }
  try {
    const { businessId, sourceApp = "fynage", returnUrl } = req.body ?? {};
    if (!["fynage", "murimi", "tengesa"].includes(sourceApp)) { res.status(400).json({ error: "Unknown Armament app." }); return; }
    let businessName = "Personal account";
    if (sourceApp !== "fynage") {
      if (typeof businessId !== "string" || !businessId || businessId.includes("/")) { res.status(400).json({ error: "Business or farm account is required." }); return; }
      const path = sourceApp === "murimi" ? `users/${user.uid}/farmAccounts/${businessId}` : `users/${user.uid}/tengesa/${businessId}`;
      const business = await db.doc(path).get();
      if (!business.exists || business.get("ownerId") !== user.uid) { res.status(403).json({ error: "Business access denied." }); return; }
      businessName = String(business.get("name") ?? businessName).slice(0, 80);
    }
    const paymentId = randomUUID();
    const reference = `armament-${paymentId}`;
    const resultUrl = "https://us-central1-armament-f5a0b.cloudfunctions.net/armamentPaynowResult";
    const params = [paynowId.value(), reference, "1.00", `Armament monthly subscription: ${businessName}`, typeof returnUrl === "string" ? returnUrl : "fynage://subscription", resultUrl, user.email ?? "", user.phone_number ?? "", "web"];
    const response = await fetch("https://www.paynow.co.zw/interface/initiatetransaction", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ id: String(params[0]), reference, amount: "1.00", additionalinfo: String(params[3]), returnurl: String(params[4]), resulturl: resultUrl, authemail: String(params[6]), phone: String(params[7]), method: "web", hash: sha512(params, paynowKey.value()) }),
    });
    const values = Object.fromEntries(new URLSearchParams(await response.text()));
    if (!response.ok || !hashValid(values, paynowKey.value()) || !["ok", " ok"].includes(String(values.status))) { res.status(502).json({ error: "Paynow did not accept this payment request." }); return; }
    await db.doc(`subscriptionPayments/${paymentId}`).create({ id: paymentId, ownerId: user.uid, businessId: businessId ?? null, sourceApp, provider: "paynow", reference, status: "pending", amountMinor: 100, currency: "USD", pollUrl: values.pollurl, createdAt: FieldValue.serverTimestamp(), returnUrl: params[4] });
    res.json({ paymentId, redirectUrl: values.browserurl, status: "pending" });
  } catch (error) { console.error("Paynow initiation failed", error); res.status(500).json({ error: "Could not start payment." }); }
});

async function activateVerifiedPayment(attemptId: string, providerStatus: string) {
  const attemptRef = db.doc(`subscriptionPayments/${attemptId}`);
  await db.runTransaction(async (tx) => {
    const attempt = await tx.get(attemptRef);
    if (!attempt.exists || attempt.get("status") === "paid") return;
    const data = attempt.data()!;
    const subRef = db.doc(`subscriptions/${data.ownerId}`);
    const attributionRef = db.doc(`referralAttributions/${data.ownerId}`);
    const creditId = createHash("sha256").update(`referral:${data.ownerId}:${attemptId}`).digest("hex");
    const creditRef = db.doc(`referralCredits/${creditId}`);
    const [subscription, attribution, credit] = await Promise.all([tx.get(subRef), tx.get(attributionRef), tx.get(creditRef)]);
    const current = subscription.data();
    const base = current?.status === "active" && current.expiresAt instanceof Timestamp && current.expiresAt.toMillis() > Date.now() ? current.expiresAt.toMillis() : Date.now();
    const next = new Date(base);
    const month = next.getUTCMonth(); const day = next.getUTCDate();
    next.setUTCDate(1); next.setUTCMonth(month + 1);
    const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
    next.setUTCDate(Math.min(day, lastDay));
    tx.set(subRef, { ownerId: data.ownerId, status: "active", plan: "monthly", priceMinor: data.amountMinor, currency: data.currency, expiresAt: Timestamp.fromDate(next), lastPaymentId: attemptId, sourceApp: data.sourceApp, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.update(attemptRef, { status: "paid", verifiedAt: FieldValue.serverTimestamp(), providerStatus });
    const referrerUid = attribution.data()?.referrerUid;
    if (attribution.exists && attribution.get("status") === "attributed" && referrerUid && referrerUid !== data.ownerId && !credit.exists) {
      tx.create(creditRef, { id: creditId, ownerId: referrerUid, referredUid: data.ownerId, sourceApp: data.sourceApp, sourcePaymentId: attemptId, creditMonths: 1, status: "available", createdAt: FieldValue.serverTimestamp() });
      tx.update(attributionRef, { status: "rewarded", qualifyingPaymentId: attemptId, rewardedAt: FieldValue.serverTimestamp() });
    }
  });
}

export const armamentPaynowResult = onRequest({ region: "us-central1", secrets: [paynowKey] }, async (req, res) => {
  try {
    const body = typeof req.body === "string" ? Object.fromEntries(new URLSearchParams(req.body)) : req.body ?? {};
    const incoming = { ...req.query, ...body } as Record<string, unknown>;
    if (!hashValid(incoming, paynowKey.value())) { res.status(400).send("Invalid callback signature"); return; }
    const reference = String(incoming.reference ?? "");
    const attempts = await db.collection("subscriptionPayments").where("reference", "==", reference).limit(1).get();
    if (attempts.empty) { res.status(404).send("Unknown payment"); return; }
    const attempt = attempts.docs[0];
    const pollUrl = attempt.get("pollUrl");
    if (typeof pollUrl !== "string" || !pollUrl.startsWith("https://www.paynow.co.zw/")) { res.status(400).send("Invalid payment poll reference"); return; }
    const pollResponse = await fetch(pollUrl);
    const poll = Object.fromEntries(new URLSearchParams(await pollResponse.text()));
    if (!pollResponse.ok || !hashValid(poll, paynowKey.value())) { res.status(400).send("Unverified payment status"); return; }
    if (poll.status === "Paid" && Number(poll.amount) === Number(attempt.get("amountMinor")) / 100) await activateVerifiedPayment(attempt.id, poll.status);
    else await attempt.ref.set({ status: String(poll.status ?? "pending").toLowerCase(), providerStatus: poll.status, checkedAt: FieldValue.serverTimestamp() }, { merge: true });
    res.status(200).send("OK");
  } catch (error) { console.error("Paynow callback failed", error); res.status(500).send("Callback processing failed"); }
});
