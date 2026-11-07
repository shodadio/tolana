"use client";

import { useSyncExternalStore } from "react";

export type SyncStatus = "idle" | "syncing" | "ok" | "error" | "unauthorized";

export interface SyncSnapshot {
  status: SyncStatus;
  lastSyncedAt: number | null;
}

const IDLE_SNAPSHOT: SyncSnapshot = { status: "idle", lastSyncedAt: null };

let snapshot: SyncSnapshot = IDLE_SNAPSHOT;
const listeners = new Set<() => void>();

export function getSyncSnapshot(): SyncSnapshot {
  return snapshot;
}

export function getServerSyncSnapshot(): SyncSnapshot {
  return IDLE_SNAPSHOT;
}

export function subscribeToSync(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function publishSync(patch: Partial<SyncSnapshot>): void {
  snapshot = { ...snapshot, ...patch };

  for (const listener of listeners) {
    listener();
  }
}

/** Sync state shared by the engine and the header control. */
export function useSyncSnapshot(): SyncSnapshot {
  return useSyncExternalStore(
    subscribeToSync,
    getSyncSnapshot,
    getServerSyncSnapshot,
  );
}
