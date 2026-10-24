# Murimi architecture audit

Audit date: 2026-10-24

## Current structure

- Expo SDK 57 with Expo Router screens under `src/app`.
- Farm records are typed in `src/types/farm.ts` and accessed through `src/services/farmRepository.ts`.
- The repository writes to local SQLite first (`src/services/farmLocalDatabase.ts`) and queues idempotent record upserts for Firestore synchronization. UI screens subscribe to local records and receive cloud refreshes through `useFarmRecords`.
- Firestore currently stores each account under `/users/{uid}/farmAccounts/{accountId}/{collection}/{recordId}`. `firestore.rules` gives access only to the owning UID.
- Purchases, reusable inventory items, and stock movements already exist. `calculateInventoryBalances` distinguishes stock on hand, allocations, consumption, and remaining value. Batch allocations are stock movements; allocation cost is recognized once when issued, and consumption records physical use without another cash outflow.
- Sales create an inflow only for money actually received. Outstanding sale value remains on the sale record. Purchases preserve item, supplier, payment and allocation fields; fixed assets have purchase and useful-life fields.
- Batch closure, mortality, weights, sales, payments, assets, working capital, and report/export calculations have dedicated records or screens.

## Gaps and constraints found

- Sales supported only built-in live and dressed product types. Custom reusable types are now stored in `saleProductTypes`; their ID and display snapshot are saved on sales.
- Customers already had an optional `phone` field in the model, but sale creation did not collect it and customer search only checked names. Sale entry now captures optional numbers, searches by name/phone, and shows phone numbers on saved customers.
- The Firebase layout and rules are owner-only. Membership, invitations, batch-level investor scopes, and secure employee/investor roles cannot be added safely as frontend-only features. They need a new business-root schema, verified membership claims or trusted backend authorization, staged data migration, and corresponding rules before those features can be enabled.
- No farm invitation, investor association/contribution, or authorized chat model was present in the inspected app code.
- Existing reports load all local records for the selected account and calculate report views locally. This works offline but does not yet provide paginated server-side analytics or immutable historical balance snapshots.
- The financial screens distinguish cash, receivables, inventory, assets and cash flow, but this audit did not establish a double-entry ledger or period-end snapshot table. Historical net-worth reporting must not imply reconstructable balances until snapshots or dated balance movements are implemented.

## Changes in this phase

- Added account-scoped `saleProductTypes` records, with product name and unit. Sale entry can create, select, edit, and archive these reusable types. Archiving leaves past sale snapshots intact.
- Extended sale records to accept custom type IDs and units while keeping the existing `live_birds` and `dressed_birds` values unchanged.
- Added optional customer phone capture and practical character validation (including Zimbabwean `+263` numbers); search includes saved phone numbers.
- Added the new collection to the export/report registry and Firestore owner rule allowlist. No SQLite schema migration is needed because farm records are stored as JSON payloads in a generic collection table.
- Added asset statuses for in use, bought but not in use, sold, and removed. Disposals keep the acquisition cost and current book value on the asset record; sold assets can store proceeds and create a linked cash inflow. Sold/removed assets are excluded from current fixed-asset value.
- Added a quick consumable purchase section to batch creation. It selects existing consumable inventory items, records a received purchase, and supports partial allocation on that purchase. Purchase and allocation movement records are saved together, and remaining quantity stays in farm inventory. Partial allocation uses the purchase's recorded unit cost.
- Added an all-or-part control to inventory allocation and a fully-paid sale option that records the current local date as the payment date.
- Added customer collection rankings and supplier purchase/payment rankings in analytics, monthly purchase and batch-cycle charts, and credit write-offs. Bad debt clears receivables and is counted as a loss without changing cash. Broiler daily records suggest starter (days 1–14), grower (days 15–20), and finisher (day 21 onward) stages; the user can override the suggested stage.

## Security and migration notes

Deploy the updated `firestore.rules` from the project before using custom product types with cloud synchronization. Existing documents need no bulk migration; the optional asset, bad-debt, purchase-allocation and product-type fields are backward-compatible. There are no new composite queries or indexes. The owner-only access policy remains in force.

Before implementing team access, migrate from user-owned account paths to a business-owned path such as `/businesses/{businessId}` and validate membership, role, and batch scope in rules. Use a trusted invitation acceptance flow; never let a client assign its own role. Keep a staged compatibility reader and verification/rollback plan to preserve offline records and existing account IDs.

