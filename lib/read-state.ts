import { db } from "@/lib/db";
import { publishSync } from "@/lib/sync-store";

/**
 * Marks a thread read on this device first, then clears the UNREAD label in
 * Gmail in the background. A rejected token means the grant is gone, so the
 * optimistic state is kept and the shell shows the reconnect banner; any other
 * failure restores the unread count so the badge keeps telling the truth.
 */
export async function markThreadRead(threadId: string): Promise<void> {
  const thread = await db.threads.get(threadId);

  if (!thread || thread.unreadCount === 0) {
    return;
  }

  const previousUnread = thread.unreadCount;

  await db.threads.update(threadId, { unreadCount: 0 });

  try {
    const response = await fetch("/api/gmail/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId }),
      cache: "no-store",
    });

    if (response.status === 401) {
      publishSync({ status: "unauthorized" });
      return;
    }

    if (!response.ok) {
      throw new Error(`Mark-as-read failed with status ${response.status}`);
    }
  } catch (error) {
    console.error("Could not mark thread as read in Gmail:", error);
    await db.threads.update(threadId, { unreadCount: previousUnread });
  }
}
