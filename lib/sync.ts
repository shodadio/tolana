import {
  db,
  migrateLegacyDatabase,
  type Message,
  type Thread,
} from "@/lib/db";
import {
  findShadowedPending,
  pickThreadUpdate,
  selectStaleThreadIds,
} from "@/lib/sync-merge";
import { publishSync } from "@/lib/sync-store";

export const SYNC_STATE_KEY = "gmail_sync";

export type SyncOutcome =
  | { kind: "bootstrap" }
  | { kind: "delta" }
  | { kind: "unauthorized" }
  | { kind: "error"; message: string };

interface BootstrapPayload {
  threads: Thread[];
  messages: Message[];
  historyId: string;
}

interface DeltaPayload {
  newMessages: Message[];
  updatedThreads: Thread[];
  newHistoryId: string;
  resetRequired?: boolean;
}

let activeSync: Promise<SyncOutcome> | null = null;

async function parseJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function wipeLocalMailbox(): Promise<void> {
  await db.transaction("rw", db.threads, db.messages, async () => {
    await db.messages.clear();
    await db.threads.clear();
  });
}

/**
 * Writes the full inbox snapshot. Threads Gmail no longer returns (and their
 * messages) are removed, which also clears the sample conversations.
 */
async function applyBootstrap(payload: BootstrapPayload): Promise<void> {
  await db.transaction(
    "rw",
    db.threads,
    db.messages,
    db.syncState,
    async () => {
      const existingIds = (await db.threads
        .toCollection()
        .primaryKeys()) as string[];
      const staleIds = selectStaleThreadIds(
        existingIds,
        payload.threads.map((thread) => thread.id),
      );

      if (staleIds.length > 0) {
        await db.messages.where("threadId").anyOf(staleIds).delete();
        await db.threads.bulkDelete(staleIds);
      }

      await db.threads.bulkPut(payload.threads);
      await db.messages.bulkPut(payload.messages);
      await db.syncState.put({
        key: SYNC_STATE_KEY,
        lastHistoryId: payload.historyId,
        lastSyncTimestamp: Date.now(),
      });
    },
  );
}

async function applyDelta(payload: DeltaPayload): Promise<void> {
  await db.transaction(
    "rw",
    db.threads,
    db.messages,
    db.syncState,
    async () => {
      for (const message of payload.newMessages) {
        const threadMessages = await db.messages
          .where("threadId")
          .equals(message.threadId)
          .toArray();
        const shadowedIds = findShadowedPending(threadMessages, message);

        if (shadowedIds.length > 0) {
          await db.messages.bulkDelete(shadowedIds);
        }
      }

      await db.messages.bulkPut(payload.newMessages);

      for (const thread of payload.updatedThreads) {
        const existing = await db.threads.get(thread.id);
        await db.threads.put(pickThreadUpdate(existing, thread));
      }

      await db.syncState.put({
        key: SYNC_STATE_KEY,
        lastHistoryId: payload.newHistoryId,
        lastSyncTimestamp: Date.now(),
      });
    },
  );
}

async function bootstrap(): Promise<SyncOutcome> {
  const response = await fetch("/api/gmail/bootstrap", { cache: "no-store" });

  if (response.status === 401) {
    return { kind: "unauthorized" };
  }

  const payload = await parseJson<BootstrapPayload>(response);

  if (!response.ok || !payload) {
    throw new Error(`Bootstrap failed with status ${response.status}`);
  }

  await applyBootstrap(payload);

  return { kind: "bootstrap" };
}

async function executeSync(): Promise<SyncOutcome> {
  try {
    // Make sure pre-rename local data is in place before touching sync state.
    await migrateLegacyDatabase();

    const state = await db.syncState.get(SYNC_STATE_KEY);
    const startHistoryId = state?.lastHistoryId;

    if (!startHistoryId) {
      return await bootstrap();
    }

    const response = await fetch(
      `/api/gmail/delta?startHistoryId=${encodeURIComponent(startHistoryId)}`,
      { cache: "no-store" },
    );

    if (response.status === 401) {
      return { kind: "unauthorized" };
    }

    const payload = await parseJson<DeltaPayload>(response);

    if (!response.ok || !payload) {
      throw new Error(`Delta sync failed with status ${response.status}`);
    }

    // Gmail dropped the history window: clear the cache and rebuild from scratch.
    if (payload.resetRequired) {
      await wipeLocalMailbox();
      return await bootstrap();
    }

    await applyDelta(payload);

    return { kind: "delta" };
  } catch (error) {
    console.error("Mailbox sync failed:", error);

    return {
      kind: "error",
      message: error instanceof Error ? error.message : "Sync failed",
    };
  }
}

/**
 * Runs one sync pass: delta when a history id is stored, otherwise a bootstrap.
 * Concurrent callers share the in-flight pass so an interval tick and a manual
 * tap cannot stack requests. Status is published for the header control.
 */
export function runSync(): Promise<SyncOutcome> {
  if (!activeSync) {
    publishSync({ status: "syncing" });

    activeSync = executeSync()
      .then((outcome) => {
        if (outcome.kind === "unauthorized") {
          publishSync({ status: "unauthorized" });
        } else if (outcome.kind === "error") {
          publishSync({ status: "error" });
        } else {
          publishSync({ status: "ok", lastSyncedAt: Date.now() });
        }

        return outcome;
      })
      .finally(() => {
        activeSync = null;
      });
  }

  return activeSync;
}

export async function getSyncState(): Promise<{
  lastHistoryId?: string;
  lastSyncTimestamp?: number;
} | null> {
  const state = await db.syncState.get(SYNC_STATE_KEY);
  return state ?? null;
}
