import { auth } from "@/auth";
import {
  gmailErrorResponse,
  gmailFetch,
  jsonResponse,
  toStoredThread,
  type GmailThreadList,
  type GmailThread,
} from "@/lib/server/gmail";
import type { Message, Thread } from "@/lib/db";

const INBOX_THREAD_LIMIT = 20;

export async function GET() {
  const session = await auth();

  if (!session?.accessToken) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const accessToken = session.accessToken;
  const viewerEmail = session.user?.email ?? null;

  try {
    const list = await gmailFetch<GmailThreadList>(
      `threads?q=${encodeURIComponent("in:inbox")}&maxResults=${INBOX_THREAD_LIMIT}`,
      accessToken,
    );

    const threadIds = (list.threads ?? [])
      .map((thread) => thread.id)
      .filter((id): id is string => Boolean(id));

    const fullThreads = await Promise.all(
      threadIds.map((id) =>
        gmailFetch<GmailThread>(
          `threads/${encodeURIComponent(id)}?format=full`,
          accessToken,
        ),
      ),
    );

    const threads: Thread[] = [];
    const messages: Message[] = [];

    for (const thread of fullThreads) {
      const id = thread.id;

      if (!id) {
        continue;
      }

      const stored = toStoredThread(
        id,
        thread.snippet,
        thread.messages ?? [],
        viewerEmail,
      );

      threads.push(stored.thread);
      messages.push(...stored.messages);
    }

    const profile = await gmailFetch<{ historyId?: string | null }>(
      "profile",
      accessToken,
    );

    return jsonResponse({
      threads,
      messages,
      historyId: profile.historyId ?? "",
    });
  } catch (error) {
    return gmailErrorResponse(error, "Failed to bootstrap mailbox");
  }
}
