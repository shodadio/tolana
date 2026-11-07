import type { Message, Thread } from "@/lib/db";

const PENDING_ID_PREFIX = "pending-";

/** A pending send and the same message returning from Gmail land within seconds. */
const SHADOW_WINDOW_MS = 15_000;

/**
 * Threads removed from the inbox snapshot. Bootstrap only fetches the newest
 * page of the inbox, so anything no longer in that set is dropped locally to
 * keep the cache consistent with what Gmail returned (this also clears the
 * sample conversations).
 */
export function selectStaleThreadIds(
  existingIds: string[],
  incomingIds: string[],
): string[] {
  const keep = new Set(incomingIds);

  return existingIds.filter((id) => !keep.has(id));
}

/**
 * Delta responses carry thread rows built from only the messages that changed,
 * so their unread counts can be lower than what is already stored. Keep the
 * newer row's content but never lose unread state.
 */
export function pickThreadUpdate(
  existing: Thread | undefined,
  incoming: Thread,
): Thread {
  if (!existing) {
    return incoming;
  }

  const base =
    incoming.lastMessageTimestamp >= existing.lastMessageTimestamp
      ? incoming
      : existing;

  return {
    ...base,
    unreadCount: Math.max(existing.unreadCount, incoming.unreadCount),
  };
}

/**
 * Local ids of optimistic rows superseded by a message just fetched from Gmail,
 * so a send does not appear twice once delta sync returns it.
 */
export function findShadowedPending(
  candidates: Message[],
  incoming: Message,
): string[] {
  return candidates
    .filter(
      (candidate) =>
        candidate.id.startsWith(PENDING_ID_PREFIX) &&
        candidate.isFromMe &&
        incoming.isFromMe &&
        candidate.threadId === incoming.threadId &&
        candidate.cleanBody === incoming.cleanBody &&
        Math.abs(candidate.timestamp - incoming.timestamp) <= SHADOW_WINDOW_MS,
    )
    .map((candidate) => candidate.id);
}
