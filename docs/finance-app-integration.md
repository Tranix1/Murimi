# Murimi finance app connection API

Status: implemented in source; Cloud Functions must be deployed to `murimi-9a3e7` before a partner app can connect.

## Consent and access model

The farm owner creates a one-time code inside Murimi for a named app and selected farm account. The code expires in 10 minutes and is consumed once. The exchange returns a random bearer token that is stored only as a SHA-256 hash in Firestore, expires after 90 days, and is read-only. The owner can revoke it in Murimi; subsequent data requests return `401`. No Murimi password, Firebase ID token, customer phone number, or write permission is shared with the partner. The partner can keep data it already downloaded; disconnecting prevents future downloads but cannot remotely erase the partner's offline cache.

## Pairing

Send the one-time code to:

```http
POST https://us-central1-murimi-9a3e7.cloudfunctions.net/exchangeMurimiFinancePairingCode
Content-Type: application/json

{"pairingCode":"<code shown in Murimi>"}
```

The response contains `accessToken`, `tokenType: "Bearer"`, `expiresIn`, `accountId`, `clientName`, and `dataUrl`. Save the token in the partner app's OS secure credential storage. Never put it in a URL, analytics event, log, or shared preference store.

## Read financial data

```http
GET https://us-central1-murimi-9a3e7.cloudfunctions.net/getMurimiFinancialData
Authorization: Bearer <accessToken>
```

The response is JSON with `schemaVersion: 1`, generation time, farm identity, cash movement, customer receivables, supplier payables, revenue and expense totals, plus mapped sales, purchases, expenses, cash transactions, assets, batches, stock and stock movements. Private server fields and phone numbers are omitted. Monetary totals are rounded to two decimals; `cashNetMovement` is cumulative recorded inflows less recorded outflows, not an opening cash balance. `profitBeforeInventoryAndAssets` is a simplified figure and must not be presented as audited profit.

The partner app should download this snapshot after pairing, associate its local cache with the connected Murimi account, and refresh when online. Keep showing the last downloaded snapshot offline with its `generatedAt` timestamp. If the request returns `401`, stop using the connection and ask the owner to reconnect it. This API currently returns the full snapshot on each fetch; use a modest refresh schedule and do not assume push updates.

## Owner controls in Murimi

Open **More → Finance app connections** or **Finances → Connect another app** to create a pairing code, see active app connections, and revoke access. The endpoint is read-only and does not expose Murimi login or cloud credentials.

## Deploy

From the repository root, install the Functions dependencies and deploy Functions:

```sh
npm --prefix functions install
firebase deploy --only functions --project murimi-9a3e7
```

Deploy only after reviewing the changed Functions and confirming the Firebase project has Cloud Functions enabled. Existing Firestore rules keep private integration records inaccessible to clients.
