import type { NextRequest } from "next/server";

import { auth } from "@/auth";
import {
  GmailApiError,
  gmailErrorResponse,
  gmailFetch,
  jsonResponse,
  toStoredThread,
  type GmailHistoryResponse,
  type GmailMessage,
} from "@/lib/server/gmail";
import type { Message, Thread } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.accessToken) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const startHistoryId = request.nextUrl.searchParams.get("startHistoryId");

  if (!startHistoryId) {
    return jsonResponse(
      { error: "startHistoryId query parameter is required" },
      400,
    );
  }

  const accessToken = session.accessToken;
  const viewerEmail = session.user?.email ?? null;

  try {
    const history = await gmailFetch<GmailHistoryResponse>(
      `history?startHistoryId=${encodeURIComponent(startHistoryId)}`,
      accessToken,
    );

    const addedIds = new Set<string>();

    for (const record of history.history ?? []) {
      for (const added of record.messagesAdded ?? []) {
        const id = added.message?.id;

        if (id) {
          addedIds.add(id);
        }
      }
    }

    const fetched = await Promise.all(
      [...addedIds].map((id) =>
        gmailFetch<GmailMessage>(
          `messages/${encodeURIComponent(id)}?format=full`,
          accessToken,
        ),
      ),
    );

    const byThread = new Map<string, GmailMessage[]>();

    for (const message of fetched) {
      const threadId = message.threadId;

      if (!threadId) {
        continue;
      }

      byThread.set(threadId, [...(byThread.get(threadId) ?? []), message]);
    }

    const newMessages: Message[] = [];
    const updatedThreads: Thread[] = [];

    for (const [threadId, threadMessages] of byThread) {
      const stored = toStoredThread(
        threadId,
        null,
        threadMessages,
        viewerEmail,
      );

      newMessages.push(...stored.messages);
      updatedThreads.push(stored.thread);
    }

    return jsonResponse({
      newMessages,
      updatedThreads,
      newHistoryId: history.historyId ?? startHistoryId,
    });
  } catch (error) {
    // Gmail expires history ids it no longer retains; the client must re-bootstrap.
    if (error instanceof GmailApiError && error.status === 404) {
      return jsonResponse({
        resetRequired: true,
        newMessages: [],
        updatedThreads: [],
        newHistoryId: startHistoryId,
      });
    }

    return gmailErrorResponse(error, "Failed to fetch mailbox changes");
  }
}
