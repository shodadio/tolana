import Dexie, { type Table } from "dexie";

/** Live database name. */
export const DB_NAME = "tolana_local_db";

/** Pre-rename database; read once, then deleted. */
export const LEGACY_DB_NAME = "talanoa_local_db";

export interface Thread {
  id: string;
  snippet: string;
  senderName: string;
  senderEmail: string;
  lastMessageTimestamp: number;
  unreadCount: number;
  subject: string;
}

export type MessageStatus = "sending" | "sent" | "failed";

export interface Message {
  id: string;
  threadId: string;
  senderName: string;
  senderEmail: string;
  cleanBody: string;
  timestamp: number;
  isFromMe: boolean;
  status?: MessageStatus;
}

export interface SyncState {
  key: string;
  lastHistoryId?: string;
  lastSyncTimestamp?: number;
}

const SCHEMA = {
  threads: "id, lastMessageTimestamp, senderEmail",
  messages: "id, threadId, timestamp, [threadId+timestamp]",
  syncState: "key",
};

/**
 * Local-first cache for the messenger: threads and messages are mirrored from
 * Gmail into IndexedDB so the UI can render offline and merge sync results.
 */
export class TolanaDB extends Dexie {
  threads!: Table<Thread, string>;
  messages!: Table<Message, string>;
  syncState!: Table<SyncState, string>;

  constructor() {
    super(DB_NAME);
    this.version(1).stores(SCHEMA);
  }
}

/** Read-only handle on the pre-rename database, used only by the migration. */
class LegacyTalanoaDB extends Dexie {
  threads!: Table<Thread, string>;
  messages!: Table<Message, string>;
  syncState!: Table<SyncState, string>;

  constructor() {
    super(LEGACY_DB_NAME);
    this.version(1).stores(SCHEMA);
  }
}

/**
 * Dexie does not touch indexedDB until a transaction is opened, so creating the
 * instance at module scope is safe during server rendering (client components
 * are also evaluated on the server). Reads and writes must still only happen in
 * the browser. The global cache keeps Fast Refresh from piling up instances
 * against the same database name.
 */
const globalForDb = globalThis as typeof globalThis & {
  __tolanaDb?: TolanaDB;
};

export const db: TolanaDB = globalForDb.__tolanaDb ?? new TolanaDB();

if (process.env.NODE_ENV !== "production") {
  globalForDb.__tolanaDb = db;
}

/** `indexedDB.databases()` is missing on older iOS Safari and Firefox. */
function legacyDatabaseExists(name: string): Promise<boolean> {
  if (!("databases" in indexedDB)) {
    // Opening without a version would create the database, so abort the upgrade
    // to learn that it was not there.
    return new Promise((resolve) => {
      const request = indexedDB.open(name);

      request.onupgradeneeded = () => {
        request.transaction?.abort();
      };
      // Aborting the upgrade fires `error` on the request, so both the
      // "cannot open" and "did not exist" paths resolve false here.
      request.onerror = () => resolve(false);
      request.onsuccess = () => {
        request.result.close();
        resolve(true);
      };
    });
  }

  return indexedDB
    .databases()
    .then((databases) => databases.some((database) => database.name === name))
    .catch(() => false);
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);

    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => {
      console.warn(
        `Could not delete ${name}: another tab still has it open. It will be retried on the next load.`,
      );
      resolve();
    };
  });
}

/**
 * Copies records out of the legacy database and deletes it. The copy only
 * happens while the target is still empty, so a database that has already been
 * used is never overwritten with stale rows. On failure the legacy database is
 * kept so the migration can retry on the next load.
 */
async function copyLegacyData(): Promise<void> {
  if (!(await legacyDatabaseExists(LEGACY_DB_NAME))) {
    return;
  }

  const legacy = new LegacyTalanoaDB();

  try {
    await legacy.open();

    const snapshot = await legacy.transaction(
      "r",
      legacy.threads,
      legacy.messages,
      legacy.syncState,
      async () => ({
        threads: await legacy.threads.toArray(),
        messages: await legacy.messages.toArray(),
        syncState: await legacy.syncState.toArray(),
      }),
    );

    const legacyIsEmpty =
      snapshot.threads.length === 0 &&
      snapshot.messages.length === 0 &&
      snapshot.syncState.length === 0;

    const targetCount =
      (await db.threads.count()) +
      (await db.messages.count()) +
      (await db.syncState.count());

    if (!legacyIsEmpty && targetCount === 0) {
      await db.transaction(
        "rw",
        db.threads,
        db.messages,
        db.syncState,
        async () => {
          await db.threads.bulkPut(snapshot.threads);
          await db.messages.bulkPut(snapshot.messages);
          await db.syncState.bulkPut(snapshot.syncState);
        },
      );
    }
  } catch (error) {
    console.error(
      `Could not migrate ${LEGACY_DB_NAME}; keeping it for a later attempt.`,
      error,
    );
    return;
  } finally {
    legacy.close();
  }

  await deleteDatabase(LEGACY_DB_NAME);
}

let pendingMigration: Promise<void> | null = null;

/**
 * One-time move of local data from `talanoa_local_db` to `tolana_local_db`.
 * Safe to call from anywhere: the work is shared and runs at most once per
 * session. Resolves immediately outside the browser.
 */
export function migrateLegacyDatabase(): Promise<void> {
  if (typeof indexedDB === "undefined") {
    return Promise.resolve();
  }

  if (!pendingMigration) {
    pendingMigration = copyLegacyData().catch((error) => {
      console.error("Local database migration failed:", error);
    });
  }

  return pendingMigration;
}
