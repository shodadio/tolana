import type { NextRequest } from "next/server";

import { auth } from "@/auth";
import { gmailErrorResponse, gmailFetch, jsonResponse } from "@/lib/server/gmail";

interface ReadRequestBody {
  threadId?: string;
}

/**
 * Clears the UNREAD label on a thread. Gmail is the source of truth: the client
 * updates Dexie first and calls this in the background.
 */
export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.accessToken) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  let payload: ReadRequestBody;

  try {
    payload = (await request.json()) as ReadRequestBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const threadId = payload.threadId?.trim();

  if (!threadId) {
    return jsonResponse({ error: "threadId is required" }, 400);
  }

  try {
    await gmailFetch(
      `threads/${encodeURIComponent(threadId)}/modify`,
      session.accessToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
      },
    );

    return jsonResponse({ ok: true });
  } catch (error) {
    return gmailErrorResponse(error, "Failed to mark thread as read");
  }
}
