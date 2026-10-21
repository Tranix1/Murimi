import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { initializeApp } from "firebase-admin/app";
import { HttpsError, onCall } from "firebase-functions/v2/https";

initializeApp();

const REQUIRED_PROJECT_ID = "murimi-9a3e7";
const MAX_AUTH_AGE_SECONDS = 5 * 60;

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
