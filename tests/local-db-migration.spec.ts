import { expect, test, type Page } from "@playwright/test";

const LEGACY_DB = "talanoa_local_db";
const CURRENT_DB = "tolana_local_db";
const HISTORY_ID = "424242";

interface ThreadRow {
  id: string;
  snippet: string;
  senderName: string;
  senderEmail: string;
  lastMessageTimestamp: number;
  unreadCount: number;
  subject: string;
}

interface MessageRow {
  id: string;
  threadId: string;
  cleanBody: string;
  timestamp: number;
  isFromMe: boolean;
}

interface Snapshot {
  databaseNames: string[];
  threadIds: string[];
  threads: ThreadRow[];
  messages: MessageRow[];
  syncState: { key: string; lastHistoryId?: string } | null;
}

/**
 * Creates the pre-rename database by hand, exactly as the previous version of
 * the app left it on disk. Done with the raw API so the seeding does not depend
 * on the app's own (now migrated) code path.
 */
async function seedLegacyDatabase(
  page: Page,
  options: { threadId: string; subject: string },
): Promise<void> {
  await page.evaluate(
    async ({ dbName, threadId, subject, historyId }) => {
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open(dbName, 1);

        open.onupgradeneeded = () => {
          const database = open.result;
          const threads = database.createObjectStore("threads", {
            keyPath: "id",
          });
          threads.createIndex("lastMessageTimestamp", "lastMessageTimestamp");
          threads.createIndex("senderEmail", "senderEmail");

          const messages = database.createObjectStore("messages", {
            keyPath: "id",
          });
          messages.createIndex("threadId", "threadId");
          messages.createIndex("timestamp", "timestamp");
          messages.createIndex("[threadId+timestamp]", [
            "threadId",
            "timestamp",
          ]);

          database.createObjectStore("syncState", { keyPath: "key" });
        };

        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const database = open.result;
          const transaction = database.transaction(
            ["threads", "messages", "syncState"],
            "readwrite",
          );

          transaction.objectStore("threads").put({
            id: threadId,
            snippet: "Hello there",
            senderName: "Ana Ruiz",
            senderEmail: "ana@example.com",
            lastMessageTimestamp: 1_700_000_000_000,
            unreadCount: 2,
            subject,
          });

          transaction.objectStore("messages").put({
            id: `${threadId}-message`,
            threadId,
            senderName: "Ana Ruiz",
            senderEmail: "ana@example.com",
            cleanBody: "Hello there",
            timestamp: 1_700_000_000_000,
            isFromMe: false,
            status: "sent",
          });

          transaction.objectStore("syncState").put({
            key: "gmail_sync",
            lastHistoryId: historyId,
            lastSyncTimestamp: 1_700_000_000_000,
          });

          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      });
    },
    {
      dbName: LEGACY_DB,
      threadId: options.threadId,
      subject: options.subject,
      historyId: HISTORY_ID,
    },
  );
}

/** Reads both database names and the renamed database's contents from the page. */
async function readSnapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(async (currentDb) => {
    const databaseNames = (await indexedDB.databases())
      .map((database) => database.name)
      .filter((name): name is string => Boolean(name));

    const empty = {
      databaseNames,
      threadIds: [],
      threads: [],
      messages: [],
      syncState: null,
    };

    if (!databaseNames.includes(currentDb)) {
      return empty;
    }

    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(currentDb);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const getAll = <T,>(storeName: string): Promise<T[]> =>
      new Promise((resolve, reject) => {
        const request = database
          .transaction(storeName)
          .objectStore(storeName)
          .getAll();
        request.onsuccess = () => resolve(request.result as T[]);
        request.onerror = () => reject(request.error);
      });

    const threads = await getAll<{
      id: string;
      snippet: string;
      senderName: string;
      senderEmail: string;
      lastMessageTimestamp: number;
      unreadCount: number;
      subject: string;
    }>("threads");
    const messages = await getAll<{
      id: string;
      threadId: string;
      cleanBody: string;
      timestamp: number;
      isFromMe: boolean;
    }>("messages");
    const syncState = await new Promise<{ key: string; lastHistoryId?: string } | null>(
      (resolve, reject) => {
        const request = database
          .transaction("syncState")
          .objectStore("syncState")
          .get("gmail_sync");
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error);
      },
    );

    database.close();

    return {
      databaseNames,
      threadIds: threads.map((thread) => thread.id),
      threads,
      messages,
      syncState,
    };
  }, CURRENT_DB);
}

test.describe("local database rename migration", () => {
  test("copies pre-rename data into the renamed database and deletes the old one", async ({
    page,
  }) => {
    await page.goto("/");

    // Booting with no legacy data creates nothing.
    expect((await readSnapshot(page)).databaseNames).not.toContain(LEGACY_DB);

    await seedLegacyDatabase(page, {
      threadId: "legacy-thread-1",
      subject: "Deck review",
    });

    await page.reload();

    await expect
      .poll(async () => (await readSnapshot(page)).databaseNames, {
        message: "legacy database should be deleted after migration",
        timeout: 15_000,
      })
      .not.toContain(LEGACY_DB);

    const after = await readSnapshot(page);

    expect(after.databaseNames).toContain(CURRENT_DB);
    expect(after.threads).toEqual([
      expect.objectContaining({
        id: "legacy-thread-1",
        subject: "Deck review",
        unreadCount: 2,
      }),
    ]);
    expect(after.messages).toEqual([
      expect.objectContaining({
        id: "legacy-thread-1-message",
        threadId: "legacy-thread-1",
        cleanBody: "Hello there",
      }),
    ]);
    // The history id has to survive, otherwise the app re-downloads the inbox.
    expect(after.syncState).toEqual(
      expect.objectContaining({ key: "gmail_sync", lastHistoryId: HISTORY_ID }),
    );
  });

  test("never overwrites a database that already holds data, and still removes the old one", async ({
    page,
  }) => {
    await page.goto("/");

    await seedLegacyDatabase(page, {
      threadId: "thread-from-old-app",
      subject: "Old conversation",
    });
    await page.reload();

    await expect
      .poll(async () => (await readSnapshot(page)).databaseNames, {
        timeout: 15_000,
      })
      .not.toContain(LEGACY_DB);

    const migrated = await readSnapshot(page);
    expect(migrated.threadIds).toEqual(["thread-from-old-app"]);

    // A stale legacy database turns up again after the new one is in use.
    await seedLegacyDatabase(page, {
      threadId: "stale-thread",
      subject: "Stale conversation",
    });
    await page.reload();

    await expect
      .poll(async () => (await readSnapshot(page)).databaseNames, {
        message: "legacy database should be removed even when its data is skipped",
        timeout: 15_000,
      })
      .not.toContain(LEGACY_DB);

    const after = await readSnapshot(page);

    expect(after.threadIds).toEqual(["thread-from-old-app"]);
    expect(after.threadIds).not.toContain("stale-thread");
    expect(after.messages).toHaveLength(1);
  });
});
