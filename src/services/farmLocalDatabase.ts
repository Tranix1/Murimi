import { Platform } from "react-native";
import * as SQLite from "expo-sqlite";
import type { FarmCollection } from "@/services/farmRepository";

export type SyncOperation = "upsert" | "delete" | "batch" | "daily" | "sale" | "slaughter" | "expense" | "payment";
export type FarmChange = {
  collectionName: FarmCollection;
  id: string;
  record: Record<string, unknown> | null;
  operation?: SyncOperation;
  queue?: boolean;
  protectRemote?: boolean;
};
export type LocalFarmRow = {
  id: string;
  record: Record<string, unknown>;
  syncState: "synced" | "pending" | "failed";
};
export type QueuedFarmChange = {
  operationId: string;
  uid: string;
  accountId: string;
  collectionName: FarmCollection;
  recordId: string;
  operation: SyncOperation;
  record: Record<string, unknown> | null;
  attempts: number;
  nextAttemptAt: number;
};

const DATABASE_VERSION = 2;
let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;
const observers = new Map<string, Set<() => void>>();
const syncObservers = new Map<string, Set<() => void>>();
const observerKey = (uid: string, accountId: string, collection: FarmCollection) => `${uid}:${accountId}:${collection}`;
const operationId = (uid: string, accountId: string, collection: string, recordId: string) => `${uid}:${accountId}:${collection}:${recordId}`;

async function migrate(database: SQLite.SQLiteDatabase) {
  await database.execAsync("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  const version = await database.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  const currentVersion = version?.user_version ?? 0;
  if (currentVersion < 1) {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS farm_records (
        uid TEXT NOT NULL,
        account_id TEXT NOT NULL,
        collection_name TEXT NOT NULL,
        record_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        sync_state TEXT NOT NULL DEFAULT 'synced',
        updated_at TEXT NOT NULL,
        PRIMARY KEY (uid, account_id, collection_name, record_id)
      );
      CREATE INDEX IF NOT EXISTS farm_records_account_collection
        ON farm_records(uid, account_id, collection_name, updated_at DESC);
      CREATE TABLE IF NOT EXISTS farm_sync_queue (
        operation_id TEXT PRIMARY KEY NOT NULL,
        uid TEXT NOT NULL,
        account_id TEXT NOT NULL,
        collection_name TEXT NOT NULL,
        record_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        payload TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        error_kind TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(uid, account_id, collection_name, record_id)
      );
      CREATE INDEX IF NOT EXISTS farm_sync_queue_account
        ON farm_sync_queue(uid, account_id, created_at);
      CREATE TABLE IF NOT EXISTS farm_sync_metadata (
        uid TEXT NOT NULL,
        account_id TEXT NOT NULL,
        last_synced_at TEXT,
        PRIMARY KEY(uid, account_id)
      );
      PRAGMA user_version = 1;
    `);
  }
  if (currentVersion < DATABASE_VERSION) {
    await database.execAsync(`
      CREATE INDEX IF NOT EXISTS farm_sales_batch_date
        ON farm_records(uid, account_id, collection_name, json_extract(payload, '$.batchId'), json_extract(payload, '$.date'));
      CREATE INDEX IF NOT EXISTS farm_sales_date
        ON farm_records(uid, account_id, collection_name, json_extract(payload, '$.date'));
      CREATE INDEX IF NOT EXISTS farm_sales_customer_date
        ON farm_records(uid, account_id, collection_name, json_extract(payload, '$.customerId'), json_extract(payload, '$.date'));
      CREATE INDEX IF NOT EXISTS farm_sales_category_date
        ON farm_records(uid, account_id, collection_name, json_extract(payload, '$.customerCategoryId'), json_extract(payload, '$.date'));
      CREATE INDEX IF NOT EXISTS farm_sales_method_date
        ON farm_records(uid, account_id, collection_name, json_extract(payload, '$.paymentMethodId'), json_extract(payload, '$.date'));
      CREATE INDEX IF NOT EXISTS farm_purchases_category_date
        ON farm_records(uid, account_id, collection_name, json_extract(payload, '$.category'), json_extract(payload, '$.date'));
      CREATE INDEX IF NOT EXISTS farm_purchases_date
        ON farm_records(uid, account_id, collection_name, json_extract(payload, '$.date'));
      CREATE INDEX IF NOT EXISTS farm_expenses_category_date
        ON farm_records(uid, account_id, collection_name, json_extract(payload, '$.category'), json_extract(payload, '$.date'));
      CREATE INDEX IF NOT EXISTS farm_expenses_date
        ON farm_records(uid, account_id, collection_name, json_extract(payload, '$.date'));
      CREATE INDEX IF NOT EXISTS farm_payments_date
        ON farm_records(uid, account_id, collection_name, json_extract(payload, '$.date'));
      CREATE INDEX IF NOT EXISTS farm_movements_item_date
        ON farm_records(uid, account_id, collection_name, json_extract(payload, '$.itemId'), json_extract(payload, '$.date'));
      PRAGMA user_version = ${DATABASE_VERSION};
    `);
  }
}

export function getFarmDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync("murimi-farm.db").then(async (database) => {
      await migrate(database);
      return database;
    }).catch((error) => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
}

async function inTransaction<T>(work: (database: SQLite.SQLiteDatabase) => Promise<T>): Promise<T> {
  const database = await getFarmDatabase();
  let result: T;
  if (Platform.OS === "web") {
    await database.withTransactionAsync(async () => { result = await work(database); });
  } else {
    await database.withExclusiveTransactionAsync(async (transaction) => { result = await work(transaction); });
  }
  return result!;
}

export async function getLocalFarmRecords<T extends Record<string, unknown>>(
  uid: string,
  accountId: string,
  collectionName: FarmCollection,
): Promise<(T & { id: string })[]> {
  const database = await getFarmDatabase();
  const rows = await database.getAllAsync<{ record_id: string; payload: string }>(
    "SELECT record_id, payload FROM farm_records WHERE uid = ? AND account_id = ? AND collection_name = ? ORDER BY updated_at DESC",
    uid, accountId, collectionName,
  );
  return rows.map((row) => ({ ...JSON.parse(row.payload) as T, id: row.record_id }));
}

export type FarmRecordFilter = {
  fromDate?: string;
  toDate?: string;
  batchId?: string;
  customerId?: string;
  customerCategoryId?: string;
  paymentMethodId?: string;
  category?: string;
  itemId?: string;
};

/** Reads structured JSON fields through whitelisted expressions backed by the additive v2 indexes. */
export async function queryLocalFarmRecords<T extends Record<string, unknown>>(
  uid: string, accountId: string, collectionName: FarmCollection, filter: FarmRecordFilter = {},
): Promise<(T & { id: string })[]> {
  const database = await getFarmDatabase();
  const clauses = ["uid = ?", "account_id = ?", "collection_name = ?"];
  const params: (string | number)[] = [uid, accountId, collectionName];
  const fields: (keyof FarmRecordFilter)[] = ["batchId", "customerId", "customerCategoryId", "paymentMethodId", "category", "itemId"];
  for (const field of fields) {
    const value = filter[field];
    if (value === undefined) continue;
    clauses.push(`json_extract(payload, '$.${field}') = ?`);
    params.push(value);
  }
  if (filter.fromDate) { clauses.push("json_extract(payload, '$.date') >= ?"); params.push(filter.fromDate); }
  if (filter.toDate) { clauses.push("json_extract(payload, '$.date') <= ?"); params.push(filter.toDate); }
  const rows = await database.getAllAsync<{ record_id: string; payload: string }>(
    `SELECT record_id, payload FROM farm_records WHERE ${clauses.join(" AND ")} ORDER BY json_extract(payload, '$.date') DESC, updated_at DESC`,
    ...params,
  );
  return rows.map((row) => ({ ...JSON.parse(row.payload) as T, id: row.record_id }));
}

export async function getLocalFarmRecord<T extends Record<string, unknown>>(
  uid: string, accountId: string, collectionName: FarmCollection, id: string,
): Promise<(T & { id: string }) | null> {
  const database = await getFarmDatabase();
  const row = await database.getFirstAsync<{ payload: string }>(
    "SELECT payload FROM farm_records WHERE uid = ? AND account_id = ? AND collection_name = ? AND record_id = ?",
    uid, accountId, collectionName, id,
  );
  return row ? { ...JSON.parse(row.payload) as T, id } : null;
}

export async function commitLocalFarmChanges(uid: string, accountId: string, changes: FarmChange[]): Promise<void> {
  await inTransaction(async (database) => {
    for (const change of changes) {
      const key = operationId(uid, accountId, change.collectionName, change.id);
      if (change.record === null) {
        await database.runAsync(
          "DELETE FROM farm_records WHERE uid = ? AND account_id = ? AND collection_name = ? AND record_id = ?",
          uid, accountId, change.collectionName, change.id,
        );
        await database.runAsync(
          `INSERT INTO farm_sync_queue (operation_id, uid, account_id, collection_name, record_id, operation, payload, attempts, next_attempt_at, last_error, error_kind, created_at)
           VALUES (?, ?, ?, ?, ?, 'delete', NULL, 0, 0, NULL, NULL, ?)
           ON CONFLICT(operation_id) DO UPDATE SET operation='delete', payload=NULL, attempts=0, next_attempt_at=0, last_error=NULL, error_kind=NULL`,
          key, uid, accountId, change.collectionName, change.id, new Date().toISOString(),
        );
        continue;
      }
      const payload = JSON.stringify(change.record);
      const updatedAt = String(change.record.updatedAt ?? new Date().toISOString());
      const pendingChange = change.queue !== false;
      await database.runAsync(
        `INSERT INTO farm_records (uid, account_id, collection_name, record_id, payload, sync_state, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(uid, account_id, collection_name, record_id) DO UPDATE SET payload=excluded.payload, sync_state=CASE WHEN EXISTS (SELECT 1 FROM farm_sync_queue WHERE uid=excluded.uid AND account_id=excluded.account_id AND collection_name=excluded.collection_name AND record_id=excluded.record_id) THEN 'pending' ELSE excluded.sync_state END, updated_at=excluded.updated_at`,
        uid, accountId, change.collectionName, change.id, payload, pendingChange || change.protectRemote ? "pending" : "synced", updatedAt,
      );
      if (!pendingChange) continue;
      await database.runAsync(
        `INSERT INTO farm_sync_queue (operation_id, uid, account_id, collection_name, record_id, operation, payload, attempts, next_attempt_at, last_error, error_kind, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, NULL, NULL, ?)
         ON CONFLICT(operation_id) DO UPDATE SET operation=excluded.operation, payload=excluded.payload, attempts=0, next_attempt_at=0, last_error=NULL, error_kind=NULL`,
        key, uid, accountId, change.collectionName, change.id, change.operation ?? "upsert", payload, new Date().toISOString(),
      );
    }
  });
  changes.forEach((change) => notifyLocalFarmChanges(uid, accountId, change.collectionName));
  notifyFarmSyncChanges(uid, accountId);
}

export async function saveRemoteFarmRecords(uid: string, accountId: string, collectionName: FarmCollection, records: Record<string, unknown>[], authoritative = false): Promise<void> {
  await inTransaction(async (database) => {
    const remoteIds = new Set(records.map((record) => String(record.id ?? "")).filter(Boolean));
    for (const record of records) {
      const id = String(record.id ?? "");
      if (!id) continue;
      const key = operationId(uid, accountId, collectionName, id);
      const hasPending = await database.getFirstAsync<{ operation_id: string }>("SELECT operation_id FROM farm_sync_queue WHERE operation_id = ?", key);
      const localRow = await database.getFirstAsync<{ sync_state: string }>("SELECT sync_state FROM farm_records WHERE uid=? AND account_id=? AND collection_name=? AND record_id=?", uid, accountId, collectionName, id);
      if (hasPending || localRow?.sync_state === "pending") continue;
      const payload = JSON.stringify(record);
      await database.runAsync(
        `INSERT INTO farm_records (uid, account_id, collection_name, record_id, payload, sync_state, updated_at)
         VALUES (?, ?, ?, ?, ?, 'synced', ?)
         ON CONFLICT(uid, account_id, collection_name, record_id) DO UPDATE SET payload=excluded.payload, sync_state='synced', updated_at=excluded.updated_at
         WHERE NOT EXISTS (SELECT 1 FROM farm_sync_queue WHERE operation_id = ?)
           AND farm_records.sync_state != 'pending'`,
        uid, accountId, collectionName, id, payload, String(record.updatedAt ?? new Date().toISOString()), key,
      );
    }
    if (authoritative) {
      const localRows = await database.getAllAsync<{ record_id: string; sync_state: string }>("SELECT record_id, sync_state FROM farm_records WHERE uid=? AND account_id=? AND collection_name=?", uid, accountId, collectionName);
      for (const local of localRows) {
        if (remoteIds.has(local.record_id) || local.sync_state === "pending") continue;
        const key = operationId(uid, accountId, collectionName, local.record_id);
        const queued = await database.getFirstAsync<{ operation_id: string }>("SELECT operation_id FROM farm_sync_queue WHERE operation_id=?", key);
        if (!queued) await database.runAsync("DELETE FROM farm_records WHERE uid=? AND account_id=? AND collection_name=? AND record_id=?", uid, accountId, collectionName, local.record_id);
      }
    }
  });
  notifyLocalFarmChanges(uid, accountId, collectionName);
  notifyFarmSyncChanges(uid, accountId);
}

export async function setLocalFarmRecordSynced(uid: string, accountId: string, collectionName: FarmCollection, id: string, record?: Record<string, unknown>): Promise<void> {
  const key = operationId(uid, accountId, collectionName, id);
  await inTransaction(async (database) => {
    await database.runAsync("DELETE FROM farm_sync_queue WHERE operation_id = ?", key);
    if (record) {
      await database.runAsync(
        "INSERT INTO farm_records (uid, account_id, collection_name, record_id, payload, sync_state, updated_at) VALUES (?, ?, ?, ?, ?, 'synced', ?) ON CONFLICT(uid, account_id, collection_name, record_id) DO UPDATE SET payload=excluded.payload, sync_state='synced', updated_at=excluded.updated_at",
        uid, accountId, collectionName, id, JSON.stringify(record), String(record.updatedAt ?? new Date().toISOString()),
      );
    } else {
      await database.runAsync("UPDATE farm_records SET sync_state='synced' WHERE uid=? AND account_id=? AND collection_name=? AND record_id=?", uid, accountId, collectionName, id);
    }
  });
  notifyLocalFarmChanges(uid, accountId, collectionName);
  notifyFarmSyncChanges(uid, accountId);
}

export async function getDueFarmChanges(uid: string, accountId: string, force = false): Promise<QueuedFarmChange[]> {
  const database = await getFarmDatabase();
  const rows = await database.getAllAsync<{ operation_id: string; uid: string; account_id: string; collection_name: FarmCollection; record_id: string; operation: SyncOperation; payload: string | null; attempts: number; next_attempt_at: number }>(
    `SELECT * FROM farm_sync_queue WHERE uid = ? AND account_id = ? ${force ? "" : "AND next_attempt_at <= ?"} ORDER BY created_at ASC, rowid ASC LIMIT 50`,
    ...(force ? [uid, accountId] : [uid, accountId, Date.now()]),
  );
  return rows.map((row) => ({ operationId: row.operation_id, uid: row.uid, accountId: row.account_id, collectionName: row.collection_name, recordId: row.record_id, operation: row.operation, record: row.payload ? JSON.parse(row.payload) : null, attempts: row.attempts, nextAttemptAt: row.next_attempt_at }));
}

export async function recordFarmSyncFailure(operationIdValue: string, message: string, errorKind: string): Promise<void> {
  const database = await getFarmDatabase();
  const row = await database.getFirstAsync<{ attempts: number }>("SELECT attempts FROM farm_sync_queue WHERE operation_id = ?", operationIdValue);
  if (!row) return;
  const attempts = row.attempts + 1;
  const retryDelay = Math.min(60 * 60 * 1000, 5000 * (2 ** Math.min(attempts - 1, 9)));
  await database.runAsync("UPDATE farm_sync_queue SET attempts=?, next_attempt_at=?, last_error=?, error_kind=? WHERE operation_id=?", attempts, Date.now() + retryDelay, message.slice(0, 300), errorKind, operationIdValue);
  const rowOwner = await database.getFirstAsync<{ uid: string; account_id: string }>("SELECT uid, account_id FROM farm_sync_queue WHERE operation_id = ?", operationIdValue);
  if (rowOwner) notifyFarmSyncChanges(rowOwner.uid, rowOwner.account_id);
}

export async function getFarmSyncSummary(uid: string, accountId: string) {
  const database = await getFarmDatabase();
  const pending = await database.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM farm_sync_queue WHERE uid=? AND account_id=?", uid, accountId);
  const failed = await database.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM farm_sync_queue WHERE uid=? AND account_id=? AND last_error IS NOT NULL", uid, accountId);
  const lastSync = await database.getFirstAsync<{ last_synced_at: string | null }>("SELECT last_synced_at FROM farm_sync_metadata WHERE uid=? AND account_id=?", uid, accountId);
  return { pendingCount: pending?.count ?? 0, failedCount: failed?.count ?? 0, lastSyncedAt: lastSync?.last_synced_at ?? null };
}

export async function setFarmLastSyncedAt(uid: string, accountId: string): Promise<void> {
  const database = await getFarmDatabase(); const now = new Date().toISOString();
  await database.runAsync("INSERT INTO farm_sync_metadata (uid, account_id, last_synced_at) VALUES (?, ?, ?) ON CONFLICT(uid, account_id) DO UPDATE SET last_synced_at=excluded.last_synced_at", uid, accountId, now);
  notifyFarmSyncChanges(uid, accountId);
}

export function subscribeLocalFarmChanges(uid: string, accountId: string, collectionName: FarmCollection, callback: () => void): () => void {
  const key = observerKey(uid, accountId, collectionName); const group = observers.get(key) ?? new Set<() => void>(); group.add(callback); observers.set(key, group);
  return () => { group.delete(callback); if (!group.size) observers.delete(key); };
}

export function notifyLocalFarmChanges(uid: string, accountId: string, collectionName: FarmCollection): void {
  observers.get(observerKey(uid, accountId, collectionName))?.forEach((callback) => callback());
}

export function subscribeFarmSyncChanges(uid: string, accountId: string, callback: () => void): () => void {
  const key = `${uid}:${accountId}`; const group = syncObservers.get(key) ?? new Set<() => void>(); group.add(callback); syncObservers.set(key, group);
  return () => { group.delete(callback); if (!group.size) syncObservers.delete(key); };
}

export function notifyFarmSyncChanges(uid: string, accountId: string): void {
  syncObservers.get(`${uid}:${accountId}`)?.forEach((callback) => callback());
}

export async function deleteLocalFarmRecord(uid: string, accountId: string, collectionName: FarmCollection, id: string): Promise<void> {
  await commitLocalFarmChanges(uid, accountId, [{ collectionName, id, record: null, operation: "delete" }]);
}

